import { MarkdownView, Plugin, TFile } from "obsidian";
import { SessionTracker } from "./collector/session-tracker";
import { buildReport, Report } from "./report/aggregate";
import { loadEvents } from "./report/loader";
import { DEFAULT_SETTINGS } from "./settings";
import { MindTraceSettingTab } from "./settings-tab";
import { EventLog } from "./storage/event-log";
import { Locale, setLocale, t } from "./i18n";
import { MindTraceSettings, TrackedEvent } from "./types";
import { bumpRenderVersion, renderReport, setColorTheme as applyColorTheme, unmountReport } from "./view/dashboard";

function dashboardTemplate(): string {
  return "\n```mindtrace\n```\n";
}

export default class MindTracePlugin extends Plugin {
  settings: MindTraceSettings = DEFAULT_SETTINGS;
  private eventLog: EventLog | null = null;
  private sessionTracker: SessionTracker | null = null;
  private renderedBlocks = new Set<HTMLElement>();
  private pathExistsCache = new Map<string, boolean>();
  private refreshTimer: number | null = null;
  private lastEventsRef: TrackedEvent[] | null = null;
  private lastReport: Report | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLocale(this.resolveLocale(this.settings.language));
    applyColorTheme(this.settings.colorTheme);

    this.eventLog = new EventLog(this.app, this.settings);
    this.sessionTracker = new SessionTracker(this.app, this.eventLog, this.settings);
    this.sessionTracker.start();
    this.registerEditorExtension(this.sessionTracker.editorExtension());

    // 文件/文件夹重命名后，同步历史记录路径，避免看板指向不存在的文件
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.eventLog?.renamePath(oldPath, file.path);
      }),
    );

    this.addRibbonIcon("chart-column", t("openDashboard"), () => {
      void this.openDashboard();
    });

    this.addCommand({
      id: "open-dashboard",
      name: t("openDashboardCmd"),
      callback: () => {
        void this.openDashboard();
      },
    });

    this.registerMarkdownCodeBlockProcessor("mindtrace", (_source, el) => {
      void this.renderCodeBlock(el);
    });

    // 切回看板笔记时自动刷新，避免旧数据残留；300ms 节流避免快速切换时重复重绘
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file?.path !== this.settings.dashboardPath) return;
        if (this.refreshTimer !== null) return;
        this.refreshTimer = window.setTimeout(() => {
          this.refreshTimer = null;
          void this.refreshAllBlocks();
        }, 300);
      }),
    );

    // Obsidian 主题/字体切换时，图表颜色需要跟随重绘
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        bumpRenderVersion();
        if (this.refreshTimer !== null) return;
        this.refreshTimer = window.setTimeout(() => {
          this.refreshTimer = null;
          void this.refreshAllBlocks();
        }, 300);
      }),
    );

    this.addSettingTab(new MindTraceSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.sessionTracker?.stop();
    await this.eventLog?.flush();
  }

  restartHeartbeat(): void {
    this.sessionTracker?.restartHeartbeat();
  }

  setColorTheme(color: string): void {
    applyColorTheme(color);
    void this.refreshAllBlocks();
  }

  applyLanguage(language: string): void {
    setLocale(this.resolveLocale(language));
    bumpRenderVersion(); // 语言变化虽不影响数据，但需要强制重绘文案
    void this.refreshAllBlocks();
  }

  private resolveLocale(language: string): Locale {
    return language === "en" ? "en" : "zh-CN";
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 创建/打开专门看板笔记（主编辑区 tab，而非侧边栏） */
  async openDashboard(): Promise<void> {
    const path = this.settings.dashboardPath;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      file = await this.app.vault.create(path, dashboardTemplate());
    }
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
    }
  }

  async renderCodeBlock(el: HTMLElement): Promise<void> {
    this.renderedBlocks.add(el);
    this.pathExistsCache.clear();
    const loading = el.createEl("div", { cls: "mindtrace-loading", text: t("loading") });
    try {
      const events = await loadEvents(this.app, this.settings.dataDir);
      // 过滤已不存在的 notePath（旧命名残留的临时文件，如「未命名.md」）与看板笔记自身
      const filtered = events.filter(
        (ev) => ev.notePath !== this.settings.dashboardPath && this.pathExists(ev.notePath),
      );
      // report 缓存：事件流引用未变（loadEvents 命中缓存）则复用上次报表
      let report: Report;
      if (this.lastEventsRef === events) {
        report = this.lastReport!;
      } else {
        report = buildReport(filtered, this.settings);
        this.lastEventsRef = events;
        this.lastReport = report;
      }
      loading.remove();
      // 等两帧，确保代码块容器完成布局，ECharts 才能拿到正确尺寸
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
      });
      renderReport(el, report, (path) => {
        void this.app.workspace.openLinkText(path, "", false);
      });
    } catch (e) {
      loading.textContent = t("loadFailed") + String(e);
    }
  }

  private pathExists(path: string): boolean {
    if (!this.pathExistsCache.has(path)) {
      this.pathExistsCache.set(path, this.app.vault.getAbstractFileByPath(path) != null);
    }
    return this.pathExistsCache.get(path)!;
  }

  /** 重新渲染所有已打开的看板代码块（颜色/语言切换后自动刷新） */
  async refreshAllBlocks(): Promise<void> {
    for (const el of [...this.renderedBlocks]) {
      if (el.isConnected) {
        await this.renderCodeBlock(el);
      } else {
        unmountReport(el); // 视图卸载，释放图表实例
        this.renderedBlocks.delete(el);
      }
    }
  }
}
