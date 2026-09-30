export const requestStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  SUBMITTED: { label: "Soumise", tone: "info" },
  NEEDS_INFO: { label: "Précisions demandées", tone: "warning" },
  APPROVED: { label: "Approuvée", tone: "success" },
  PARTIAL: { label: "Approuvée partiellement", tone: "warning" },
  REJECTED: { label: "Refusée", tone: "danger" },
  CANCELLED: { label: "Annulée", tone: "neutral" },
  CLOSED: { label: "Clôturée", tone: "neutral" },
};

export const purchaseStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  POSTED: { label: "Enregistré", tone: "success" },
  CANCELLED: { label: "Annulé", tone: "danger" },
};

export const receivedStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  NONE: { label: "Non reçue", tone: "neutral" },
  PARTIAL: { label: "Réception partielle", tone: "warning" },
  COMPLETE: { label: "Réception complète", tone: "success" },
};

export const paymentStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  DUE: { label: "À payer", tone: "warning" },
  PARTIAL: { label: "Paiement partiel", tone: "info" },
  PAID: { label: "Réglé", tone: "success" },
};

export const shipmentStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  SUBMITTED: { label: "Soumise", tone: "info" },
  APPROVED: { label: "Autorisée", tone: "info" },
  DISPATCHED: { label: "En transit", tone: "warning" },
  PARTIAL: { label: "Réception partielle", tone: "warning" },
  RECEIVED: { label: "Reçue", tone: "success" },
  DISPUTED: { label: "Litigieuse", tone: "danger" },
  REJECTED: { label: "Refusée", tone: "danger" },
  CLOSED: { label: "Clôturée", tone: "neutral" },
};

export const urgencyLabel: Record<string, string> = { LOW: "Basse", NORMAL: "Normale", HIGH: "Haute" };
export const buyerLabel: Record<string, string> = { MANAGER: "Gérant", OWNER: "Propriétaire", EXISTING_STOCK: "Stock existant" };

export async function filePayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { sha256, base64: btoa(binary) };
}
