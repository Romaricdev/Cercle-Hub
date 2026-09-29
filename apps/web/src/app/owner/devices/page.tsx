"use client";

import { CalendarDays, Clock3, MonitorSmartphone, Search, ShieldCheck, Store, TabletSmartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  registeredAt: string;
  capabilityStatus: string;
}

const deviceStatus = (status: string) => status === "ACTIVE" ? "Autorisé" : status === "PENDING" ? "À approuver" : status === "REVOKED" ? "Révoqué" : status;

export default function OwnerDevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; action: "approve" | "revoke" } | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const visibleDevices = useMemo(() => (devices ?? []).filter((device) => `${device.name} ${device.shopName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === "ALL" || device.status === status)), [devices, query, status]);

  async function reload() {
    const data = await api<{ devices: DeviceRow[] }>("/api/v1/devices");
    setDevices(data.devices);
  }

  useEffect(() => {
    reload().catch((caught: RequestError) => setError(caught.message));
  }, []);

  if (error && !devices) {
    return <Alert tone="error">{error}</Alert>;
  }
  if (!devices) {
    return <p>Chargement…</p>;
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Appareils autorisés">Contrôlez les appareils enregistrés par les gérants et leur accès à chaque boutique.</PageHeader>
      {error && !target ? <Alert tone="error">{error}</Alert> : null}
      {devices.length === 0 ? (
        <EmptyState title="Aucun appareil à examiner" icon={<MonitorSmartphone aria-hidden="true" className="size-5" />}>
          Les tablettes apparaîtront ici dès qu’un gérant enregistrera son appareil. Vous pourrez alors vérifier la boutique concernée avant de l’approuver.
        </EmptyState>
      ) : (
        <><div className="grid gap-3 rounded-lg bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:grid-cols-[1fr_14rem]"><div><Label htmlFor="device-search">Rechercher</Label><div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><Input id="device-search" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou boutique" /></div></div><div><Label htmlFor="device-status">État d’accès</Label><select id="device-status" value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[var(--separator)]/70 bg-[var(--surface-subtle)] px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus)]"><option value="ALL">Tous les appareils</option><option value="PENDING">À approuver</option><option value="ACTIVE">Autorisés</option><option value="REVOKED">Révoqués</option></select></div></div>
        {visibleDevices.length === 0 ? <EmptyState title="Aucun appareil correspondant" icon={<Search aria-hidden="true" className="size-5" />}>Modifiez la recherche ou le filtre d’état.</EmptyState> : <ul className="grid gap-3 lg:grid-cols-2">
          {visibleDevices.map((device) => (
            <li key={device.id} className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-subtle)] text-[var(--primary)]"><TabletSmartphone className="size-5" /></span><div className="min-w-0"><p className="truncate font-display font-semibold">{device.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted)]"><Store className="size-3.5" /> {device.shopName ?? "Aucune boutique rattachée"}</p></div></div><Badge>{deviceStatus(device.status)}</Badge></div>
              <dl className="mt-4 grid gap-3 rounded-md bg-[var(--surface-subtle)] p-3 text-sm sm:grid-cols-2"><div><dt className="flex items-center gap-1.5 text-[var(--muted)]"><CalendarDays className="size-3.5" /> Enregistré</dt><dd className="mt-1 font-medium">{new Date(device.registeredAt).toLocaleString("fr-FR")}</dd></div><div><dt className="flex items-center gap-1.5 text-[var(--muted)]"><Clock3 className="size-3.5" /> Dernier contact</dt><dd className="mt-1 font-medium">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("fr-FR") : "Aucun contact"}</dd></div></dl>
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck className="size-4 text-[var(--primary)]" /> Utilisation en ligne uniquement, limitée à la boutique rattachée.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {device.status === "PENDING" ? (
                  <Button onClick={() => setTarget({ id: device.id, action: "approve" })}>Approuver</Button>
                ) : null}
                {device.status !== "REVOKED" ? (
                  <Button variant="ghost" onClick={() => setTarget({ id: device.id, action: "revoke" })}>
                    Retirer l’autorisation
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>}</>
      )}
      <div className="flex items-start gap-3 rounded-lg bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))] px-4 py-3 text-sm">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
        <p className="text-[var(--muted)]"><span className="font-semibold text-[var(--foreground)]">Accès contrôlé par le propriétaire.</span> Autoriser un appareil lui donne uniquement accès à sa boutique lorsqu’il est connecté. L’autorisation peut être retirée à tout moment.</p>
      </div>
      <ConfirmDialog
        open={target?.action === "approve"}
        error={target?.action === "approve" ? error : null}
        onOpenChange={(open) => { if (!open) { setTarget(null); setError(null); } }}
        title="Approuver cet appareil"
        confirmLabel="Approuver"
        pending={pending}
        onConfirm={() => {
          if (!target) {
            return;
          }
          setPending(true);
          setError(null);
          api(`/api/v1/devices/${target.id}/approve`, { method: "POST" })
            .then(() => reload())
            .then(() => setTarget(null))
            .catch((caught: RequestError) => setError(caught.message))
            .finally(() => setPending(false));
        }}
      >
        L’appareil pourra être utilisé par le gérant lorsqu’il est connecté, uniquement pour la boutique qui lui est rattachée.
      </ConfirmDialog>
      <ConfirmDialog
        open={target?.action === "revoke"}
        error={target?.action === "revoke" ? error : null}
        onOpenChange={(open) => { if (!open) { setTarget(null); setError(null); } }}
        title="Retirer l’autorisation de cet appareil"
        confirmLabel="Retirer l’autorisation"
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
