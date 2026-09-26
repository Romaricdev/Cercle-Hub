export class ContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContractError";
    this.code = code;
  }
}

const MINOR_PATTERN = /^-?(?:0|[1-9]\d*)$/;
const MAX_DOCUMENT_MINOR = 1_000_000_000_000n;

export function parseMinor(value: string): bigint {
  if (!MINOR_PATTERN.test(value)) {
    throw new ContractError("INVALID_MONEY", "Un montant doit être une chaîne entière, sans décimale.");
  }
  return BigInt(value);
}

export function formatMinor(value: bigint): string {
  return value.toString();
}

export function assertDocumentMinor(value: bigint): void {
  if (value < 0n || value > MAX_DOCUMENT_MINOR) {
    throw new ContractError("INVALID_MONEY", "Le montant dépasse les bornes autorisées.");
  }
}

export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new ContractError("INVALID_MONEY", "Le diviseur d’un arrondi doit être positif.");
  }
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function multiplyPriceByQuantity(unitPriceMinor: bigint, quantityScaled: bigint): bigint {
  return roundHalfUpDiv(unitPriceMinor * quantityScaled, 1_000_000n);
}
