import { ContractError } from "./money.js";

const SCALE = 6;
const SCALE_FACTOR = 1_000_000n;
const MAX_BASE_QUANTITY = 1_000_000n * SCALE_FACTOR;

const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseQuantity(value: string, maxDecimals: number): bigint {
  if (maxDecimals < 0 || maxDecimals > SCALE) {
    throw new ContractError("INVALID_PRECISION", "Le nombre de décimales demandé est hors contrat.");
  }
  const match = QUANTITY_PATTERN.exec(value);
  if (!match) {
    throw new ContractError("INVALID_QUANTITY", "La quantité doit être un décimal positif sans exposant.");
  }
  const fraction = match[1] ?? "";
  if (fraction.length > maxDecimals) {
    throw new ContractError("INVALID_PRECISION", "La quantité dépasse la précision autorisée.");
  }
  const [whole = "0"] = value.split(".");
  const padded = fraction.padEnd(SCALE, "0");
  const scaled = BigInt(whole) * SCALE_FACTOR + BigInt(padded);
  if (scaled <= 0n || scaled > MAX_BASE_QUANTITY) {
    throw new ContractError("INVALID_QUANTITY", "La quantité est hors des bornes métier.");
  }
  return scaled;
}

export function parseConversionFactor(value: string): bigint {
  return parseQuantity(value, SCALE);
}

export function convertQuantity(quantityScaled: bigint, factorScaled: bigint): bigint {
  const product = quantityScaled * factorScaled;
  if (product % SCALE_FACTOR !== 0n) {
    throw new ContractError("INVALID_PRECISION", "La conversion n’est pas représentable sans arrondi.");
  }
  const converted = product / SCALE_FACTOR;
  if (converted <= 0n || converted > MAX_BASE_QUANTITY) {
    throw new ContractError("INVALID_QUANTITY", "La quantité convertie est hors des bornes métier.");
  }
  return converted;
}

export function formatQuantity(quantityScaled: bigint): string {
  const negative = quantityScaled < 0n;
  const absolute = negative ? -quantityScaled : quantityScaled;
  const whole = absolute / SCALE_FACTOR;
  const fraction = (absolute % SCALE_FACTOR).toString().padStart(SCALE, "0").replace(/0+$/, "");
  const text = fraction.length === 0 ? whole.toString() : `${whole.toString()}.${fraction}`;
  return negative ? `-${text}` : text;
}
