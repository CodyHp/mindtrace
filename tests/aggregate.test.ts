import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/aggregate";
import { DEFAULT_SETTINGS } from "../src/settings";
import { EditEvent, MindTraceSettings, SessionEvent } from "../src/types";

const settings: MindTraceSettings = { ...DEFAULT_SETTINGS };

function makeSession(overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    type: "session",
    ts: new Date(2026, 0, 5, 9, 0, 0).getTime(), // 2026-01-05 09:00
    endTs: new Date(2026, 0, 5, 9, 30, 0).getTime(),
    notePath: "哲学/康德.md",
    noteTitle: "康德",
    mode: "source",
    activeSeconds: 1800,
    endedBy: "switch",
    totalChars: 1000,
    totalWords: 100,
    ...overrides,
  };
}

describe("buildReport", () => {
  it("空事件返回空报表", () => {
    const r = buildReport([], settings);
    expect(r.totalSeconds).toBe(0);
    expect(r.matrix).toEqual([]);
    expect(r.folderBars).toEqual([]);
  });

  it("folder 时长排行：哲学累计正确", () => {
    const s1 = makeSession({ notePath: "哲学/康德.md" });
    const s2 = makeSession({ notePath: "哲学/尼采.md", ts: s1.endTs + 1000 });
    const r = buildReport([s1, s2], settings);
    const philosophy = r.folderBars.find((b) => b.folder === "哲学");
    expect(philosophy?.seconds).toBe(3600);
  });

  it("根目录笔记归未分类", () => {
    const s = makeSession({ notePath: "随笔.md" });
    const r = buildReport([s], settings);
    expect(r.folderBars[0].folder).toBe("未分类");
  });

  it("高频文档按 session 次数排序", () => {
    const s1 = makeSession({ notePath: "a.md" });
    const s2 = makeSession({ notePath: "a.md", ts: s1.endTs + 1000 });
    const s3 = makeSession({ notePath: "b.md", ts: s2.endTs + 1000 });
    const r = buildReport([s1, s2, s3], settings);
    expect(r.frequentDocs[0].notePath).toBe("a.md");
    expect(r.frequentDocs[0].count).toBe(2);
  });

  it("遗忘提醒：最后访问时间最早的排前", () => {
    const s1 = makeSession({ notePath: "a.md" });
    const s2 = makeSession({ notePath: "a.md", ts: s1.endTs + 1000 });
    const s3 = makeSession({ notePath: "b.md", ts: s2.endTs + 1000 });
    const r = buildReport([s1, s2, s3], settings);
    expect(r.forgottenDocs[0].notePath).toBe("a.md");
  });

  it("跨小时 session 切分到两个小时桶", () => {
    const s = makeSession({
      ts: new Date(2026, 0, 5, 9, 30, 0).getTime(),
      activeSeconds: 3600,
    });
    const r = buildReport([s], settings);
    const hour9 = r.matrix.find((c) => c.hour === 9);
    const hour10 = r.matrix.find((c) => c.hour === 10);
    expect(hour9?.seconds).toBeCloseTo(1800);
    expect(hour10?.seconds).toBeCloseTo(1800);
  });

  it("字数趋势：新增字数与总字数快照", () => {
    const s = makeSession({ totalChars: 500 });
    const e: EditEvent = { type: "edit", ts: s.ts + 1000, notePath: s.notePath, charDelta: 100, wordDelta: 10 };
    const r = buildReport([s, e], settings);
    expect(r.wordTrend[0].addedChars).toBe(100);
    expect(r.wordTrend[0].totalChars).toBe(500);
  });
});
