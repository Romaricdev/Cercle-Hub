import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";
import { Modal } from "./modal";

function ModalHarness({ fail }: { fail: boolean }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState("première saisie");
  const [error, setError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);
  return (
    <div>
      {pageSuccess ? <p>{pageSuccess}</p> : null}
      <Modal open={open} onOpenChange={(next) => { setOpen(next); if (next) setError(null); }} title="Inviter un gérant" error={error}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (fail) {
              setError("Cette adresse e-mail est déjà utilisée.");
              return;
            }
            setOpen(false);
            setPageSuccess("Invitation créée.");
          }}
        >
          <label>
            Nom
            <input aria-label="Nom" value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <button type="submit">Créer l’invitation</button>
        </form>
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("affiche l’erreur dans le dialogue et conserve la saisie", async () => {
    const user = userEvent.setup();
    render(<ModalHarness fail />);
    const dialog = await screen.findByRole("dialog", { name: "Inviter un gérant" });
    await user.click(screen.getByRole("button", { name: "Créer l’invitation" }));
    expect(dialog).toBeVisible();
    expect(dialog.querySelector("[data-slot='modal-overlay']")).toBeNull();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Cette adresse e-mail est déjà utilisée.");
    expect(screen.getByLabelText("Nom")).toHaveValue("première saisie");
    expect(screen.queryByText("Invitation créée.")).toBeNull();
  });

  it("n’affiche le succès global qu’après fermeture", async () => {
    const user = userEvent.setup();
    render(<ModalHarness fail={false} />);
    await user.click(screen.getByRole("button", { name: "Créer l’invitation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Invitation créée.")).toBeVisible();
  });
});

function ConfirmHarness() {
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("motif initial");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => { setOpen(next); if (next) setError(null); }}
      title="Confirmer la décision"
      confirmLabel="Enregistrer"
      error={error}
      onConfirm={() => setError("Le motif est trop court.")}
    >
      <label>
        Motif
        <input aria-label="Motif" value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
    </ConfirmDialog>
  );
}

describe("ConfirmDialog", () => {
  it("garde le dialogue ouvert et montre l’erreur au-dessus des actions", async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);
    const dialog = await screen.findByRole("dialog", { name: "Confirmer la décision" });
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Le motif est trop court.");
    expect(screen.getByLabelText("Motif")).toHaveValue("motif initial");
  });

  it("réinitialise le message à la réouverture", async () => {
    const user = userEvent.setup();
    function ReopenHarness() {
      const [open, setOpen] = useState(false);
      const [error, setError] = useState<string | null>(null);
      return (
        <div>
          <button type="button" onClick={() => { setError(null); setOpen(true); }}>Ouvrir</button>
          <ConfirmDialog open={open} error={error} onOpenChange={(next) => { setOpen(next); if (next) setError(null); }} title="Confirmer" confirmLabel="Valider" onConfirm={() => setError("Échec serveur.")}>
            Confirmation
          </ConfirmDialog>
        </div>
      );
    }
    render(<ReopenHarness />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    await screen.findByRole("dialog", { name: "Confirmer" });
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(within(await screen.findByRole("dialog")).getByRole("alert")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
