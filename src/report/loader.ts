import { App } from "obsidian";
import { TrackedEvent } from "../types";

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
 * 读取数据目录下所有 *.jsonl，解析为事件流。
 * 带基于 mtime/size 的缓存：文件未变化时直接复用已解析结果，避免重复 IO。
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
    const files = list.files.filter((f) => f.endsWith(".jsonl"));
    const stamps: FileStamp[] = [];
    for (const f of files) {
      const st = await adapter.stat(f);
      stamps.push({ path: f, mtime: st?.mtime ?? 0, size: st?.size ?? 0 });
    }
    if (cached && sameStamps(cached.stamps, stamps)) {
      return cached.events;
    }
    const events: TrackedEvent[] = [];
    for (const f of files) {
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
    }
    loadCache.set(dataDir, { stamps, events });
    return events;
  } catch (e) {
    // 文件系统超时 / IO 失败时降级用缓存，避免看板白屏报错
    if (cached) {
      console.warn("MindTrace loadEvents 失败，使用缓存数据：", e);
      return cached.events;
    }
    throw e;
  }
}

function sameStamps(a: FileStamp[], b: FileStamp[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].mtime !== b[i].mtime || a[i].size !== b[i].size) return false;
  }
  return true;
}
