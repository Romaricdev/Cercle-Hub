"use client";

import { MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { api, RequestError } from "../../../lib/api";
import { Alert } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PageHeader } from "../../../components/ui/page-header";

interface DeviceRow {
  id: string;
  name: string;
  status: string;
  shopName: string | null;
  lastSeenAt: string | null;
}

export default function OwnerDevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; action: "approve" | "revoke" } | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const data = await api<{ devices: DeviceRow[] }>("/api/v1/devices");
    setDevices(data.devices);
  }

  useEffect(() => {
    reload().catch((caught: RequestError) => setError(caught.message));
  }, []);

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }
  if (!devices) {
    return <p>Chargement…</p>;
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Appareils">Le nom et le navigateur ne suffisent pas à identifier un appareil. L’approbation n’ouvre pas le hors connexion.</PageHeader>
      {devices.length === 0 ? (
        <EmptyState title="Aucun appareil à examiner" icon={<MonitorSmartphone aria-hidden="true" className="size-5" />}>
          Les tablettes apparaîtront ici dès qu’un gérant enregistrera son appareil. Vous pourrez alors vérifier la boutique concernée avant de l’approuver.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)]">
          {devices.map((device) => (
            <li key={device.id} className="border-b border-[var(--separator)]/60 px-5 py-4 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display">{device.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {device.shopName ?? "Boutique inconnue"} · dernier contact {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("fr-FR") : "jamais"}
                  </p>
                </div>
                <Badge>{device.status}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {device.status === "PENDING" ? (
                  <Button onClick={() => setTarget({ id: device.id, action: "approve" })}>Approuver</Button>
                ) : null}
                {device.status !== "REVOKED" ? (
                  <Button variant="danger" onClick={() => setTarget({ id: device.id, action: "revoke" })}>
                    Révoquer
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-3 rounded-lg bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))] px-4 py-3 text-sm">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
        <p className="text-[var(--muted)]"><span className="font-semibold text-[var(--foreground)]">Contrôle propriétaire.</span> Un appareil approuvé reste limité à sa boutique et ne reçoit aucune capacité hors connexion pendant P02.</p>
      </div>
      <ConfirmDialog
        open={target?.action === "approve"}
        onOpenChange={(open) => setTarget(open && target ? target : null)}
        title="Approuver cet appareil"
        confirmLabel="Approuver"
        pending={pending}
        onConfirm={() => {
          if (!target) {
            return;
          }
          setPending(true);
          api(`/api/v1/devices/${target.id}/approve`, { method: "POST" })
            .then(() => reload())
            .then(() => setTarget(null))
            .catch((caught: RequestError) => setError(caught.message))
            .finally(() => setPending(false));
        }}
      >
        L’appareil pourra être utilisé par le gérant. Aucune capacité hors ligne n’est délivrée dans cette phase.
      </ConfirmDialog>
      <ConfirmDialog
        open={target?.action === "revoke"}
        onOpenChange={(open) => setTarget(open && target ? target : null)}
        title="Révoquer cet appareil"
        confirmLabel="Révoquer"
        tone="danger"
        pending={pending}
        onConfirm={() => {
          if (!target || reason.trim().length < 3) {
            setError("Le motif est obligatoire.");
            return;
          }
          setPending(true);
          api(`/api/v1/devices/${target.id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) })
            .then(() => reload())
            .then(() => setTarget(null))
            .catch((caught: RequestError) => setError(caught.message))
            .finally(() => setPending(false));
        }}
      >
        <Label htmlFor="revoke-reason">Motif obligatoire</Label>
        <Input id="revoke-reason" required value={reason} onChange={(event) => setReason(event.target.value)} />
      </ConfirmDialog>
    </section>
  );
}
