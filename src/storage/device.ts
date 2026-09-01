/** 设备唯一标识，存 localStorage（不随 vault 同步，天然每台唯一） */
const DEVICE_ID_KEY = "mindtrace-device-id";

export function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    id = null; // 测试环境无 localStorage
  }
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      // 忽略（测试环境）
    }
  }
  return id;
}
