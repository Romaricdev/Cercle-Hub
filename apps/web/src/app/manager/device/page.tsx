"use client";

import { useEffect, useState } from "react";

import { api, RequestError } from "../../../lib/api";
import { Alert } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PageHeader } from "../../../components/ui/page-header";
import type { MeResponse } from "../../../lib/session";

interface DeviceRow {
  id: string;
  name: string;
  status: string;
  shopName: string | null;
}

export default function ManagerDevicePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const [profile, data] = await Promise.all([api<MeResponse>("/api/v1/me"), api<{ devices: DeviceRow[] }>("/api/v1/devices")]);
    setMe(profile);
    setDevices(data.devices);
  }

  useEffect(() => {
    reload().catch((caught: RequestError) => setError(caught.message));
  }, []);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const raw = await crypto.subtle.exportKey("spki", pair.publicKey);
      const publicKey = btoa(String.fromCharCode(...new Uint8Array(raw)));
      await api("/api/v1/devices/register", { method: "POST", body: JSON.stringify({ publicKey, name }) });
      await reload();
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "L’enregistrement a échoué.");
    } finally {
      setPending(false);
    }
  }

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Appareil">
        {me?.shop ? `Boutique ${me.shop.name}.` : "Aucune boutique n’est encore affectée."} L’approbation du propriétaire est obligatoire.
      </PageHeader>
      {devices?.length ? (
        <ul className="overflow-hidden rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)]">
          {devices.map((device) => (
            <li key={device.id} className="border-b border-[var(--separator)]/60 px-5 py-4 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display">{device.name}</p>
                  <p className="text-sm text-[var(--muted)]">{device.shopName ?? "Boutique"}</p>
                </div>
                <Badge>{device.status}</Badge>
              </div>
              {device.status === "PENDING" ? <p className="mt-2 text-sm">En attente d’approbation. Aucune écriture n’est possible.</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Aucun appareil">L’approbation du propriétaire est nécessaire avant toute écriture.</EmptyState>
      )}
      <form className="max-w-2xl space-y-4 rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]" onSubmit={(event) => void register(event)}>
        <Label htmlFor="device-name">Nom de l’appareil</Label>
        <Input id="device-name" required value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" disabled={pending || !me?.shop}>
          Enregistrer
        </Button>
      </form>
    </section>
  );
}
