/** Must match server `GRAPH_WRITE_PASSWORD_HEADER` (see README). */
export const GRAPH_WRITE_PASSWORD_HEADER = "x-write-password";

const STORAGE_KEY = "word_decompose_graph_write_password";

export function getStoredWritePassword(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredWritePassword(password: string): void {
  localStorage.setItem(STORAGE_KEY, password);
}

export function clearStoredWritePassword(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Prompt once per session until stored; returns null if user cancels. */
export async function ensureWritePassword(): Promise<string | null> {
  const existing = getStoredWritePassword();
  if (existing) {
    return existing;
  }

  const entered = window.prompt(
    "图谱写入需要密码（由部署环境配置，不会保存在源码中）："
  );
  if (entered === null || entered.trim() === "") {
    return null;
  }

  const trimmed = entered.trim();
  setStoredWritePassword(trimmed);
  return trimmed;
}

export async function patchWordUnfamiliar(
  lemma: string,
  payload: { unfamiliar: boolean; unfamiliar_note?: string }
): Promise<Response> {
  const password = await ensureWritePassword();
  if (!password) {
    throw new Error("未提供写入密码");
  }

  const res = await fetch(
    `/api/graph/word/${encodeURIComponent(lemma)}/unfamiliar`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [GRAPH_WRITE_PASSWORD_HEADER]: password,
      },
      body: JSON.stringify(payload),
    }
  );

  if (res.status === 401) {
    clearStoredWritePassword();
  }

  return res;
}
