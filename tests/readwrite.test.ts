import { describe, expect, it } from "vitest";
import { classifyReadWrite } from "../src/report/readwrite";
import { SessionEvent } from "../src/types";

function session(activeSeconds: number, netChars: number): SessionEvent {
  return {
    type: "session",
    ts: 0,
    endTs: activeSeconds * 1000,
    notePath: "哲学/康德.md",
    noteTitle: "康德",
    mode: "source",
    activeSeconds,
    endedBy: "switch",
    totalChars: 100,
    totalWords: 10,
    totalCharsEnd: 100 + netChars,
    totalWordsEnd: 10 + netChars,
  };
}

describe("classifyReadWrite（快照差值版）", () => {
  it("净增字数 > 0 → 判写作", () => {
    const r = classifyReadWrite(session(600, 50));
    expect(r.writeSeconds).toBe(600);
    expect(r.readSeconds).toBe(0);
  });

  it("净增字数 = 0 → 判阅读", () => {
    const r = classifyReadWrite(session(600, 0));
    expect(r.writeSeconds).toBe(0);
    expect(r.readSeconds).toBe(600);
  });

  it("缺省结束快照时回退为 0 净增 → 阅读", () => {
    const s = session(300, 0);
    delete s.totalCharsEnd;
    const r = classifyReadWrite(s);
    expect(r.writeSeconds).toBe(0);
    expect(r.readSeconds).toBe(300);
  });
});
