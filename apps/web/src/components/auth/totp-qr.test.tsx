import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: async () => "data:image/png;base64,qr",
  },
}));

import { TotpQr } from "./totp-qr";

describe("QR TOTP", () => {
  it("affiche un QR scannable avec une alternative textuelle", async () => {
    render(<TotpQr uri="otpauth://totp/Cercle?secret=ABC" />);
    const image = await screen.findByRole("img", { name: "QR code d’activation du second facteur" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,qr");
    expect(screen.getByText(/Scannez ce code/)).toBeInTheDocument();
  });
});
