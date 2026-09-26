import { ContractError, roundHalfUpDiv } from "./money.js";

export function allocateLayerOutputs(initialValueMinor: bigint, initialQuantity: bigint, outputs: readonly bigint[]): bigint[] {
  if (initialQuantity <= 0n || initialValueMinor < 0n) {
    throw new ContractError("INVALID_QUANTITY", "La couche initiale est invalide.");
  }
  let remainingValue = initialValueMinor;
  let remainingQuantity = initialQuantity;
  const allocated: bigint[] = [];
  for (const output of outputs) {
    if (output <= 0n || output > remainingQuantity) {
      throw new ContractError("INVALID_QUANTITY", "Une sortie dépasse la quantité restante.");
    }
    const value = output === remainingQuantity ? remainingValue : roundHalfUpDiv(remainingValue * output, remainingQuantity);
    allocated.push(value);
    remainingValue -= value;
    remainingQuantity -= output;
  }
  if (remainingQuantity !== 0n || remainingValue !== 0n) {
    throw new ContractError("INVALID_MONEY", "L’allocation ne solde pas la couche.");
  }
  return allocated;
}

export interface CostLayerOrder {
  id: string;
  receivedAt: Date;
  expiresAt: Date | null;
}

export function orderCostLayers<T extends CostLayerOrder>(layers: readonly T[], strategy: "FIFO" | "FEFO"): T[] {
  return [...layers].sort((left, right) => {
    if (strategy === "FEFO") {
      const leftExpiry = left.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightExpiry = right.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
    }
    const received = left.receivedAt.getTime() - right.receivedAt.getTime();
    return received || left.id.localeCompare(right.id);
  });
}
