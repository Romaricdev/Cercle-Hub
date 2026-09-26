export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return rest.join("=");
    }
  }
  return undefined;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; sameSite: "Lax" | "Strict"; secure: boolean; path: string; maxAge?: number },
): string {
  const parts = [`${name}=${value}`, `Path=${options.path}`, `SameSite=${options.sameSite}`];
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  return parts.join("; ");
}
