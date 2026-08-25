/** 统计字符数（Unicode 码点，中文一字 = 1） */
export function countChars(text: string): number {
  return [...text].length;
}

/** 统计词数（英文按空格分词） */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** 本地日期 YYYY-MM-DD（用于按天归档文件名） */
export function localDay(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 小时 0-23（本地时区） */
export function localHour(ts: number): number {
  return new Date(ts).getHours();
}
