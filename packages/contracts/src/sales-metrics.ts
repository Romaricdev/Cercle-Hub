import { ContractError } from "./money.js";

const CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000n;

export function parseCivilDate(value: string, label = "La date"): string {
  const match = CIVIL.exec(value.trim());
  if (!match) throw new ContractError("INVALID_DATE", `${label} doit être une date civile AAAA-MM-JJ.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new ContractError("INVALID_DATE", `${label} n’est pas un jour calendaire valide.`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function civilToUtcDate(value: string): Date {
  return new Date(`${parseCivilDate(value)}T00:00:00.000Z`);
}

export function addCivilDays(value: string, days: bigint): string {
  const start = BigInt(civilToUtcDate(parseCivilDate(value)).getTime());
  return new Date(Number(start + days * DAY_MS)).toISOString().slice(0, 10);
}

export function inclusiveCivilDays(from: string, to: string): bigint {
  const start = civilToUtcDate(from).getTime();
  const end = civilToUtcDate(to).getTime();
  if (end < start) throw new ContractError("INVALID_PERIOD", "La date de fin précède la date de début.");
  const delta = BigInt(end) - BigInt(start);
  if (delta % DAY_MS !== 0n) throw new ContractError("INVALID_PERIOD", "La période n’est pas alignée sur des jours civils.");
  return delta / DAY_MS + 1n;
}

export function previousCivilPeriod(from: string, to: string): { from: string; to: string } {
  const days = inclusiveCivilDays(from, to);
  const previousTo = addCivilDays(from, -1n);
  return { from: addCivilDays(previousTo, -(days - 1n)), to: previousTo };
}

export function averageBasketMinor(revenueMinor: bigint, saleCount: bigint): { available: boolean; amountMinor: string | null } {
  if (saleCount <= 0n) return { available: false, amountMinor: null };
  if (revenueMinor < 0n) throw new ContractError("INVALID_MONEY", "Un chiffre d’affaires ne peut pas être négatif.");
  return { available: true, amountMinor: (revenueMinor / saleCount).toString() };
}

export function periodVariation(currentMinor: bigint, previousMinor: bigint): {
  available: boolean;
  bps: string | null;
  direction: "up" | "down" | "flat" | null;
} {
  if (previousMinor <= 0n) return { available: false, bps: null, direction: null };
  const bps = ((currentMinor - previousMinor) * 10_000n) / previousMinor;
  return {
    available: true,
    bps: bps.toString(),
    direction: bps > 0n ? "up" : bps < 0n ? "down" : "flat",
  };
}

export function paymentTypeOf(mode: string): "CASH" | "MOBILE_MONEY" | "BANK" | "OTHER" {
  if (mode === "CASH" || mode === "MOBILE_MONEY" || mode === "BANK") return mode;
  return "OTHER";
}

export function aggregatePaymentsByType(rows: Array<{ mode: string; amountMinor: bigint }>): {
  CASH: string;
  MOBILE_MONEY: string;
  BANK: string;
  OTHER: string;
  total: string;
} {
  const totals = { CASH: 0n, MOBILE_MONEY: 0n, BANK: 0n, OTHER: 0n };
  for (const row of rows) {
    if (row.amountMinor < 0n) throw new ContractError("INVALID_MONEY", "Un encaissement ne peut pas être négatif.");
    totals[paymentTypeOf(row.mode)] += row.amountMinor;
  }
  const total = totals.CASH + totals.MOBILE_MONEY + totals.BANK + totals.OTHER;
  return {
    CASH: totals.CASH.toString(),
    MOBILE_MONEY: totals.MOBILE_MONEY.toString(),
    BANK: totals.BANK.toString(),
    OTHER: totals.OTHER.toString(),
    total: total.toString(),
  };
}
