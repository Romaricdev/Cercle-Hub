import { describe, expect, it } from "vitest";

import { aggregatePaymentsByType, averageBasketMinor, periodVariation, previousCivilPeriod } from "./sales-metrics.js";

describe("agrégats commerciaux P04", () => {
  it("calcule le panier moyen par division entière", () => {
    expect(averageBasketMinor(10_000n, 3n)).toEqual({ available: true, amountMinor: "3333" });
    expect(averageBasketMinor(0n, 2n)).toEqual({ available: true, amountMinor: "0" });
  });

  it("rend le panier moyen indisponible sans vente", () => {
    expect(averageBasketMinor(0n, 0n)).toEqual({ available: false, amountMinor: null });
  });

  it("calcule une variation de périodes de même durée en points de base", () => {
    expect(periodVariation(12_000n, 10_000n)).toEqual({ available: true, bps: "2000", direction: "up" });
    expect(periodVariation(8_000n, 10_000n)).toEqual({ available: true, bps: "-2000", direction: "down" });
    expect(periodVariation(10_000n, 10_000n)).toEqual({ available: true, bps: "0", direction: "flat" });
  });

  it("n’invente pas une baisse de 100 % si la période précédente est nulle", () => {
    expect(periodVariation(5_000n, 0n)).toEqual({ available: false, bps: null, direction: null });
    expect(periodVariation(0n, 0n)).toEqual({ available: false, bps: null, direction: null });
  });

  it("produit une période précédente de même durée civile", () => {
    expect(previousCivilPeriod("2026-09-20", "2026-09-26")).toEqual({ from: "2026-09-13", to: "2026-09-19" });
    expect(previousCivilPeriod("2026-09-26", "2026-09-26")).toEqual({ from: "2026-09-25", to: "2026-09-25" });
  });

  it("sépare ventes et encaissements par type de paiement", () => {
    expect(aggregatePaymentsByType([
      { mode: "CASH", amountMinor: 1500n },
      { mode: "MOBILE_MONEY", amountMinor: 2000n },
      { mode: "BANK", amountMinor: 500n },
      { mode: "OTHER", amountMinor: 100n },
      { mode: "UNKNOWN", amountMinor: 50n },
    ])).toEqual({
      CASH: "1500",
      MOBILE_MONEY: "2000",
      BANK: "500",
      OTHER: "150",
      total: "4150",
    });
  });
});
