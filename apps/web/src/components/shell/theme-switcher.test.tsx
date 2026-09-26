import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThemeSwitcher } from "./theme-switcher";

describe("sélecteur de thème", () => {
  it("propose clair, sombre et système", async () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole("button", { name: "Clair" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sombre" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Système" }));
    expect(screen.getByRole("group", { name: "Thème" })).toBeTruthy();
  });
});
