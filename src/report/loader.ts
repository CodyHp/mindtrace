import { App } from "obsidian";
import { TrackedEvent } from "../types";

/** 读取数据目录下所有 *.jsonl，解析为事件流 */
export async function loadEvents(app: App, dataDir: string): Promise<TrackedEvent[]> {
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(dataDir))) return [];
  const list = await adapter.list(dataDir);
  const events: TrackedEvent[] = [];
  for (const f of list.files) {
    if (!f.endsWith(".jsonl")) continue;
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
  return events;
}
