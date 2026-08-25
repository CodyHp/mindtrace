import { describe, expect, it } from "vitest";
import { countChars, countWords, localDay, localHour } from "../src/utils";

describe("countChars", () => {
  it("中文一字算 1", () => {
    expect(countChars("哲学")).toBe(2);
  });
  it("英文按码点计数", () => {
    expect(countChars("abc")).toBe(3);
  });
  it("空字符串为 0", () => {
    expect(countChars("")).toBe(0);
  });
  it("emoji 按码点计数", () => {
    expect(countChars("😀")).toBe(1);
  });
});

describe("countWords", () => {
  it("英文按空格分词", () => {
    expect(countWords("hello world")).toBe(2);
  });
  it("空字符串为 0", () => {
    expect(countWords("   ")).toBe(0);
  });
});

describe("localDay", () => {
  it("格式化为 YYYY-MM-DD", () => {
    const d = new Date(2026, 0, 5, 12, 0, 0);
    expect(localDay(d.getTime())).toBe("2026-01-05");
  });
});

describe("localHour", () => {
  it("返回本地小时", () => {
    const d = new Date(2026, 0, 5, 15, 30, 0);
    expect(localHour(d.getTime())).toBe(15);
  });
});
