import { App } from "obsidian";
import { DaySummary, SessionEvent, SUMMARY_PREFIX, TrackedEvent } from "../types";
import { loadSummaries } from "../storage/summarizer";

interface FileStamp {
  path: string;
  mtime: number;
  size: number;
}

interface CachedLoad {
  stamps: FileStamp[];
  events: TrackedEvent[];
}

const loadCache = new Map<string, CachedLoad>();

/**
 * 读取「历史每日摘要 + 最近 N 天原始事件」，合并成统一事件流。
 * 摘要反序列化成虚拟 session/edit（notePath 带 SUMMARY_PREFIX），报表层据此剥离前缀、过滤明细。
 */
export async function loadEvents(app: App, dataDir: string): Promise<TrackedEvent[]> {
  const cached = loadCache.get(dataDir);
  try {
    const adapter = app.vault.adapter;
    if (!(await adapter.exists(dataDir))) {
      loadCache.delete(dataDir);
      return [];
    }
    const list = await adapter.list(dataDir);
    const files = list.files.filter((f) => f.endsWith(".jsonl") && !f.includes("summary-"));
    const stamps: FileStamp[] = [];
    const validFiles: string[] = [];
    for (const f of files) {
      try {
        const st = await adapter.stat(f);
        stamps.push({ path: f, mtime: st?.mtime ?? 0, size: st?.size ?? 0 });
        validFiles.push(f);
      } catch {
        // 文件刚被结算删除，跳过（ENOENT 竞态）
      }
    }
    if (cached && sameStamps(cached.stamps, stamps)) {
      return cached.events;
    }
    const events: TrackedEvent[] = [];
    for (const f of validFiles) {
      try {
        const content = await adapter.read(f);
        for (const line of content.split("\n")) {
          const t = line.trim();
          if (!t) continue;
          try {
            events.push(JSON.parse(t) as TrackedEvent);
          } catch {
            // 跳过坏行
          }
        }
      } catch {
        // 文件刚被删除，跳过
      }
    }
    const summaries = await loadSummaries(app, dataDir);
    const summaryEvents = summariesToEvents(summaries);
    const all = [...summaryEvents, ...events];
    loadCache.set(dataDir, { stamps, events: all });
    return all;
  } catch (e) {
    if (cached) {
      console.warn("MindTrace loadEvents 失败，使用缓存数据：", e);
      return cached.events;
    }
    throw e;
  }
}

/** 每日摘要 → 虚拟 session/edit（历史部分），read/write 按摘要比例拆分 */
function summariesToEvents(summaries: DaySummary[]): TrackedEvent[] {
  const events: TrackedEvent[] = [];
  for (const s of summaries) {
    const dayTs = new Date(s.day + "T00:00:00").getTime();
    const writeRatio = s.activeSeconds > 0 ? s.writeSeconds / s.activeSeconds : 0;
    for (const [key, secs] of Object.entries(s.cells)) {
      const idx = key.lastIndexOf("|");
      const folder = key.slice(0, idx);
      const hour = Number(key.slice(idx + 1));
      if (!Number.isFinite(hour) || secs <= 0) continue;
      const total = Math.round(secs);
      const writeSecs = Math.round(total * writeRatio);
      const readSecs = total - writeSecs;
      if (readSecs > 0) events.push(virtualSession(dayTs + hour * 3600000, folder, readSecs, 0));
      if (writeSecs > 0) events.push(virtualSession(dayTs + hour * 3600000, folder, writeSecs, 1));
    }
    if (s.addedChars > 0) {
      events.push({
        type: "edit",
        ts: dayTs + 12 * 3600000,
        notePath: SUMMARY_PREFIX + "words",
        charDelta: s.addedChars,
        wordDelta: 0,
        addedChars: s.addedChars,
        deletedChars: 0,
      });
    }
    if (s.deletedChars > 0) {
      events.push({
        type: "edit",
        ts: dayTs + 12 * 3600000,
        notePath: SUMMARY_PREFIX + "words",
        charDelta: -s.deletedChars,
        wordDelta: 0,
        addedChars: 0,
        deletedChars: s.deletedChars,
      });
    }
  }
  return events;
}

/** 虚拟 session：totalCharsEnd 用于让 classifyReadWrite 正确判读/写（0=读，1=写） */
function virtualSession(ts: number, folder: string, activeSeconds: number, writeMark: 0 | 1): SessionEvent {
  return {
    type: "session",
    ts,
    endTs: ts + activeSeconds * 1000,
    notePath: SUMMARY_PREFIX + folder,
    noteTitle: folder,
    mode: "source",
    activeSeconds,
    endedBy: "close",
    totalChars: 0,
    totalWords: 0,
    totalCharsEnd: writeMark,
    totalWordsEnd: 0,
  };
}

function sameStamps(a: FileStamp[], b: FileStamp[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].mtime !== b[i].mtime || a[i].size !== b[i].size) return false;
  }
  return true;
}
