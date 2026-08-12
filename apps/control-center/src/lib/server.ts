import { join } from "node:path";
import {
  ControlCenterOrchestrator,
  loadConfig,
  type ControlCenterConfig,
} from "@doodle-dash/control-center";

declare global {
  // eslint-disable-next-line no-var
  var __ddpControlCenter: ControlCenterOrchestrator | undefined;
}

export function getConfig(): ControlCenterConfig {
  const dataDir =
    process.env.CONTROL_CENTER_DATA_DIR ||
    join(process.cwd(), "data");
  return loadConfig({ dataDir });
}

export function getOrchestrator(): ControlCenterOrchestrator {
  if (!globalThis.__ddpControlCenter) {
    globalThis.__ddpControlCenter = new ControlCenterOrchestrator(getConfig());
  }
  return globalThis.__ddpControlCenter;
}
