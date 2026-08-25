/** 未分类桶名（根目录 / 无目录笔记） */
export const UNCATEGORIZED = "未分类";

/** 提取 notePath 的目录层级（含最细粒度的文件级，去扩展名），逐级累积 */
export function folderLevels(notePath: string): string[] {
  const parts = notePath.split("/").filter((p) => p.length > 0);
  if (parts.length <= 1) return []; // 根目录文件：无 folder 层级，归「未分类」
  const levels: string[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    let seg = parts[i];
    if (i === parts.length - 1) {
      const dot = seg.lastIndexOf(".");
      if (dot > 0) seg = seg.slice(0, dot); // 文件名去扩展名，纳入最细粒度
    }
    acc = acc ? `${acc}/${seg}` : seg;
    levels.push(acc);
  }
  return levels;
}

/** 顶级 folder（用于「主题」粒度）；无目录归入未分类 */
export function topFolder(notePath: string): string {
  const parts = notePath.split("/").filter((p) => p.length > 0);
  if (parts.length <= 1) return UNCATEGORIZED;
  return parts[0];
}
