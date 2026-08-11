/**
 * Persistent Blender daemon client — one Blender process, many jobs.
 */
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

class PersistentBlenderDaemon {
  constructor(opts = {}) {
    this.blenderBin = opts.blenderBin || process.env.BLENDER_BIN || 'blender';
    this.repoRoot = opts.repoRoot || process.env.REPO_ROOT || path.resolve(__dirname, '../../..');
    this.script = path.join(this.repoRoot, 'scripts/blender/persistent_daemon.py');
    this.proc = null;
    this.pending = [];
    this.ready = false;
    this.startups = 0;
    this.jobsHandled = 0;
    this.corrupt = false;
  }

  async start() {
    if (this.proc && !this.corrupt) return;
    await this.stop();
    this.corrupt = false;
    this.startups += 1;
    this.proc = spawn(this.blenderBin, ['--background', '--factory-startup', '--python', this.script], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => {
      if (!line.startsWith('DDP_DAEMON:')) return;
      let msg;
      try {
        msg = JSON.parse(line.slice('DDP_DAEMON:'.length));
      } catch {
        return;
      }
      if (msg.status === 'ready') {
        this.ready = true;
      }
      const waiter = this.pending.shift();
      if (waiter) waiter.resolve(msg);
    });
    this.proc.on('exit', (code) => {
      this.ready = false;
      this.proc = null;
      if (code !== 0) this.corrupt = true;
      while (this.pending.length) {
        this.pending.shift().reject(new Error(`Blender daemon exited code ${code}`));
      }
    });
    // wait for ready
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Blender daemon ready timeout')), 90_000);
      const check = () => {
        if (this.ready) {
          clearTimeout(t);
          resolve();
        } else if (!this.proc) {
          clearTimeout(t);
          reject(new Error('Blender daemon failed to start'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  send(cmd) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.proc || this.corrupt) await this.start();
        this.pending.push({ resolve, reject });
        this.proc.stdin.write(JSON.stringify(cmd) + '\n');
      } catch (e) {
        reject(e);
      }
    });
  }

  async render(job) {
    const res = await this.send({ cmd: 'render', job });
    if (res.status !== 'ok') {
      this.corrupt = true;
      throw new Error(res.error || 'daemon render failed');
    }
    this.jobsHandled += 1;
    return res.result;
  }

  async ping() {
    return this.send({ cmd: 'ping' });
  }

  async stop() {
    if (!this.proc) return;
    try {
      this.proc.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n');
    } catch {
      /* ignore */
    }
    try {
      this.proc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.proc = null;
    this.ready = false;
  }

  stats() {
    return {
      startups: this.startups,
      jobsHandled: this.jobsHandled,
      alive: Boolean(this.proc),
      corrupt: this.corrupt,
    };
  }
}

module.exports = { PersistentBlenderDaemon };
