import { App, normalizePath } from "obsidian";
import { DaySummary, EditEvent, MindTraceSettings, SessionEvent, TrackedEvent } from "../types";
import { localDay, localHour } from "../utils";
import { classifyReadWrite } from "../report/readwrite";
import { folderLevels, UNCATEGORIZED } from "../report/classify";

const MAX_SESSION_SEC = 4 * 3600;

/**
 * 结算：把超过保留天数的原始事件聚合成每日摘要，写入 summary 文件，并删除旧事件文件。
 * 结果：历史只保留「每日摘要」（极小），原始事件只保留最近 retentionDays 天。
 */
export async function settleOldEvents(app: App, settings: MindTraceSettings): Promise<void> {
  const adapter = app.vault.adapter;
  const dir = normalizePath(settings.dataDir);
  if (!(await adapter.exists(dir))) return;
  const list = await adapter.list(dir);
  const cutoff = dayBefore(localDay(Date.now()), settings.retentionDays);
  const expired = list.files.filter((f) => {
    const m = f.match(/events-(\d{4}-\d{2}-\d{2})\.jsonl/);
    return m != null && m[1] < cutoff;
  });
  for (const f of expired) {
    const m = f.match(/events-(\d{4}-\d{2}-\d{2})\.jsonl/);
    if (!m) continue;
    const day = m[1];
    try {
      const content = await adapter.read(f);
      const events = parseEvents(content);
      if (events.length === 0) {
        await adapter.remove(f);
        continue;
      }
      const summary = summarizeDay(day, events);
      await appendSummary(adapter, dir, summary);
      await adapter.remove(f);
    } catch (e) {
      console.warn("MindTrace 结算失败，保留原始文件：", f, e);
    }
  }
}

/** 读取历史每日摘要（summary-*.jsonl） */
export async function loadSummaries(app: App, dataDir: string): Promise<DaySummary[]> {
  const adapter = app.vault.adapter;
  const dir = normalizePath(dataDir);
  if (!(await adapter.exists(dir))) return [];
  const list = await adapter.list(dir);
  const summaries: DaySummary[] = [];
  for (const f of list.files) {
    if (!f.includes("summary-")) continue;
    const content = await adapter.read(f);
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        summaries.push(JSON.parse(t) as DaySummary);
      } catch {
        // 跳过坏行
      }
    }
  }
  return summaries;
}

function dayBefore(dayStr: string, n: number): string {
  const d = new Date(dayStr + "T00:00:00");
  d.setDate(d.getDate() - n);
  return localDay(d.getTime());
}

function parseEvents(content: string): TrackedEvent[] {
  const events: TrackedEvent[] = [];
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t) as TrackedEvent);
    } catch {
      // 跳过坏行
    }
  }
  return events;
}

/** 把某天的事件聚合成一条每日摘要 */
export function summarizeDay(day: string, events: TrackedEvent[]): DaySummary {
  const sessions = events.filter((e): e is SessionEvent => e.type === "session");
  const edits = events.filter((e): e is EditEvent => e.type === "edit");
  const cells: Record<string, number> = {};
  const docs: Record<string, { visits: number; seconds: number; addedChars: number }> = {};
  let activeSeconds = 0;
  let readSeconds = 0;
  let writeSeconds = 0;
  let addedChars = 0;
  let deletedChars = 0;

  for (const s of sessions) {
    if (s.activeSeconds > MAX_SESSION_SEC) continue;
    const { readSeconds: r, writeSeconds: w } = classifyReadWrite(s);
    activeSeconds += s.activeSeconds;
    readSeconds += r;
    writeSeconds += w;
    const top = folderLevels(s.notePath)[0] ?? UNCATEGORIZED;
    for (const [hour, secs] of sessionHourSplit(s)) {
      const key = `${top}|${hour}`;
      cells[key] = (cells[key] ?? 0) + secs;
    }
    const doc = docs[s.notePath] ?? { visits: 0, seconds: 0, addedChars: 0 };
    doc.visits += 1;
    doc.seconds += s.activeSeconds;
    docs[s.notePath] = doc;
  }
  for (const e of edits) {
    const added = Math.max(0, e.charDelta);
    const deleted = Math.max(0, -e.charDelta);
    addedChars += added;
    deletedChars += deleted;
    const doc = docs[e.notePath];
    if (doc) doc.addedChars += added;
  }
  return { day, activeSeconds, readSeconds, writeSeconds, addedChars, deletedChars, cells, docs };
}

function sessionHourSplit(session: SessionEvent): Map<number, number> {
  const result = new Map<number, number>();
  const segments: [number, number][] =
    session.activeSegments && session.activeSegments.length > 0
      ? session.activeSegments
      : [[session.ts, session.ts + session.activeSeconds * 1000]];
  for (const [start, end] of segments) {
    let cur = start;
    while (cur < end) {
      const hour = localHour(cur);
      const next = new Date(cur);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      const segEnd = Math.min(next.getTime(), end);
      result.set(hour, (result.get(hour) ?? 0) + (segEnd - cur) / 1000);
      cur = segEnd;
    }
  }
  return result;
}

async function appendSummary(adapter: App["vault"]["adapter"], dir: string, summary: DaySummary): Promise<void> {
  const month = summary.day.slice(0, 7);
  const path = normalizePath(`${dir}/summary-${month}.jsonl`);
  const line = JSON.stringify(summary) + "\n";
  if (await adapter.exists(path)) {
    await adapter.append(path, line);
  } else {
    await adapter.write(path, line);
  }
}
