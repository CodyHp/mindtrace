import { EditEvent, SessionEvent } from "../types";

export interface ReadWriteResult {
  readSeconds: number;
  writeSeconds: number;
}

/**
 * 读写弱推断：把 session 活跃区间按 sliceSec 固定分片，
 * 片内累计 charDelta 超过阈值 → 写作片，否则阅读片。
 * 片时长（浮点秒）分别累加进 writeSeconds / readSeconds。
 */
export function classifyReadWrite(
  session: SessionEvent,
  edits: EditEvent[],
  sliceSec: number,
  writeCharThreshold: number,
): ReadWriteResult {
  const start = session.ts;
  const end = session.ts + session.activeSeconds * 1000;
  let readSeconds = 0;
  let writeSeconds = 0;

  for (let segStart = start; segStart < end; segStart += sliceSec * 1000) {
    const segEnd = Math.min(segStart + sliceSec * 1000, end);
    const segSeconds = (segEnd - segStart) / 1000;
    let charDelta = 0;
    for (const e of edits) {
      if (e.ts >= segStart && e.ts < segEnd) charDelta += e.charDelta;
    }
    if (charDelta >= writeCharThreshold) {
      writeSeconds += segSeconds;
    } else {
      readSeconds += segSeconds;
    }
  }

  return { readSeconds, writeSeconds };
}
