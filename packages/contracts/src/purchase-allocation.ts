import { ContractError, roundHalfUpDiv } from "./money.js";

export function allocateByLargestRemainder(
  items: Array<{ id: string; base: bigint }>,
  total: bigint,
): Array<{ id: string; amount: bigint }> {
  if (total < 0n) {
    throw new ContractError("INVALID_MONEY", "Le total à répartir ne peut pas être négatif.");
  }
  if (items.length === 0) {
    if (total === 0n) return [];
    throw new ContractError("INVALID_MONEY", "Aucun support de répartition n’est disponible.");
  }
  const positive = items.filter((item) => item.base > 0n);
  const pool = positive.length > 0 ? positive : [...items].sort((left, right) => left.id.localeCompare(right.id));
  const sum = pool.reduce((current, item) => current + (item.base > 0n ? item.base : 1n), 0n);
  const rows = pool.map((item) => {
    const base = item.base > 0n ? item.base : 1n;
    const product = total * base;
    return { id: item.id, amount: product / sum, remainder: product % sum };
  });
  let leftover = total - rows.reduce((current, row) => current + row.amount, 0n);
  const ranked = [...rows].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  for (const row of ranked) {
    if (leftover <= 0n) break;
    row.amount += 1n;
    leftover -= 1n;
  }
  const byId = new Map(rows.map((row) => [row.id, row.amount]));
  return items.map((item) => ({ id: item.id, amount: byId.get(item.id) ?? 0n }));
}

export function takeRemainingValue(remainingValueMinor: bigint, remainingQuantity: bigint, takeQuantity: bigint): bigint {
  if (takeQuantity <= 0n || remainingQuantity <= 0n || takeQuantity > remainingQuantity) {
    throw new ContractError("INVALID_QUANTITY", "La quantité à extraire dépasse le reliquat.");
  }
  if (remainingValueMinor < 0n) {
    throw new ContractError("INVALID_MONEY", "La valeur restante de la couche est invalide.");
  }
  if (takeQuantity === remainingQuantity) return remainingValueMinor;
  return roundHalfUpDiv(remainingValueMinor * takeQuantity, remainingQuantity);
}
