import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthStatus } from "./health-status";

describe("écran de santé", () => {
  it("nomme l’entreprise et n’affiche aucun chiffre commercial", () => {
    render(<HealthStatus />);
    expect(screen.getByRole("heading", { name: "Socle technique" })).toBeTruthy();
    expect(screen.getByText("Cercle Complet Sarl")).toBeTruthy();
    expect(screen.queryByText(/chiffre d’affaires|FCFA|stock/i)).toBeNull();
  });
});
