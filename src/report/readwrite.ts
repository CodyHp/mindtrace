import { SessionEvent } from "../types";

export interface ReadWriteResult {
  readSeconds: number;
  writeSeconds: number;
}

/**
 * 读写弱推断（简化版）：用 session 的文档快照差值判断。
 * 该 session 内净增字数 > 0 → 视为写作；否则视为阅读。
 * 不逐字符跟踪，绕开输入法 composition 中间态。
 */
export function classifyReadWrite(session: SessionEvent): ReadWriteResult {
  const netChars = (session.totalCharsEnd ?? session.totalChars) - session.totalChars;
  if (netChars > 0) {
    return { readSeconds: 0, writeSeconds: session.activeSeconds };
  }
  return { readSeconds: session.activeSeconds, writeSeconds: 0 };
}
