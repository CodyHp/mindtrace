import { describe, expect, it } from "vitest";
import { classifyReadWrite } from "../src/report/readwrite";
import { EditEvent, SessionEvent } from "../src/types";

function session(activeSeconds: number): SessionEvent {
  return {
    type: "session",
    ts: 0,
    endTs: activeSeconds * 1000,
    notePath: "哲学/康德.md",
    noteTitle: "康德",
    mode: "source",
    activeSeconds,
    endedBy: "switch",
    totalChars: 0,
    totalWords: 0,
  };
}

function edit(ts: number, charDelta: number): EditEvent {
  return { type: "edit", ts, notePath: "哲学/康德.md", charDelta, wordDelta: 0 };
}

describe("classifyReadWrite", () => {
  it("无编辑 → 全部判阅读", () => {
    const r = classifyReadWrite(session(600), [], 300, 20);
    expect(r.writeSeconds).toBe(0);
    expect(r.readSeconds).toBeCloseTo(600);
  });

  it("编辑超阈值 → 该片判写作", () => {
    const s = session(600); // 10 分钟 = 两个 5 分钟片
    const edits = [edit(0, 30)]; // 第一片写作，第二片无编辑
    const r = classifyReadWrite(s, edits, 300, 20);
    expect(r.writeSeconds).toBeCloseTo(300);
    expect(r.readSeconds).toBeCloseTo(300);
  });

  it("编辑低于阈值 → 判阅读", () => {
    const s = session(300);
    const edits = [edit(0, 5)]; // 5 字 < 20
    const r = classifyReadWrite(s, edits, 300, 20);
    expect(r.writeSeconds).toBe(0);
    expect(r.readSeconds).toBeCloseTo(300);
  });

  it("首片不足 5 分钟也能正确分片", () => {
    const s = session(120); // 2 分钟 = 1 片
    const edits = [edit(0, 100)];
    const r = classifyReadWrite(s, edits, 300, 20);
    expect(r.writeSeconds).toBeCloseTo(120);
    expect(r.readSeconds).toBeCloseTo(0);
  });

  it("编辑事件不在 session 区间内被忽略", () => {
    const s = session(300);
    const edits = [edit(999999, 100)]; // 区间外
    const r = classifyReadWrite(s, edits, 300, 20);
    expect(r.writeSeconds).toBe(0);
  });
});
