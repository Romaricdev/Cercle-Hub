import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeResponse } from "../../lib/session";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/owner",
  useRouter: () => ({ replace }),
}));

const api = vi.fn();
vi.mock("../../lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
}));

import { AppShell } from "./app-shell";

const owner: MeResponse = {
  protocolVersion: 1,
  csrfToken: "x",
  actor: { id: "1", displayName: "Awa", email: "awa@example.test", role: "OWNER", status: "ACTIVE" },
  organization: { id: "o", name: "Cercle Complet", initialized: false },
  shop: null,
  device: null,
  mfa: { required: true, enabled: true },
  next: "HOME_OWNER",
};

describe("coquille authentifiée", () => {
  beforeEach(() => {
    api.mockReset();
    replace.mockReset();
  });

  it("montre la navigation propriétaire et refuse un faux chiffre", async () => {
    api.mockResolvedValue(owner);
    render(
      <AppShell role="OWNER">
        <p>Zone principale</p>
      </AppShell>,
    );
    expect(await screen.findByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Organisation" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Organisation" }));
    expect(screen.getByRole("link", { name: "Utilisateurs" })).toBeInTheDocument();
    expect(screen.getByText("Awa")).toBeInTheDocument();
    expect(screen.queryByText(/FCFA|chiffre d’affaires/i)).not.toBeInTheDocument();
  });

  it("envoie une session absente vers la connexion", async () => {
    api.mockRejectedValue({ status: 401, message: "Session absente." });
    render(<AppShell role="OWNER">x</AppShell>);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login?reason=session"));
  });
});
