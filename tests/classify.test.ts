import { describe, expect, it } from "vitest";
import { UNCATEGORIZED, folderLevels, topFolder } from "../src/report/classify";

describe("folderLevels", () => {
  it("逐级累积目录层级", () => {
    expect(folderLevels("哲学/西方/康德.md")).toEqual(["哲学", "哲学/西方", "哲学/西方/康德"]);
  });
  it("单层目录（含文件级）", () => {
    expect(folderLevels("哲学/康德.md")).toEqual(["哲学", "哲学/康德"]);
  });
  it("根目录无层级", () => {
    expect(folderLevels("康德.md")).toEqual([]);
  });
});

describe("topFolder", () => {
  it("取顶级目录", () => {
    expect(topFolder("哲学/西方/康德.md")).toBe("哲学");
  });
  it("根目录归未分类", () => {
    expect(topFolder("康德.md")).toBe(UNCATEGORIZED);
  });
});
