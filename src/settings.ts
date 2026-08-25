import { ObsTrackerSettings } from "./types";

export const DEFAULT_SETTINGS: ObsTrackerSettings = {
  dataDir: ".obstracker",
  heartbeatIntervalSec: 30,
  idleThresholdSec: 180,
  minSessionSec: 2,
  sliceSec: 300,
  writeCharThreshold: 20,
  excludePaths: [".obstracker", ".obsidian"],
  dashboardPath: "ObsTracker.md",
  colorTheme: "theme",
  language: "zh-CN",
};
