import { App, normalizePath } from "obsidian";
import { MindTraceSettings, TrackedEvent } from "../types";
import { localDay } from "../utils";

/**
 * append-only JSONL 事件日志。
 * edit 事件走 1s 微缓冲；session 事件 immediate 落盘，避免退出丢数据。
 * 写盘失败会回滚 buffer，不静默丢数据。
 */
export class EventLog {
  private buffer: TrackedEvent[] = [];
  private flushTimer: number | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(private app: App, private settings: MindTraceSettings) {}

  append(ev: TrackedEvent, immediate = false): void {
    this.buffer.push(ev);
    if (immediate) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 1000);
  }

  /** 并发安全的 flush：进行中共享同一个 Promise */
  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.doFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async doFlush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0, this.buffer.length);
    try {
      const byDay = new Map<string, TrackedEvent[]>();
      for (const ev of events) {
        const day = localDay(ev.ts);
        const list = byDay.get(day) ?? [];
        list.push(ev);
        byDay.set(day, list);
      }
      const dir = normalizePath(this.settings.dataDir);
      if (!(await this.app.vault.adapter.exists(dir))) {
        await this.app.vault.adapter.mkdir(dir);
      }
      for (const [day, list] of byDay) {
        const path = normalizePath(`${this.settings.dataDir}/events-${day}.jsonl`);
        const lines = list.map((e) => JSON.stringify(e)).join("\n") + "\n";
        // 首日文件不存在时 append 可能失败，改用 write
        if (await this.app.vault.adapter.exists(path)) {
          await this.app.vault.adapter.append(path, lines);
        } else {
          await this.app.vault.adapter.write(path, lines);
        }
      }
    } catch (e) {
      console.error("MindTrace 写盘失败，事件已回滚待重试：", e);
      this.buffer.unshift(...events);
    }
  }

  /** 文件/文件夹重命名后，把历史事件里的旧路径迁移为新路径 */
  async renamePath(oldPath: string, newPath: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = normalizePath(this.settings.dataDir);
    if (!(await adapter.exists(dir))) return;
    const list = await adapter.list(dir);
    for (const f of list.files) {
      if (!f.endsWith(".jsonl")) continue;
      const content = await adapter.read(f);
      if (!content.includes(oldPath)) continue; // 快速跳过不含该路径的文件
      const lines = content.split("\n");
      let changed = false;
      const out: string[] = [];
      for (const line of lines) {
        const t = line.trim();
        if (!t) {
          out.push(line);
          continue;
        }
        try {
          const ev = JSON.parse(t);
          const mapped = remapPath(ev.notePath, oldPath, newPath);
          if (mapped) {
            ev.notePath = mapped;
            // 仅 session 事件有 noteTitle，同步更新，避免看板显示旧文件名
            if (typeof ev.noteTitle === "string") {
              const parts = mapped.split("/");
              const basename = parts[parts.length - 1] ?? mapped;
              const dot = basename.lastIndexOf(".");
              ev.noteTitle = dot > 0 ? basename.slice(0, dot) : basename;
            }
            changed = true;
          }
          out.push(JSON.stringify(ev));
        } catch {
          out.push(line);
        }
      }
      if (changed) await adapter.write(f, out.join("\n"));
    }
  }
}

/** 旧路径 → 新路径映射：精确匹配（文件）或前缀匹配（文件夹） */
function remapPath(notePath: string, oldPath: string, newPath: string): string | null {
  if (notePath === oldPath) return newPath;
  if (notePath.startsWith(oldPath + "/")) return newPath + notePath.slice(oldPath.length);
  return null;
}
