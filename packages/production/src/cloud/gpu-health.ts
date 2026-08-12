/**
 * GPU hardware health check helpers (Phase 10) — used by worker; unit-testable.
 */
import type { GpuHardwareReport } from './types';

export function parseNvidiaSmiCsv(line: string): { gpuModel: string; vramGb: number | null } {
  // expected: name, memory.total [MiB]
  const parts = line.split(',').map((p) => p.trim());
  const gpuModel = parts[0] || 'UNKNOWN';
  const memMiB = Number(parts[1]);
  const vramGb = Number.isFinite(memMiB) ? Number((memMiB / 1024).toFixed(2)) : null;
  return { gpuModel, vramGb };
}

export function evaluateGpuHealth(input: {
  gpuModel?: string | null;
  vramGb?: number | null;
  blenderVersion?: string | null;
  eeveeVersion?: string | null;
  os?: string;
  renderBackend?: string | null;
  hardwareAcceleration?: boolean;
  benchmarkOk: boolean;
  benchmarkMs?: number;
}): { ok: boolean; report: GpuHardwareReport; reason: string } {
  const report: GpuHardwareReport = {
    gpuModel: input.gpuModel || 'UNKNOWN',
    vramGb: input.vramGb ?? null,
    blenderVersion: input.blenderVersion ?? null,
    eeveeVersion: input.eeveeVersion ?? null,
    os: input.os || process.platform,
    renderBackend: input.renderBackend || 'UNKNOWN',
    hardwareAcceleration: Boolean(input.hardwareAcceleration),
    benchmarkOk: input.benchmarkOk,
    benchmarkMs: input.benchmarkMs,
  };

  if (!input.benchmarkOk) {
    return { ok: false, report, reason: 'Blender GPU benchmark failed — refusing unhealthy worker.' };
  }
  if (!report.hardwareAcceleration) {
    return { ok: false, report, reason: 'Hardware acceleration not active — refusing silent CPU fallback on paid GPU.' };
  }
  if (!report.gpuModel || report.gpuModel === 'UNKNOWN') {
    return { ok: false, report, reason: 'GPU model undetected.' };
  }
  return { ok: true, report, reason: 'GPU worker healthy.' };
}
