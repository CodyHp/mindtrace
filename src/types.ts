/** 会话结束原因 */
export type SessionEndReason = "switch" | "close" | "idle" | "blur" | "shutdown";

/** 笔记编辑模式（对齐 Obsidian MarkdownView.getMode() 的返回值） */
export type NoteMode = "source" | "preview";

/** session 事件：一段连续活跃停留 */
export interface SessionEvent {
  type: "session";
  /** 开始时间（epoch ms） */
  ts: number;
  /** 落盘时刻（epoch ms），仅排序/审计用，不参与时长计算 */
  endTs: number;
  notePath: string;
  noteTitle: string;
  mode: NoteMode;
  /** 实际活跃秒数（已排除 idle 尾段），活跃区间 = [ts, ts + activeSeconds*1000] */
  activeSeconds: number;
  endedBy: SessionEndReason;
  /** session 开始时文档总字数快照 */
  totalChars: number;
  totalWords: number;
}

/** edit 事件：编辑增量 */
export interface EditEvent {
  type: "edit";
  ts: number;
  notePath: string;
  /** 本次净增字符数（Unicode 码点） */
  charDelta: number;
  /** 本次净增词数（英文按空格分词） */
  wordDelta: number;
}

export type TrackedEvent = SessionEvent | EditEvent;

/** 插件设置 */
export interface ObsTrackerSettings {
  /** 数据目录（相对 vault 根） */
  dataDir: string;
  /** 心跳间隔（秒，仅内存） */
  heartbeatIntervalSec: number;
  /** 空闲判定阈值（秒） */
  idleThresholdSec: number;
  /** 极短 session 丢弃阈值（秒） */
  minSessionSec: number;
  /** 读写弱推断分片时长（秒） */
  sliceSec: number;
  /** 弱推断写作字数阈值 */
  writeCharThreshold: number;
  /** 排除路径（前缀匹配） */
  excludePaths: string[];
  /** 看板笔记路径（相对 vault 根） */
  dashboardPath: string;
  /** 颜色主题：'theme' 跟随 Obsidian，或具体 hex 基础色 */
  colorTheme: string;
  /** 界面语言：'auto' 跟随 Obsidian，'zh-CN'，或 'en' */
  language: string;
}
