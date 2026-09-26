export class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export function isDeadlock(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && current) {
      if ("message" in current && typeof current.message === "string") {
        parts.push(current.message);
      }
      if ("code" in current && typeof current.code === "string") {
        parts.push(current.code);
      }
      current = "cause" in current ? current.cause : undefined;
      continue;
    }
    break;
  }
  const text = parts.join(" ");
  return text.includes("40P01") || text.includes("40001") || text.toLowerCase().includes("deadlock");
}

export async function withDeadlockRetry<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isDeadlock(error) || attempt === 3) {
        throw error;
      }
    }
  }
  throw lastError;
}
