import { describe, expect, it } from "vitest";

import { allocateLayerOutputs, canonicalJson, convertQuantity, hashEnvelope, orderCostLayers, parseCommandEnvelope, parseMinor, parseQuantity, redactLogValue, sha256Hex } from "./index.js";

describe("argent et quantités", () => {
  it("refuse un montant flottant", () => {
    expect(() => parseMinor("12.5")).toThrow(/chaîne entière/);
  });

  it("refuse une précision de quantité excessive", () => {
    expect(() => parseQuantity("1.2345", 3)).toThrow(/précision/);
  });

  it("refuse une conversion qui exigerait un arrondi", () => {
    const quantity = parseQuantity("1.000001", 6);
    const factor = parseQuantity("1.000001", 6);
    expect(() => convertQuantity(quantity, factor)).toThrow(/INVALID_PRECISION|arrondi/);
  });

  it("T57 alloue 100 pour 3 unités et laisse le reliquat à la dernière sortie", () => {
    const shares = allocateLayerOutputs(100n, 3n, [1n, 1n, 1n]);
    expect(shares.reduce((sum, value) => sum + value, 0n)).toBe(100n);
    expect(shares[2]).toBe(100n - shares[0]! - shares[1]!);
  });

  it("ordonne FIFO par réception et FEFO par péremption puis réception", () => {
    const layers = [
      { id: "old", receivedAt: new Date("2026-01-01"), expiresAt: new Date("2027-12-01") },
      { id: "urgent", receivedAt: new Date("2026-02-01"), expiresAt: new Date("2026-10-01") },
      { id: "no-expiry", receivedAt: new Date("2025-12-01"), expiresAt: null },
    ];
    expect(orderCostLayers(layers, "FIFO").map((layer) => layer.id)).toEqual(["no-expiry", "old", "urgent"]);
    expect(orderCostLayers(layers, "FEFO").map((layer) => layer.id)).toEqual(["urgent", "old", "no-expiry"]);
  });
});

describe("canonicalisation", () => {
  it("trie les clés et refuse les nombres", async () => {
    expect(canonicalJson({ b: "1", a: { d: true, c: null } })).toBe('{"a":{"c":null,"d":true},"b":"1"}');
    expect(() => canonicalJson({ amount: 12.5 })).toThrow(/non entier/);
    const digest = await sha256Hex('{"a":"1"}');
    expect(digest).toHaveLength(64);
  });

  it("vérifie le hash d’une enveloppe", async () => {
    const body = {
      protocolVersion: 1 as const,
      operationId: "6f0d5f0a-2d2a-4c1e-9c2a-0b1f4d6e8a10",
      deviceId: "7a1e6b1b-3e3b-4d2f-8d3b-1c2a5e7f9b21",
      shopId: "8b2f7c2c-4f4c-4e30-9e4c-2d3b6f80ac32",
      sessionId: "9c308d3d-505d-4f41-af5d-3e4c7091bd43",
      seq: "1",
      commandType: "REFERENCE",
      occurredAt: "2026-09-24T12:00:00.000Z",
      executionMode: "ONLINE" as const,
      onlineAuthorizationId: "ad419e4e-616e-4052-b06e-4f5d81a2ce54",
      capabilityId: null,
      payload: { amountMinor: "100" },
    };
    const hash = await hashEnvelope(body);
    const parsed = await parseCommandEnvelope({ ...body, hash, signature: "foundation-test-signature" });
    expect(parsed.hash).toBe(hash);
    await expect(parseCommandEnvelope({ ...body, hash: "a".repeat(64), signature: "foundation-test-signature" })).rejects.toThrow(/hash/i);
  });
});

describe("journaux", () => {
  it("masque les secrets et neutralise les retours ligne", () => {
    expect(redactLogValue({ password: "secret\nset-cookie", note: "ligne\n2" })).toEqual({
      password: "[redacted]",
      note: "ligne 2",
    });
  });
});
