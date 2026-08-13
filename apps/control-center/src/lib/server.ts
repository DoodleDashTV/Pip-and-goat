import { join } from "node:path";
import {
  ControlCenterOrchestrator,
  SlidingWindowRateLimiter,
  loadConfig,
  type ControlCenterConfig,
} from "@doodle-dash/control-center";

declare global {
  var __ddpControlCenter: ControlCenterOrchestrator | undefined;
  var __ddpLoginLimiter: SlidingWindowRateLimiter | undefined;
}

export function getConfig(): ControlCenterConfig {
  const dataDir =
    process.env.CONTROL_CENTER_DATA_DIR || join(process.cwd(), "data");
  return loadConfig({ dataDir });
}

export function getOrchestrator(): ControlCenterOrchestrator {
  if (!globalThis.__ddpControlCenter) {
    const config = getConfig();
    globalThis.__ddpControlCenter = new ControlCenterOrchestrator(config);
    // First-boot latch: allow local dashboard use in development/test only after explicit clear via API,
    // except auto-clear in development for DX.
    if (
      config.runtimeMode === "development" &&
      globalThis.__ddpControlCenter.store.getDispatchDenied() &&
      !config.killSwitchEnv
    ) {
      globalThis.__ddpControlCenter.clearDispatchDenied("bootstrap");
    }
  }
  return globalThis.__ddpControlCenter;
}

export function getLoginLimiter(): SlidingWindowRateLimiter {
  if (!globalThis.__ddpLoginLimiter) {
    const config = getConfig();
    globalThis.__ddpLoginLimiter = new SlidingWindowRateLimiter(
      config.loginRateLimitMax,
      config.loginRateLimitWindowMs,
      config.loginRateLimitMax * 5,
    );
  }
  return globalThis.__ddpLoginLimiter;
}
