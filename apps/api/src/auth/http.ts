export function buildAuthUrl(publicOrigin: string, rawUrl: string): URL {
  const origin = new URL(publicOrigin);
  const incoming = new URL(rawUrl, origin);
  return new URL(`${incoming.pathname}${incoming.search}`, origin);
}

export function buildAuthRequest(options: {
  publicOrigin: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Request {
  const target = buildAuthUrl(options.publicOrigin, options.url);
  const headers = new Headers();
  for (const [key, value] of Object.entries(options.headers)) {
    if (value === undefined || key.toLowerCase() === "host" || key.toLowerCase() === "content-length") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.set(key, value);
    }
  }
  headers.set("host", target.host);
  const method = options.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && options.body !== undefined && options.body !== null;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const init: RequestInit = hasBody
    ? {
        method,
        headers,
        body: typeof options.body === "string" ? options.body : JSON.stringify(options.body),
      }
    : { method, headers };
  return new Request(target, init);
}

export async function forwardAuthResponse(
  response: Response,
  reply: {
    status: (code: number) => unknown;
    header: (key: string, value: string | string[]) => unknown;
    send: (payload?: string) => unknown;
  },
): Promise<void> {
  reply.status(response.status);
  const cookies = response.headers.getSetCookie();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" || key.toLowerCase() === "content-length") {
      return;
    }
    reply.header(key, value);
  });
  if (cookies.length > 0) {
    reply.header("set-cookie", cookies);
  }
  const body = await response.text();
  reply.send(body.length > 0 ? body : undefined);
}
