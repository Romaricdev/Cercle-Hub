export interface ApiError {
  protocolVersion: number;
  error: { code: string; message: string };
}

export class RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfToken = "";

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ?? (method !== "GET" && method !== "HEAD" && path.startsWith("/api/v1/") ? "{}" : null);
  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (csrfToken && method !== "GET" && method !== "HEAD") {
    headers.set("x-csrf-token", csrfToken);
  }
  if (method !== "GET" && method !== "HEAD" && path.startsWith("/api/v1/") && !headers.has("idempotency-key")) {
    headers.set("idempotency-key", crypto.randomUUID());
  }
  const response = await fetch(path, { ...init, method, body, headers, credentials: "include" });
  const payload = (await response.json().catch(() => null)) as (T & ApiError) | null;
  if (payload && typeof payload === "object" && "csrfToken" in payload && typeof payload.csrfToken === "string") {
    csrfToken = payload.csrfToken;
  }
  if (!response.ok) {
    const error = payload && "error" in payload ? payload.error : { code: "NETWORK", message: "La requête n’a pas abouti." };
    if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new CustomEvent("cercle:session-expired"));
    }
    throw new RequestError(response.status, error.code, error.message);
  }
  return payload as T;
}

export async function loadCsrf(): Promise<void> {
  const data = await api<{ csrfToken: string }>("/api/v1/csrf");
  csrfToken = data.csrfToken;
}
