import { App, MarkdownView, TFile } from "obsidian";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { EventLog } from "../storage/event-log";
import { NoteMode, ObsTrackerSettings, SessionEndReason } from "../types";
import { countChars, countWords } from "../utils";

interface ActiveSession {
  notePath: string;
  noteTitle: string;
  mode: NoteMode;
  startTs: number;
  /** 最后一次活动的时刻 */
  lastActiveTs: number;
  /** 已结算活跃段的终点 */
  lastSettledTs: number;
  /** 已结算的活跃秒数 */
  accumulatedSeconds: number;
  /** 窗口失焦暂停中 */
  paused: boolean;
  totalChars: number;
  totalWords: number;
}

/**
 * 采集层：后台监听打开/切换/编辑/空闲/失焦，落盘 session + edit 事件。
 * 只记原始事实，不做读写判断、不做 folder 归类。
 */
export class SessionTracker {
  private current: ActiveSession | null = null;
  private lastActivityTs = 0;
  private heartbeatId: number | null = null;
  private lastPointerMoveTs = 0;

  constructor(
    private app: App,
    private eventLog: EventLog,
    private settings: ObsTrackerSettings,
  ) {}

  start(): void {
    // file-open 覆盖「同 leaf 内切换笔记」（内部链接/前进后退/搜索打开）
    this.app.workspace.on("file-open", () => this.onLeafChange());
    this.app.workspace.on("active-leaf-change", () => this.onLeafChange());

    window.addEventListener("pointerdown", this.onActivity);
    window.addEventListener("keydown", this.onActivity);
    // 阅读信号：滚轮/触摸板（wheel）、鼠标移动（节流）、触摸
    // 注意：不监听 scroll——Obsidian 内部渲染会自发触发 scroll，导致 idle 检测失效（挂机误判）
    window.addEventListener("wheel", this.onActivity, { passive: true });
    window.addEventListener("pointermove", this.onThrottledActivity, { passive: true });
    window.addEventListener("touchmove", this.onActivity, { passive: true });
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focus", this.onFocus);

    this.heartbeatId = window.setInterval(() => this.heartbeat(), this.settings.heartbeatIntervalSec * 1000);
    this.onLeafChange();
  }

  stop(): void {
    this.endSession("shutdown");
    if (this.heartbeatId !== null) window.clearInterval(this.heartbeatId);
    window.removeEventListener("pointerdown", this.onActivity);
    window.removeEventListener("keydown", this.onActivity);
    window.removeEventListener("wheel", this.onActivity);
    window.removeEventListener("pointermove", this.onThrottledActivity);
    window.removeEventListener("touchmove", this.onActivity);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
  }

  /** 重启心跳定时器（心跳间隔设置变更时调用） */
  restartHeartbeat(): void {
    if (this.heartbeatId !== null) window.clearInterval(this.heartbeatId);
    this.heartbeatId = window.setInterval(() => this.heartbeat(), this.settings.heartbeatIntervalSec * 1000);
  }

  /** 全局编辑器扩展：监听所有 markdown 编辑变化，落盘 edit 事件 */
  editorExtension(): Extension {
    return EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || !view.file || this.isExcluded(view.file.path)) return;

      let charDelta = 0;
      let wordDelta = 0;
      update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        const removed = update.startState.doc.sliceString(fromA, toA);
        const ins = inserted.toString();
        charDelta += countChars(ins) - countChars(removed);
        wordDelta += countWords(ins) - countWords(removed);
      });

      const now = Date.now();
      this.lastActivityTs = now;
      if (this.current) {
        this.current.lastActiveTs = now;
        this.current.paused = false;
      }
      this.eventLog.append({
        type: "edit",
        ts: now,
        notePath: view.file.path,
        charDelta,
        wordDelta,
      });
    });
  }

  private onLeafChange(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file || this.isExcluded(view.file.path)) {
      this.endSession("close");
      return;
    }
    const notePath = view.file.path;
    if (this.current && this.current.notePath === notePath) return;
    this.endSession("switch");
    this.beginSession(view, notePath);
  }

  private beginSession(view: MarkdownView, notePath: string): void {
    const now = Date.now();
    this.current = {
      notePath,
      noteTitle: view.file?.basename ?? notePath,
      mode: view.getMode(),
      startTs: now,
      lastActiveTs: now,
      lastSettledTs: now,
      accumulatedSeconds: 0,
      paused: false,
      totalChars: 0,
      totalWords: 0,
    };
    this.lastActivityTs = now;
    const file = view.file ?? null;
    void this.sampleTotalCount(file).then(({ chars, words }) => {
      if (this.current && this.current.notePath === notePath) {
        this.current.totalChars = chars;
        this.current.totalWords = words;
      }
    });
  }

  private async sampleTotalCount(file: TFile | null): Promise<{ chars: number; words: number }> {
    if (!file) return { chars: 0, words: 0 };
    try {
      const content = await this.app.vault.cachedRead(file);
      return { chars: countChars(content), words: countWords(content) };
    } catch {
      return { chars: 0, words: 0 };
    }
  }

  /** 结算「上次结算点 → 最后活动点」的活跃段 */
  private settle(): void {
    if (!this.current) return;
    const seg = (this.current.lastActiveTs - this.current.lastSettledTs) / 1000;
    if (seg > 0) this.current.accumulatedSeconds += seg;
    this.current.lastSettledTs = this.current.lastActiveTs;
  }

  private endSession(reason: SessionEndReason): void {
    if (!this.current) return;
    this.settle();
    const sess = this.current;
    this.current = null;
    const activeSeconds = Math.round(sess.accumulatedSeconds);
    if (activeSeconds < this.settings.minSessionSec) return;
    this.eventLog.append(
      {
        type: "session",
        ts: sess.startTs,
        endTs: Date.now(),
        notePath: sess.notePath,
        noteTitle: sess.noteTitle,
        mode: sess.mode,
        activeSeconds,
        endedBy: reason,
        totalChars: sess.totalChars,
        totalWords: sess.totalWords,
      },
      true,
    );
  }

  private heartbeat(): void {
    if (!this.current || this.current.paused) return;
    if (Date.now() - this.lastActivityTs >= this.settings.idleThresholdSec * 1000) {
      this.endSession("idle");
    }
  }

  private onActivity = (): void => {
    const now = Date.now();
    this.lastActivityTs = now;
    if (this.current) {
      this.current.lastActiveTs = now;
      this.current.paused = false;
    } else {
      this.tryResume();
    }
  };

  /** pointermove 高频，做 1s 节流 */
  private onThrottledActivity = (): void => {
    const now = Date.now();
    if (now - this.lastPointerMoveTs < 1000) return;
    this.lastPointerMoveTs = now;
    this.onActivity();
  };

  private onBlur = (): void => {
    if (!this.current) return;
    this.settle(); // 结算失焦前的活跃段
    this.current.paused = true;
  };

  private onFocus = (): void => {
    const now = Date.now();
    this.lastActivityTs = now;
    if (this.current) {
      this.current.paused = false;
      this.current.lastActiveTs = now;
      this.current.lastSettledTs = now; // 新活跃段起点
    } else {
      this.tryResume();
    }
  };

  private tryResume(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view && view.file && !this.isExcluded(view.file.path)) {
      this.beginSession(view, view.file.path);
    }
  }

  private isExcluded(path: string): boolean {
    return this.settings.excludePaths.some((p) => path === p || path.startsWith(p + "/"));
  }
}
