/**
 * Assemble completed shot renders + dialogue into a final episode MP4.
 * Invoked after Blender worker finishes FINAL_1080P jobs for Meadow Map Mystery.
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@doodle-dash/database';
import { VERTICAL_SLICE_EPISODE_ID, ProductionStorageService } from '@doodle-dash/production';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const ROOT = path.resolve(__dirname, '../../..');
const OUT_ROOT = path.join(ROOT, 'artifacts', 'episodes', 'meadow-map-mystery');

async function downloadUri(uri: string, dest: string) {
  mkdirSync(path.dirname(dest), { recursive: true });
  if (uri.startsWith('local://')) {
    const src = path.join(ROOT, '.doodle-dash-storage', uri.slice('local://'.length));
    await fs.copyFile(src, dest);
    return;
  }
  if (uri.startsWith('s3://') || uri.includes('127.0.0.1:9000')) {
    const bucket = process.env.OBJECT_STORAGE_BUCKET || 'doodle-dash-production';
    let key = uri;
    if (uri.startsWith('s3://')) {
      const without = uri.slice(5);
      key = without.slice(without.indexOf('/') + 1);
    } else {
      const marker = `/${bucket}/`;
      key = uri.slice(uri.indexOf(marker) + marker.length);
    }
    const client = new S3Client({
      region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = Buffer.from(await out.Body!.transformToByteArray());
    await fs.writeFile(dest, bytes);
    return;
  }
  throw new Error(`Unsupported uri ${uri}`);
}

async function main() {
  const profile = process.argv.includes('--final') ? 'FINAL_1080P' : 'DRAFT_FAST';
  const episodeId = VERTICAL_SLICE_EPISODE_ID;
  const jobs = await prisma.renderJob.findMany({
    where: {
      episodeId,
      status: 'COMPLETE',
      resolution: profile === 'FINAL_1080P' ? '1080x1920' : '540x960',
    },
    include: { outputs: true, shot: true },
    orderBy: { createdAt: 'asc' },
  });
  // Prefer latest complete job per shot
  const byShot = new Map<string, (typeof jobs)[0]>();
  for (const job of jobs) {
    if (!job.shotId) continue;
    const prev = byShot.get(job.shotId);
    if (!prev || (job.completedAt && prev.completedAt && job.completedAt > prev.completedAt)) {
      byShot.set(job.shotId, job);
    }
  }
  const ordered = [...byShot.values()].sort(
    (a, b) => (a.shot?.shotNumber ?? 0) - (b.shot?.shotNumber ?? 0),
  );
  if (ordered.length === 0) {
    throw new Error(`No COMPLETE ${profile} jobs for episode`);
  }

  const work = path.join(OUT_ROOT, profile.toLowerCase(), 'work');
  mkdirSync(work, { recursive: true });
  const shotVideos: string[] = [];
  for (const job of ordered) {
    const mp4Out = job.outputs.find((o) => o.uri?.endsWith('shot.mp4') || o.kind === 'final');
    const frameOuts = job.outputs.filter((o) => o.kind === 'frames' || o.uri?.endsWith('.png'));
    const shotDir = path.join(work, `shot-${job.shot?.shotNumber ?? job.id.slice(0, 8)}`);
    mkdirSync(shotDir, { recursive: true });
    let shotMp4 = path.join(shotDir, 'shot.mp4');
    if (mp4Out?.uri) {
      await downloadUri(mp4Out.uri, shotMp4);
    } else if (frameOuts.length) {
      for (const [i, fo] of frameOuts.entries()) {
        const name = path.basename(fo.uri || `frame_${i}.png`);
        await downloadUri(fo.uri!, path.join(shotDir, name));
      }
      const enc = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-framerate',
          '30',
          '-pattern_type',
          'glob',
          '-i',
          path.join(shotDir, 'frame_*.png'),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '18',
          shotMp4,
        ],
        { encoding: 'utf8' },
      );
      if (enc.status !== 0) throw new Error(enc.stderr || 'ffmpeg frames failed');
    } else {
      throw new Error(`Job ${job.id} has no usable outputs`);
    }
    shotVideos.push(shotMp4);
  }

  const listFile = path.join(work, 'concat.txt');
  writeFileSync(listFile, shotVideos.map((p) => `file '${p}'`).join('\n'));
  const silent = path.join(work, 'picture.mp4');
  const concat = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent],
    { encoding: 'utf8' },
  );
  if (concat.status !== 0) throw new Error(concat.stderr || 'concat failed');

  // Mix dialogue audio onto timeline
  const dialogues = await prisma.dialogueLine.findMany({
    where: { episodeId },
    orderBy: { startMs: 'asc' },
  });
  const audioInputs: string[] = [];
  const filterParts: string[] = [];
  let ai = 0;
  for (const line of dialogues) {
    const cache = await prisma.voiceGenerationCacheEntry.findFirst({
      where: { text: line.text, audioUri: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!cache?.audioUri) continue;
    const wav = path.join(work, `line-${ai}.wav`);
    await downloadUri(cache.audioUri, wav);
    audioInputs.push('-i', wav);
    const delay = line.startMs ?? 0;
    filterParts.push(`[${ai + 1}:a]adelay=${delay}|${delay},volume=1[a${ai}]`);
    ai++;
  }

  const finalPath = path.join(OUT_ROOT, profile.toLowerCase(), `MeadowMapMystery_${profile}.mp4`);
  mkdirSync(path.dirname(finalPath), { recursive: true });

  if (ai === 0) {
    // Generate silent AAC track
    const mux = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        silent,
        '-f',
        'lavfi',
        '-i',
        'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        finalPath,
      ],
      { encoding: 'utf8' },
    );
    if (mux.status !== 0) throw new Error(mux.stderr || 'mux silent failed');
  } else {
    const amix = filterParts.join(';') + `;${filterParts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${ai}:normalize=0[aout]`;
    const mux = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        silent,
        ...audioInputs,
        '-filter_complex',
        amix,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        finalPath,
      ],
      { encoding: 'utf8' },
    );
    if (mux.status !== 0) throw new Error(mux.stderr?.slice(-800) || 'audio mix failed');
  }

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', finalPath],
    { encoding: 'utf8' },
  );
  const meta = JSON.parse(probe.stdout || '{}');
  const storage = new ProductionStorageService();
  const bytes = new Uint8Array(await fs.readFile(finalPath));
  const stored = await storage.storeUpload({
    category: 'final-renders',
    parts: [episodeId, profile, 'MeadowMapMystery.mp4'],
    bytes,
    contentType: 'video/mp4',
    originalName: 'MeadowMapMystery.mp4',
    metadata: { profile, episodeId },
  });

  console.log(
    JSON.stringify(
      {
        finalPath,
        storedUri: stored.uri,
        bytes: bytes.length,
        streams: meta.streams?.map((s: Record<string, unknown>) => ({
          codec: s.codec_name,
          w: s.width,
          h: s.height,
          rate: s.avg_frame_rate,
        })),
        duration: meta.format?.duration,
        shotCount: ordered.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
