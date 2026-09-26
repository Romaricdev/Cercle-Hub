import { ContractError } from "./money.js";

type Canonical = null | boolean | string | number | Canonical[] | { [key: string]: Canonical };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toCanonical(value: unknown): Canonical {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ContractError("INVALID_CANONICAL", "Un nombre non entier doit être une chaîne.");
    }
    return value;
  }
  if (typeof value === "bigint") {
    throw new ContractError("INVALID_CANONICAL", "Les montants entiers doivent être des chaînes.");
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toCanonical(entry));
  }
  if (isPlainObject(value)) {
    const sorted: { [key: string]: Canonical } = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) {
        throw new ContractError("INVALID_CANONICAL", "Une valeur undefined n’est pas canonicalisable.");
      }
      sorted[key] = toCanonical(entry);
    }
    return sorted;
  }
  throw new ContractError("INVALID_CANONICAL", "Valeur non canonicalisable.");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(toCanonical(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
