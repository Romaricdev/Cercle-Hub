"use client";

import { ArrowRight, History, ShieldCheck, ShoppingCart, Store, TabletSmartphone, Banknote, WalletCards, CircleAlert, ClipboardList, PackageCheck } from "lucide-react";
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
        <Link href={paths.managerSale} className="group rounded-lg bg-[var(--primary)] p-5 text-[var(--primary-foreground)] shadow-[var(--shadow-float)] transition-transform duration-200 hover:-translate-y-0.5">
          <ShoppingCart aria-hidden="true" className="size-6" />
          <h2 className="mt-4 font-display text-lg font-semibold">Nouvelle vente</h2>
          <p className="mt-1.5 text-sm leading-6 opacity-85">Ouvrez votre session, composez le panier et encaissez le client.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">Vendre maintenant <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
        <Link href={paths.managerCash} className="group rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5">
          <div className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><Banknote aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">Caisse du jour</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">Suivez la session, les dépenses et le comptage de fin de journée.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Ouvrir la caisse <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
        <Link href={paths.managerExpenses} className="group rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5">
          <div className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400"><WalletCards aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">Dépenses</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">Demandez, suivez l’autorisation, puis décaissiez réellement.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Créer une demande <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
        <Link href={paths.managerRequests} className="group rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5">
          <div className="grid size-10 place-items-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-400"><ClipboardList aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">Demandes d’achat</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">Décrivez le besoin, suivez l’accord, puis achetez les quantités autorisées.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Nouvelle demande <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
        <Link href={paths.managerReceipts} className="group rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5">
          <div className="grid size-10 place-items-center rounded-lg bg-lime-500/10 text-lime-700 dark:text-lime-400"><PackageCheck aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">Réceptions</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">Confirmez les quantités arrivées, les manquants et les produits endommagés.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Voir les attendus <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
        <Link href={paths.managerDiscrepancies} className="group rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5">
          <div className="grid size-10 place-items-center rounded-lg bg-orange-500/10 text-orange-700 dark:text-orange-400"><CircleAlert aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold">Demandes d’explication</h2>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">Répondez aux questions du propriétaire sur un écart de caisse.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Voir les demandes <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
        </Link>
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
      <Link href={paths.managerSales} className="flex items-center justify-between rounded-lg bg-[var(--surface-subtle)] px-4 py-3 text-sm font-medium"><span className="inline-flex items-center gap-2"><History className="size-4 text-[var(--primary)]" />Consulter les ventes enregistrées</span><ArrowRight className="size-4" /></Link>
    </section>
  );
}
