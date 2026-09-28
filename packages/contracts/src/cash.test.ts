import { describe, expect, it } from "vitest";

import { assertDenominationCounts, reclassifyWithinResidual, varianceMinor } from "./cash.js";

describe("comptage aveugle", () => {
  it("calcule le déclaré à partir des coupures", () => {
    expect(assertDenominationCounts([
      { valueMinor: "10000", quantity: 4 },
      { valueMinor: "1000", quantity: 8 },
    ]).declaredMinor).toBe(48000n);
  });

  it("refuse une coupure inconnue", () => {
    expect(() => assertDenominationCounts([{ valueMinor: "3", quantity: 1 }])).toThrow(/coupure/);
  });

  it("calcule l’écart déclaré moins attendu", () => {
    expect(varianceMinor(48000n, 50000n)).toBe(-2000n);
    expect(varianceMinor(50000n, 50000n)).toBe(0n);
    expect(varianceMinor(51000n, 50000n)).toBe(1000n);
  });

  it("borne une reclassification au résiduel", () => {
    expect(reclassifyWithinResidual(-2000n, 2000n)).toBe(0n);
    expect(() => reclassifyWithinResidual(-2000n, 2001n)).toThrow(/dépasse/);
  });
});
