import { describe, expect, it } from "vitest";

import { homePath, type MeResponse } from "./session";

const base: MeResponse = {
  protocolVersion: 1,
  csrfToken: "x",
  actor: { id: "1", displayName: "A", email: "a@example.test", role: "OWNER", status: "ACTIVE" },
  organization: { id: "o", name: null, initialized: false },
  shop: null,
  device: null,
  mfa: { required: true, enabled: true },
  next: "HOME_OWNER",
};

describe("redirection après session", () => {
  it("envoie le propriétaire et le gérant vers leur espace", () => {
    expect(homePath(base)).toBe("/owner");
    expect(homePath({ ...base, actor: { ...base.actor, role: "MANAGER" } })).toBe("/manager");
  });
});
