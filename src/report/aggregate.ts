import { EditEvent, MindTraceSettings, SessionEvent, TrackedEvent } from "../types";
import { UNCATEGORIZED, folderLevels } from "./classify";
import { classifyReadWrite } from "./readwrite";
import { localDay, localHour } from "../utils";

/** 单个 session 活跃时长上限（秒），超过视为挂机污染，不计入报表 */
const MAX_SESSION_SEC = 4 * 3600;

export interface ProcessedSession {
  session: SessionEvent;
  folders: string[];
  top: string;
  readSeconds: number;
  writeSeconds: number;
}

export interface MatrixCell {
  hour: number;
  folder: string;
  seconds: number;
}

export interface FolderBar {
  folder: string;
  seconds: number;
}

export interface ReadWriteDay {
  day: string;
  readSeconds: number;
  writeSeconds: number;
}

export interface WordTrendDay {
  day: string;
  addedChars: number;
  totalChars: number;
}

export interface DocFrequency {
  notePath: string;
  count: number;
  lastTs: number;
}

export interface TimelineItem {
  ts: number;
  notePath: string;
  noteTitle: string;
  activeSeconds: number;
  readSeconds: number;
  writeSeconds: number;
}

export interface FolderNode {
  folder: string;
  seconds: number;
  children: FolderNode[];
}

export interface TodaySummary {
  day: string;
  activeSeconds: number;
  readSeconds: number;
  writeSeconds: number;
  addedChars: number;
  topFolders: { folder: string; seconds: number }[];
}

export interface HourBucket {
  hour: number;
  readSeconds: number;
  writeSeconds: number;
}

export interface WeekCompare {
  folder: string;
  thisWeek: number;
  lastWeek: number;
}

export type RevisitMode = "深耕型" | "复习型" | "写不动型";

export interface RevisitDoc {
  notePath: string;
  count: number;
  totalSeconds: number;
  avgSeconds: number;
  mode: RevisitMode;
}

export interface WeekdayBucket {
  /** 0=周一 ... 6=周日 */
  weekday: number;
  seconds: number;
}

export interface DocGrowth {
  notePath: string;
  points: { ts: number; cumulative: number }[];
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export interface DailyActive {
  day: string;
  seconds: number;
}

export interface DocActivityBucket {
  period: string;
  activeDocs: number;
  writeDocs: number;
}

export interface Report {
  matrix: MatrixCell[];
  folderBars: FolderBar[];
  folderTree: FolderNode[];
  readWriteByDay: ReadWriteDay[];
  wordTrend: WordTrendDay[];
  frequentDocs: DocFrequency[];
  forgottenDocs: DocFrequency[];
  timeline: TimelineItem[];
  totalSeconds: number;
  totalReadSeconds: number;
  totalWriteSeconds: number;
  totalDocs: number;
  today: TodaySummary;
  writePeak: HourBucket[];
  weekCompare: WeekCompare[];
  streak: number;
  revisit: RevisitDoc[];
  weekday: WeekdayBucket[];
  docGrowth: DocGrowth[];
  flow: FlowLink[];
  dailyActive: DailyActive[];
  bestStreak: number;
  docActivityDaily: DocActivityBucket[];
  docActivityWeekly: DocActivityBucket[];
  docActivityMonthly: DocActivityBucket[];
  docActivityQuarterly: DocActivityBucket[];
  docActivityYearly: DocActivityBucket[];
}

/** 从原始事件流构建完整报表数据 */
export function buildReport(events: TrackedEvent[], settings: MindTraceSettings): Report {
  const sessions = events.filter((e): e is SessionEvent => e.type === "session");
  const edits = events.filter((e): e is EditEvent => e.type === "edit");

  const editsByPath = new Map<string, EditEvent[]>();
  for (const e of edits) {
    const list = editsByPath.get(e.notePath) ?? [];
    list.push(e);
    editsByPath.set(e.notePath, list);
  }

  const processed: ProcessedSession[] = [];
  for (const s of sessions) {
    if (s.activeSeconds > MAX_SESSION_SEC) continue; // 过滤挂机污染的超长会话
    const levels = folderLevels(s.notePath);
    const folders = levels.length > 0 ? levels : [UNCATEGORIZED];
    const top = levels.length > 0 ? levels[0] : UNCATEGORIZED;
    const sessionEdits = (editsByPath.get(s.notePath) ?? []).filter(
      (e) => e.ts >= s.ts && e.ts < s.ts + s.activeSeconds * 1000,
    );
    const { readSeconds, writeSeconds } = classifyReadWrite(
      s,
      sessionEdits,
      settings.sliceSec,
      settings.writeCharThreshold,
    );
    processed.push({ session: s, folders, top, readSeconds, writeSeconds });
  }

  // 1. 时段 × 主题矩阵
  const matrixMap = new Map<string, number>();
  for (const p of processed) {
    const hourSplit = splitByHour(p.session.ts, p.session.activeSeconds);
    for (const [hour, secs] of hourSplit) {
      const key = `${hour}|${p.top}`;
      matrixMap.set(key, (matrixMap.get(key) ?? 0) + secs);
    }
  }
  const matrix: MatrixCell[] = [...matrixMap.entries()].map(([k, v]) => {
    const idx = k.indexOf("|");
    const hour = Number(k.slice(0, idx));
    const folder = k.slice(idx + 1);
    return { hour, folder, seconds: Math.round(v) };
  });

  // 2. folder 时长排行（顶级）
  const folderMap = new Map<string, number>();
  for (const p of processed) {
    const secs = p.readSeconds + p.writeSeconds;
    folderMap.set(p.top, (folderMap.get(p.top) ?? 0) + secs);
  }
  const folderBars: FolderBar[] = [...folderMap.entries()]
    .map(([folder, seconds]) => ({ folder, seconds: Math.round(seconds) }))
    .sort((a, b) => b.seconds - a.seconds);

  // 3. 读写占比（按天）
  const rwMap = new Map<string, { read: number; write: number }>();
  for (const p of processed) {
    const day = localDay(p.session.ts);
    const cur = rwMap.get(day) ?? { read: 0, write: 0 };
    cur.read += p.readSeconds;
    cur.write += p.writeSeconds;
    rwMap.set(day, cur);
  }
  const readWriteByDay: ReadWriteDay[] = [...rwMap.entries()]
    .map(([day, v]) => ({ day, readSeconds: Math.round(v.read), writeSeconds: Math.round(v.write) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // 4. 字数趋势（按天）
  const wordMap = new Map<string, { added: number; total: number; totalTs: number }>();
  for (const e of edits) {
    const day = localDay(e.ts);
    const cur = wordMap.get(day) ?? { added: 0, total: 0, totalTs: 0 };
    cur.added += e.charDelta;
    wordMap.set(day, cur);
  }
  for (const p of processed) {
    const day = localDay(p.session.ts);
    const cur = wordMap.get(day) ?? { added: 0, total: 0, totalTs: 0 };
    if (p.session.ts >= cur.totalTs) {
      cur.totalTs = p.session.ts;
      cur.total = p.session.totalChars;
    }
    wordMap.set(day, cur);
  }
  const wordTrend: WordTrendDay[] = [...wordMap.entries()]
    .map(([day, v]) => ({ day, addedChars: v.added, totalChars: v.total }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // 5 / 6. 文档频率 + 遗忘 + 复访模式
  const docMap = new Map<string, { count: number; lastTs: number; totalSeconds: number }>();
  for (const p of processed) {
    const path = p.session.notePath;
    const cur = docMap.get(path) ?? { count: 0, lastTs: 0, totalSeconds: 0 };
    cur.count += 1;
    cur.totalSeconds += p.readSeconds + p.writeSeconds;
    if (p.session.ts > cur.lastTs) cur.lastTs = p.session.ts;
    docMap.set(path, cur);
  }
  const docs: DocFrequency[] = [...docMap.entries()].map(([notePath, v]) => ({
    notePath,
    count: v.count,
    lastTs: v.lastTs,
  }));
  const frequentDocs = docs.slice().sort((a, b) => b.count - a.count).slice(0, 20);
  const forgottenDocs = docs.slice().sort((a, b) => a.lastTs - b.lastTs).slice(0, 20);

  const revisit: RevisitDoc[] = [];
  for (const [notePath, v] of docMap) {
    const avgSeconds = v.count > 0 ? v.totalSeconds / v.count : 0;
    let mode: RevisitMode | null = null;
    if (avgSeconds >= 1800) mode = "深耕型";
    else if (v.count >= 3 && avgSeconds < 60) mode = "写不动型";
    else if (v.count >= 3) mode = "复习型";
    if (mode) {
      revisit.push({
        notePath,
        count: v.count,
        totalSeconds: Math.round(v.totalSeconds),
        avgSeconds: Math.round(avgSeconds),
        mode,
      });
    }
  }
  revisit.sort((a, b) => b.count - a.count);

  // 7. 明细时间线
  const timeline: TimelineItem[] = processed
    .map((p) => ({
      ts: p.session.ts,
      notePath: p.session.notePath,
      noteTitle: p.session.noteTitle,
      activeSeconds: p.session.activeSeconds,
      readSeconds: Math.round(p.readSeconds),
      writeSeconds: Math.round(p.writeSeconds),
    }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200);

  const totalSeconds = Math.round(processed.reduce((s, p) => s + p.session.activeSeconds, 0));
  const totalReadSeconds = Math.round(processed.reduce((s, p) => s + p.readSeconds, 0));
  const totalWriteSeconds = Math.round(processed.reduce((s, p) => s + p.writeSeconds, 0));
  const folderTree = buildFolderTree(processed);

  // 8. 今日焦点
  const todayStr = localDay(Date.now());
  let todayActive = 0;
  let todayRead = 0;
  let todayWrite = 0;
  const todayFolderMap = new Map<string, number>();
  for (const p of processed) {
    if (localDay(p.session.ts) !== todayStr) continue;
    todayActive += p.session.activeSeconds;
    todayRead += p.readSeconds;
    todayWrite += p.writeSeconds;
    todayFolderMap.set(p.top, (todayFolderMap.get(p.top) ?? 0) + p.readSeconds + p.writeSeconds);
  }
  const todayAdded = edits.filter((e) => localDay(e.ts) === todayStr).reduce((s, e) => s + e.charDelta, 0);
  const today: TodaySummary = {
    day: todayStr,
    activeSeconds: Math.round(todayActive),
    readSeconds: Math.round(todayRead),
    writeSeconds: Math.round(todayWrite),
    addedChars: todayAdded,
    topFolders: [...todayFolderMap.entries()]
      .map(([folder, seconds]) => ({ folder, seconds: Math.round(seconds) }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5),
  };

  // 9. 写作高峰（24h 读写分布，按读写比例切分到小时）
  const peakMap = new Map<number, { read: number; write: number }>();
  for (const p of processed) {
    const hourSplit = splitByHour(p.session.ts, p.session.activeSeconds);
    const total = p.readSeconds + p.writeSeconds;
    const writeRatio = total > 0 ? p.writeSeconds / total : 0;
    for (const [hour, secs] of hourSplit) {
      const cur = peakMap.get(hour) ?? { read: 0, write: 0 };
      cur.write += secs * writeRatio;
      cur.read += secs * (1 - writeRatio);
      peakMap.set(hour, cur);
    }
  }
  const writePeak: HourBucket[] = Array.from({ length: 24 }, (_, hour) => {
    const v = peakMap.get(hour) ?? { read: 0, write: 0 };
    return { hour, readSeconds: Math.round(v.read), writeSeconds: Math.round(v.write) };
  });

  // 10. 周期对比（本周 vs 上周，周一为一周起点）
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 周一 = 0
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const lastMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
  const thisWeekStart = thisMonday.getTime();
  const lastWeekStart = lastMonday.getTime();
  const weekMap = new Map<string, { thisWeek: number; lastWeek: number }>();
  for (const p of processed) {
    const ts = p.session.ts;
    const secs = p.readSeconds + p.writeSeconds;
    if (ts >= thisWeekStart) {
      const cur = weekMap.get(p.top) ?? { thisWeek: 0, lastWeek: 0 };
      cur.thisWeek += secs;
      weekMap.set(p.top, cur);
    } else if (ts >= lastWeekStart) {
      const cur = weekMap.get(p.top) ?? { thisWeek: 0, lastWeek: 0 };
      cur.lastWeek += secs;
      weekMap.set(p.top, cur);
    }
  }
  const weekCompare: WeekCompare[] = [...weekMap.entries()]
    .map(([folder, v]) => ({ folder, thisWeek: Math.round(v.thisWeek), lastWeek: Math.round(v.lastWeek) }))
    .sort((a, b) => b.thisWeek - a.thisWeek)
    .slice(0, 10);

  // 11. 连续活跃天数
  const activeDays = new Set<string>();
  for (const p of processed) activeDays.add(localDay(p.session.ts));
  const streak = calcStreak(activeDays);
  const bestStreak = calcBestStreak(activeDays);

  // 11.5 每日活跃（日历热力图）
  const dailyMap = new Map<string, number>();
  for (const p of processed) {
    const day = localDay(p.session.ts);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + p.readSeconds + p.writeSeconds);
  }
  const dailyActive: DailyActive[] = [...dailyMap.entries()].map(([day, seconds]) => ({
    day,
    seconds: Math.round(seconds),
  }));

  // 11.6 文档活跃度（周/月/年三种粒度的去重篇数）
  const activeDocEvents = processed.map((p) => ({ ts: p.session.ts, notePath: p.session.notePath }));
  const writeDocEvents = edits.filter((e) => e.charDelta > 0).map((e) => ({ ts: e.ts, notePath: e.notePath }));
  const docActivityDaily = buildDocActivity(activeDocEvents, writeDocEvents, localDay);
  const docActivityWeekly = buildDocActivity(activeDocEvents, writeDocEvents, weekKey);
  const docActivityMonthly = buildDocActivity(activeDocEvents, writeDocEvents, monthKey);
  const docActivityQuarterly = buildDocActivity(activeDocEvents, writeDocEvents, quarterKey);
  const docActivityYearly = buildDocActivity(activeDocEvents, writeDocEvents, yearKey);

  // 12. 星期分布（周一=0 ... 周日=6）
  const weekdayMap = new Map<number, number>();
  for (const p of processed) {
    const wd = (new Date(p.session.ts).getDay() + 6) % 7;
    weekdayMap.set(wd, (weekdayMap.get(wd) ?? 0) + p.readSeconds + p.writeSeconds);
  }
  const weekday: WeekdayBucket[] = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    seconds: Math.round(weekdayMap.get(i) ?? 0),
  }));

  // 13. 单篇字数增长（top 高频文档的累计新增字数曲线）
  const growthMap = new Map<string, { ts: number; cumulative: number }[]>();
  for (const e of edits) {
    const list = growthMap.get(e.notePath) ?? [];
    const last = list.length > 0 ? list[list.length - 1].cumulative : 0;
    list.push({ ts: e.ts, cumulative: last + e.charDelta });
    growthMap.set(e.notePath, list);
  }
  const docGrowth: DocGrowth[] = frequentDocs
    .slice(0, 10)
    .map((d) => ({ notePath: d.notePath, points: growthMap.get(d.notePath) ?? [] }))
    .filter((d) => d.points.length > 1);

  // 14. 主题注意力流向（相邻 session 且间隔 < 5 分钟的切换）
  const sorted = [...processed].sort((a, b) => a.session.ts - b.session.ts);
  const flowMap = new Map<string, number>();
  const GAP_THRESHOLD = 5 * 60 * 1000;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.session.ts - prev.session.endTs > GAP_THRESHOLD) continue;
    if (prev.top !== cur.top) {
      const key = `${prev.top}|${cur.top}`;
      flowMap.set(key, (flowMap.get(key) ?? 0) + 1);
    }
  }
  const flow: FlowLink[] = [...flowMap.entries()].map(([k, v]) => {
    const idx = k.indexOf("|");
    return { source: k.slice(0, idx), target: k.slice(idx + 1), value: v };
  });

  return {
    matrix,
    folderBars,
    folderTree,
    readWriteByDay,
    wordTrend,
    frequentDocs,
    forgottenDocs,
    timeline,
    totalSeconds,
    totalReadSeconds,
    totalWriteSeconds,
    totalDocs: docMap.size,
    today,
    writePeak,
    weekCompare,
    streak,
    revisit: revisit.slice(0, 10),
    weekday,
    docGrowth,
    flow,
    dailyActive,
    bestStreak,
    docActivityDaily,
    docActivityWeekly,
    docActivityMonthly,
    docActivityQuarterly,
    docActivityYearly,
  };
}

/** 把活跃区间 [ts, ts + activeSeconds*1000] 按小时边界切分，返回 hour → seconds */
function splitByHour(ts: number, activeSeconds: number): Map<number, number> {
  const result = new Map<number, number>();
  const end = ts + activeSeconds * 1000;
  let cur = ts;
  while (cur < end) {
    const hour = localHour(cur);
    const next = new Date(cur);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    const segEnd = Math.min(next.getTime(), end);
    const secs = (segEnd - cur) / 1000;
    result.set(hour, (result.get(hour) ?? 0) + secs);
    cur = segEnd;
  }
  return result;
}

/** 由每个 session 的递归层级构建 folder 树，供下钻使用 */
function buildFolderTree(processed: ProcessedSession[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const ensure = (folder: string): FolderNode => {
    let node = map.get(folder);
    if (!node) {
      node = { folder, seconds: 0, children: [] };
      map.set(folder, node);
    }
    return node;
  };
  for (const p of processed) {
    const secs = p.readSeconds + p.writeSeconds;
    for (const f of p.folders) {
      ensure(f).seconds += secs;
    }
  }
  const root: FolderNode[] = [];
  for (const node of map.values()) {
    const parent = parentFolder(node.folder);
    if (parent && map.has(parent)) {
      map.get(parent)!.children.push(node);
    } else {
      root.push(node);
    }
  }
  const sortRec = (nodes: FolderNode[]): void => {
    nodes.sort((a, b) => b.seconds - a.seconds);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(root);
  return root;
}

function parentFolder(folder: string): string | null {
  const idx = folder.lastIndexOf("/");
  if (idx <= 0) return null;
  return folder.slice(0, idx);
}

/** 连续活跃天数：今天无活动则从昨天起算 */
function calcStreak(days: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  if (!days.has(localDay(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(localDay(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 历史最长连续活跃天数 */
function calcBestStreak(days: Set<string>): number {
  const sortedDays = [...days].sort();
  let best = 0;
  let cur = 0;
  let prev: number | null = null;
  for (const d of sortedDays) {
    const dt = new Date(d).getTime();
    if (prev !== null) {
      const diff = Math.round((dt - prev) / 86400000);
      cur = diff === 1 ? cur + 1 : 1;
    } else {
      cur = 1;
    }
    best = Math.max(best, cur);
    prev = dt;
  }
  return best;
}

/** 按周期聚合去重文档数（活跃 vs 写作） */
function buildDocActivity(
  active: { ts: number; notePath: string }[],
  writes: { ts: number; notePath: string }[],
  keyFn: (ts: number) => string,
): DocActivityBucket[] {
  const activeMap = new Map<string, Set<string>>();
  for (const d of active) {
    const k = keyFn(d.ts);
    if (!activeMap.has(k)) activeMap.set(k, new Set());
    activeMap.get(k)!.add(d.notePath);
  }
  const writeMap = new Map<string, Set<string>>();
  for (const d of writes) {
    const k = keyFn(d.ts);
    if (!writeMap.has(k)) writeMap.set(k, new Set());
    writeMap.get(k)!.add(d.notePath);
  }
  const allKeys = new Set([...activeMap.keys(), ...writeMap.keys()]);
  return [...allKeys]
    .map((k) => ({
      period: k,
      activeDocs: activeMap.get(k)?.size ?? 0,
      writeDocs: writeMap.get(k)?.size ?? 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/** 周标识：该周周一日期 YYYY-MM-DD */
function weekKey(ts: number): string {
  const d = new Date(ts);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${monday.getFullYear()}-${m}-${day}`;
}

/** 月标识 YYYY-MM */
function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 年标识 YYYY */
function yearKey(ts: number): string {
  return String(new Date(ts).getFullYear());
}

/** 季度标识 YYYY-Qn */
function quarterKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
