import { MindTraceSettings } from "./types";

export const DEFAULT_SETTINGS: MindTraceSettings = {
  dataDir: ".mindtrace",
  heartbeatIntervalSec: 30,
  idleThresholdSec: 180,
  minSessionSec: 2,
  sliceSec: 300,
  writeCharThreshold: 20,
  excludePaths: [".mindtrace"],
  dashboardPath: "MindTrace.md",
  colorTheme: "theme",
  language: "zh-CN",
};
