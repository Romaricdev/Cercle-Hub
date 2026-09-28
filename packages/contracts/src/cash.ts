import { ContractError } from "./money.js";

export const XAF_DENOMINATIONS = [10_000, 5_000, 2_000, 1_000, 500, 100, 50, 25, 10, 5, 2, 1] as const;

export type DenominationCount = { valueMinor: string; quantity: number };

export function assertDenominationCounts(rows: DenominationCount[]): { declaredMinor: bigint; normalized: DenominationCount[] } {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ContractError("INVALID_COUNT", "Indiquez le nombre de coupures réellement présentes.");
  }
  const seen = new Set<string>();
  let declared = 0n;
  const normalized: DenominationCount[] = [];
  for (const row of rows) {
    if (!/^\d+$/.test(row.valueMinor)) throw new ContractError("INVALID_MONEY", "Une coupure est invalide.");
    const value = BigInt(row.valueMinor);
    if (!XAF_DENOMINATIONS.includes(Number(value) as (typeof XAF_DENOMINATIONS)[number])) {
      throw new ContractError("INVALID_DENOMINATION", "Cette coupure n’est pas autorisée.");
    }
    if (seen.has(row.valueMinor)) throw new ContractError("DUPLICATE_DENOMINATION", "Chaque coupure ne peut être saisie qu’une fois.");
    if (!Number.isInteger(row.quantity) || row.quantity < 0 || row.quantity > 100_000) {
      throw new ContractError("INVALID_QUANTITY", "Le nombre de coupures doit être un entier positif ou nul.");
    }
    seen.add(row.valueMinor);
    declared += value * BigInt(row.quantity);
    normalized.push({ valueMinor: row.valueMinor, quantity: row.quantity });
  }
  return { declaredMinor: declared, normalized };
}

export function declaredFromMinor(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new ContractError("INVALID_MONEY", "Le montant déclaré est invalide.");
  return BigInt(value);
}

export function varianceMinor(declaredMinor: bigint, expectedMinor: bigint): bigint {
  return declaredMinor - expectedMinor;
}

export function reclassifyWithinResidual(residualMinor: bigint, amountMinor: bigint): bigint {
  if (amountMinor <= 0n) throw new ContractError("INVALID_MONEY", "Le montant de reclassification doit être positif.");
  const absResidual = residualMinor < 0n ? -residualMinor : residualMinor;
  if (amountMinor > absResidual) {
    throw new ContractError("RESIDUAL_EXCEEDED", "La reclassification dépasse l’écart encore ouvert.");
  }
  return residualMinor < 0n ? residualMinor + amountMinor : residualMinor - amountMinor;
}
