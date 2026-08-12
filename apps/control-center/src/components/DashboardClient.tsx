"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type Dash = {
  safeMode: boolean;
  killSwitch: boolean;
  autopilot: "running" | "paused";
  canonicalOwner: string;
  cloudRenderEnabled: boolean;
  allowPaidGpuLaunch: boolean;
  project?: {
    name: string;
    repoUrl: string;
    protectedBranches: string[];
    workerBranchPrefix: string;
  };
  jobs: Array<{
    id: string;
    title: string;
    status: string;
    workerBranch: string;
    resultSummary?: string;
    cursorUrl?: string;
    error?: string;
    updatedAt: string;
  }>;
  approvals: Array<{
    id: string;
    jobId: string;
    kind: string;
    reason: string;
    status: string;
  }>;
  audit: Array<{
    id: string;
    at: string;
    action: string;
    detail: string;
  }>;
  credentials: { openai: boolean; cursor: boolean };
};

async function api<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function DashboardClient() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [dash, setDash] = useState<Dash | null>(null);
  const [goal, setGoal] = useState(
    "Safe $0 test: confirm Control Center orchestration and stop.",
  );
  const [title, setTitle] = useState("Safe orchestration check");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = window.localStorage.getItem("ddp-cc-token");
    if (saved) setToken(saved);
  }, []);

  const authed = Boolean(token);

  const refresh = () => {
    if (!token) return;
    startTransition(async () => {
      try {
        setError(null);
        const data = await api<{ dashboard: Dash }>("/api/dashboard", token);
        setDash(data.dashboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (String(err).includes("Invalid") || String(err).includes("Missing")) {
          setToken("");
          window.localStorage.removeItem("ddp-cc-token");
        }
      }
    });
  };

  useEffect(() => {
    if (!token) return;
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const statusTone = useMemo(
    () => ({
      succeeded: "bg-meadow text-ink",
      failed: "bg-red-100 text-alert",
      cancelled: "bg-stone-200 text-stone-700",
      running: "bg-amber-100 text-amber-900",
      awaiting_approval: "bg-orange-100 text-orange-900",
      blocked: "bg-red-100 text-alert",
      queued: "bg-white/80 text-ink",
    }),
    [],
  );

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <p className="font-display text-4xl font-bold tracking-tight text-ink">
          DDP Control Center
        </p>
        <p className="mt-3 text-base text-ink/80">
          Private mobile dashboard. Canonical owner remains{" "}
          <strong>DoodleDash Production</strong>.
        </p>
        <label className="mt-8 text-sm font-semibold">Auth token</label>
        <input
          className="mt-2 w-full rounded-xl border border-ink/15 bg-white/80 px-4 py-3 outline-none ring-moss focus:ring-2"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="CONTROL_CENTER_AUTH_TOKEN"
        />
        {error && <p className="mt-3 text-sm text-alert">{error}</p>}
        <button
          className="mt-5 rounded-xl bg-moss px-4 py-3 font-semibold text-white disabled:opacity-60"
          disabled={pending || !password}
          onClick={() =>
            startTransition(async () => {
              try {
                setError(null);
                const data = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password }),
                }).then((r) => r.json());
                if (!data.token) throw new Error(data.error || "Login failed");
                window.localStorage.setItem("ddp-cc-token", data.token);
                setToken(data.token);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            })
          }
        >
          Unlock
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-16 pt-6">
      <header className="rounded-3xl border border-ink/10 bg-white/70 p-5 shadow-sm backdrop-blur">
        <p className="font-display text-3xl font-bold leading-none">
          DDP Control Center
        </p>
        <p className="mt-2 text-sm text-ink/70">
          Orchestrates OpenAI director + Cursor agents. Never owns production.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-meadow px-3 py-1">
            Owner: {dash?.canonicalOwner || "DoodleDash Production"}
          </span>
          <span
            className={`rounded-full px-3 py-1 ${dash?.safeMode ? "bg-meadow" : "bg-amber-100"}`}
          >
            {dash?.safeMode ? "SAFE $0 MODE" : "LIVE MODE"}
          </span>
          <span
            className={`rounded-full px-3 py-1 ${dash?.killSwitch ? "bg-red-100 text-alert" : "bg-white"}`}
          >
            Kill switch {dash?.killSwitch ? "ON" : "OFF"}
          </span>
          <span className="rounded-full bg-white px-3 py-1">
            Autopilot {dash?.autopilot || "paused"}
          </span>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-xl bg-meadow/60 px-4 py-3 text-sm">{notice}</p>
      )}

      <section className="mt-5 rounded-3xl border border-ink/10 bg-white/70 p-5">
        <h2 className="font-display text-xl font-semibold">Dispatch job</h2>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-ink/60">
          Title
        </label>
        <input
          className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-ink/60">
          Goal
        </label>
        <textarea
          className="mt-1 min-h-24 w-full rounded-xl border border-ink/15 bg-white px-3 py-2"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="rounded-xl bg-moss px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  setError(null);
                  setNotice(null);
                  const created = await api<{ job: { id: string } }>(
                    "/api/jobs",
                    token,
                    {
                      method: "POST",
                      body: JSON.stringify({ title, goal, run: true }),
                    },
                  );
                  setNotice(`Job ${created.job.id} dispatched`);
                  refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              })
            }
          >
            Run safe job
          </button>
          <button
            className="rounded-xl border border-ink/20 bg-white px-3 py-3 text-sm font-semibold disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  setError(null);
                  const data = await api<{ job: { id: string; status: string } }>(
                    "/api/jobs/safe-zero",
                    token,
                    { method: "POST" },
                  );
                  setNotice(`$0 loop ${data.job.status}: ${data.job.id}`);
                  refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              })
            }
          >
            $0 E2E loop
          </button>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-2">
        <button
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-3 text-sm font-semibold"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await api("/api/autopilot", token, {
                method: "POST",
                body: JSON.stringify({
                  state: dash?.autopilot === "paused" ? "running" : "paused",
                }),
              });
              refresh();
            })
          }
        >
          {dash?.autopilot === "paused" ? "Resume autopilot" : "Pause autopilot"}
        </button>
        <button
          className="rounded-xl border border-alert/30 bg-red-50 px-3 py-3 text-sm font-semibold text-alert"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await api("/api/kill-switch", token, {
                method: "POST",
                body: JSON.stringify({ enabled: !dash?.killSwitch }),
              });
              refresh();
            })
          }
        >
          {dash?.killSwitch ? "Disable kill switch" : "Enable kill switch"}
        </button>
      </section>

      {!!dash?.approvals?.length && (
        <section className="mt-5 rounded-3xl border border-orange-200 bg-orange-50/80 p-5">
          <h2 className="font-display text-xl font-semibold">Approvals</h2>
          <ul className="mt-3 space-y-3">
            {dash.approvals.map((a) => (
              <li key={a.id} className="rounded-2xl bg-white/80 p-3 text-sm">
                <p className="font-semibold">
                  {a.kind} · {a.jobId}
                </p>
                <p className="mt-1 text-ink/70">{a.reason}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded-lg bg-moss px-3 py-2 text-xs font-semibold text-white"
                    onClick={() =>
                      startTransition(async () => {
                        await api(`/api/approvals/${a.id}`, token, {
                          method: "POST",
                          body: JSON.stringify({ decision: "approved" }),
                        });
                        refresh();
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-lg border border-ink/20 px-3 py-2 text-xs font-semibold"
                    onClick={() =>
                      startTransition(async () => {
                        await api(`/api/approvals/${a.id}`, token, {
                          method: "POST",
                          body: JSON.stringify({ decision: "rejected" }),
                        });
                        refresh();
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5 rounded-3xl border border-ink/10 bg-white/70 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Jobs</h2>
          <button
            className="text-xs font-semibold text-moss"
            onClick={refresh}
            disabled={pending}
          >
            Refresh
          </button>
        </div>
        <ul className="mt-3 space-y-3">
          {(dash?.jobs || []).slice(0, 12).map((job) => (
            <li key={job.id} className="rounded-2xl border border-ink/5 bg-sand/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{job.title}</p>
                  <p className="mt-1 text-xs text-ink/60">{job.workerBranch}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    statusTone[job.status as keyof typeof statusTone] ||
                    "bg-white text-ink"
                  }`}
                >
                  {job.status}
                </span>
              </div>
              {job.resultSummary && (
                <p className="mt-2 text-xs leading-relaxed text-ink/80">
                  {job.resultSummary}
                </p>
              )}
              {job.error && (
                <p className="mt-2 text-xs text-alert">{job.error}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {job.cursorUrl && (
                  <a
                    className="text-xs font-semibold text-moss underline"
                    href={job.cursorUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open agent
                  </a>
                )}
                {["running", "queued", "dispatching", "directing"].includes(
                  job.status,
                ) && (
                  <button
                    className="text-xs font-semibold text-alert"
                    onClick={() =>
                      startTransition(async () => {
                        await api(`/api/jobs/${job.id}/cancel`, token, {
                          method: "POST",
                        });
                        refresh();
                      })
                    }
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
          {!dash?.jobs?.length && (
            <li className="text-sm text-ink/60">No jobs yet.</li>
          )}
        </ul>
      </section>

      <section className="mt-5 rounded-3xl border border-ink/10 bg-white/70 p-5">
        <h2 className="font-display text-xl font-semibold">Audit</h2>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs">
          {(dash?.audit || []).map((a) => (
            <li key={a.id} className="rounded-xl bg-sand/60 px-3 py-2">
              <p className="font-semibold">
                {a.action}{" "}
                <span className="font-normal text-ink/50">
                  {new Date(a.at).toLocaleString()}
                </span>
              </p>
              <p className="mt-1 text-ink/80">{a.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 rounded-3xl border border-ink/10 bg-white/60 p-5 text-xs text-ink/70">
        <p>
          Credentials · OpenAI: {dash?.credentials.openai ? "present" : "missing"} ·
          Cursor: {dash?.credentials.cursor ? "present" : "missing"}
        </p>
        <p className="mt-2">
          Cloud flags locked · CLOUD_RENDER_ENABLED=
          {String(dash?.cloudRenderEnabled)} · ALLOW_PAID_GPU_LAUNCH=
          {String(dash?.allowPaidGpuLaunch)}
        </p>
        <p className="mt-2">
          Protected: {(dash?.project?.protectedBranches || []).join(", ")}
        </p>
        <button
          className="mt-4 text-sm font-semibold text-ink underline"
          onClick={() => {
            window.localStorage.removeItem("ddp-cc-token");
            setToken("");
            setDash(null);
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
