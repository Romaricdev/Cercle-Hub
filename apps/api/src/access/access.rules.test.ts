import { DomainError, normalizeInviteEmail } from "@cercle/domain";
import { describe, expect, it } from "vitest";

describe("normalisation des invitations", () => {
  it("normalise une adresse valide et refuse une injection", () => {
    expect(normalizeInviteEmail("  Owner@Example.TEST ")).toBe("owner@example.test");
    expect(() => normalizeInviteEmail("owner' OR 1=1--")).toThrow(DomainError);
    expect(() => normalizeInviteEmail("pas-un-email")).toThrow(DomainError);
  });
});
