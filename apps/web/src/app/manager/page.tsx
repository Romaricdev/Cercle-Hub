"use client";

import { ArrowRight, ShieldCheck, Store, TabletSmartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import type { MeResponse } from "../../lib/session";
import { PageHeader } from "../../components/ui/page-header";
import { paths } from "../../lib/session";

export default function ManagerHomePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  useEffect(() => {
    void api<MeResponse>("/api/v1/me").then(setMe);
  }, []);
  return (
    <section className="space-y-6">
      <PageHeader title="Accueil">{me?.shop ? `Boutique ${me.shop.name}` : "Aucune boutique affectée"}</PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="grid size-10 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Store aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">{me?.shop?.name ?? "Aucune boutique affectée"}</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{me?.shop ? "Votre boutique est associée à ce compte." : "Le propriétaire doit vous affecter à une boutique avant l’ouverture."}</p>
        </section>
        <Link href={paths.managerDevice} className="group rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><TabletSmartphone aria-hidden="true" className="size-5" /></div>
            {me?.device?.status === "ACTIVE" ? <ShieldCheck aria-label="Appareil actif" className="size-5 text-[var(--success)]" /> : null}
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold">{me?.device?.name ?? "Enregistrer cet appareil"}</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{me?.device ? `Statut : ${me.device.status}.` : "L’approbation du propriétaire sera nécessaire avant toute écriture."}</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Voir l’appareil <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
      </div>
      <div className="rounded-lg bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--muted)]">La caisse et les ventes seront activées dans les phases métier suivantes, sans données fictives.</div>
    </section>
  );
}
