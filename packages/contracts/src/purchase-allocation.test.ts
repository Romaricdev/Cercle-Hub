import { describe, expect, it } from "vitest";

import { allocateByLargestRemainder, takeRemainingValue } from "./purchase-allocation.js";

describe("répartition des frais d’acquisition", () => {
  it("répartit 500 au prorata de 6 000 et 4 000", () => {
    const shares = allocateByLargestRemainder(
      [
        { id: "a", base: 6000n },
        { id: "b", base: 4000n },
      ],
      500n,
    );
    expect(shares).toEqual([
      { id: "a", amount: 300n },
      { id: "b", amount: 200n },
    ]);
  });

  it("attribue le reliquat d’arrondi à la plus grande fraction puis à l’identifiant", () => {
    const shares = allocateByLargestRemainder(
      [
        { id: "b", base: 1n },
        { id: "a", base: 1n },
        { id: "c", base: 1n },
      ],
      100n,
    );
    expect(shares.reduce((sum, row) => sum + row.amount, 0n)).toBe(100n);
    expect(shares.find((row) => row.id === "a")?.amount).toBe(34n);
    expect(shares.find((row) => row.id === "b")?.amount).toBe(33n);
    expect(shares.find((row) => row.id === "c")?.amount).toBe(33n);
  });

  it("T68 capitalise 800 de frais sur une seule ligne de 10 000", () => {
    const shares = allocateByLargestRemainder([{ id: "goods", base: 10000n }], 800n);
    expect(shares[0]?.amount).toBe(800n);
  });
});

describe("reliquat de valeur d’une couche", () => {
  it("laisse le reliquat à la dernière sortie", () => {
    const first = takeRemainingValue(100n, 3n, 1n);
    const second = takeRemainingValue(100n - first, 2n, 1n);
    const last = takeRemainingValue(100n - first - second, 1n, 1n);
    expect(first + second + last).toBe(100n);
    expect(last).toBe(100n - first - second);
  });

  it("refuse une extraction supérieure à la quantité restante", () => {
    expect(() => takeRemainingValue(10800n, 50n, 51n)).toThrowError(/reliquat/);
  });
});

describe("coût unitaire entier", () => {
  it("arrondit le coût unitaire sans flottant", () => {
    const scale = 1_000_000n;
    const qty = 3n * scale;
    const value = 10000n;
    const unit = (value * scale + qty / 2n) / qty;
    expect(unit).toBe(3333n);
  });
});
