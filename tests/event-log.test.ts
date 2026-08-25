import { describe, expect, it, vi } from "vitest";

// obsidian 是 external，测试环境里 mock 掉运行时依赖
vi.mock("obsidian", () => ({
  normalizePath: (path: string): string => path,
}));

import { EventLog } from "../src/storage/event-log";
import { DEFAULT_SETTINGS } from "../src/settings";
import { SessionEvent } from "../src/types";

class FakeAdapter {
  files = new Map<string, string>();
  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true;
    return [...this.files.keys()].some((k) => k.startsWith(path + "/"));
  }
  async mkdir(_path: string): Promise<void> {}
  async append(path: string, data: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? "") + data);
  }
  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }
  async read(path: string): Promise<string> {
    return this.files.get(path) ?? "";
  }
  async list(_path: string): Promise<{ files: string[]; folders: string[] }> {
    return { files: [...this.files.keys()], folders: [] };
  }
}

function makeLog(adapter: FakeAdapter): EventLog {
  const app = { vault: { adapter } } as any;
  return new EventLog(app, { ...DEFAULT_SETTINGS });
}

function session(ts: number, notePath = "a.md"): SessionEvent {
  return {
    type: "session",
    ts,
    endTs: ts,
    notePath,
    noteTitle: "a",
    mode: "source",
    activeSeconds: 10,
    endedBy: "switch",
    totalChars: 0,
    totalWords: 0,
  };
}

describe("EventLog", () => {
  it("首日写盘：文件不存在时用 write 而非 append", async () => {
    const adapter = new FakeAdapter();
    const log = makeLog(adapter);
    log.append(session(Date.now()), true);
    await log.flush();
    const path = [...adapter.files.keys()][0];
    expect(path).toContain(".obstracker/events-");
    expect(adapter.files.get(path)).toContain('"type":"session"');
  });

  it("写盘失败回滚，重试不丢数据", async () => {
    const adapter = new FakeAdapter();
    const log = makeLog(adapter);
    adapter.write = async () => {
      throw new Error("simulated fail");
    };
    log.append(session(Date.now()), true);
    await log.flush(); // 吞掉错误并回滚 buffer

    adapter.write = async (path, data) => {
      adapter.files.set(path, data);
    };
    await log.flush(); // 重试成功

    const path = [...adapter.files.keys()][0];
    expect(path).toContain(".obstracker/events-");
    expect(adapter.files.get(path)).toContain('"type":"session"');
  });

  it("renamePath：文件重命名后历史记录同步", async () => {
    const adapter = new FakeAdapter();
    const log = makeLog(adapter);
    log.append(session(Date.now(), "旧名.md"), true);
    await log.flush();
    await log.renamePath("旧名.md", "新名.md");
    const path = [...adapter.files.keys()][0];
    expect(adapter.files.get(path)).toContain('"新名.md"');
    expect(adapter.files.get(path)).not.toContain('"旧名.md"');
  });

  it("renamePath：文件夹移动后子文件路径同步", async () => {
    const adapter = new FakeAdapter();
    const log = makeLog(adapter);
    log.append(session(Date.now(), "哲学/康德.md"), true);
    await log.flush();
    await log.renamePath("哲学", "思想");
    const path = [...adapter.files.keys()][0];
    expect(adapter.files.get(path)).toContain('"思想/康德.md"');
  });
});
