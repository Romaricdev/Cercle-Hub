const SECRET_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "backupcodes",
  "backupcode",
  "totp",
  "pin",
]);

export function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactLogValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SECRET_KEYS.has(key.toLowerCase()) ? "[redacted]" : redactLogValue(entry);
    }
    return output;
  }
  if (typeof value === "string") {
    return value.replace(/[\r\n]/g, " ");
  }
  return value;
}
