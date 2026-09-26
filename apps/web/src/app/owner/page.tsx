"use client";

import { ArrowRight, Boxes, Check, CircleUserRound, Clock3, KeyRound, ShieldCheck, Store, TabletSmartphone, UserPlus, UsersRound, WalletCards, Warehouse } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { paths, type MeResponse } from "../../lib/session";

const quickLinks = [
  { href: paths.ownerUsers, icon: UsersRound, title: "Équipe et accès", description: "Invitez vos gérants et gérez leurs affectations.", accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { href: paths.ownerDevices, icon: TabletSmartphone, title: "Appareils", description: "Approuvez les tablettes autorisées dans vos boutiques.", accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { href: paths.ownerAccount, icon: CircleUserRound, title: "Sécurité du compte", description: "Consultez la protection de votre accès propriétaire.", accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
];

interface OwnerSummary {
  users: number;
  pendingInvitations: number;
  devices: number;
  pendingDevices: number;
}

interface Overview {
  state: "SETUP" | "EMPTY" | "ACTIVE";
  calculatedAt: string;
  freshness: string;
  indicators: {
    shops: { total: number; byStatus: Record<string, number> };
    catalog: { products: number; variants: number; productsWithoutPrice: number };
    stock: { quantity: string; valueMinor: string };
    funds: { balanceMinor: string; activeSources: number };
    sales: { count: number; revenueMinor: string };
  };
  alerts: Array<{ code: string; count: number }>;
}

export default function OwnerHomePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [summary, setSummary] = useState<OwnerSummary | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    void Promise.all([
      api<MeResponse>("/api/v1/me"),
      api<{ users: Array<{ invitation: { pending: boolean } }> }>("/api/v1/users"),
      api<{ devices: Array<{ status: string }> }>("/api/v1/devices"),
      api<Overview>("/api/v1/reports/overview"),
    ]).then(([profile, userData, deviceData, overviewData]) => {
      setMe(profile);
      setOverview(overviewData);
      setSummary({
        users: userData.users.length,
        pendingInvitations: userData.users.filter((user) => user.invitation.pending).length,
        devices: deviceData.devices.length,
        pendingDevices: deviceData.devices.filter((device) => device.status === "PENDING").length,
      });
    });
  }, []);
  const firstName = me?.actor.displayName.split(" ")[0] ?? "Propriétaire";

  return (
    <section className="space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)] shadow-[var(--shadow-card)]">
            <ShieldCheck aria-hidden="true" className="size-3.5" /> Espace propriétaire
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Bonjour, {firstName}</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">{overview?.state === "ACTIVE" ? "Suivez les ventes réellement enregistrées dans vos boutiques." : overview?.state === "EMPTY" ? "Votre configuration est active. Le gérant peut maintenant ouvrir sa session et vendre." : "Terminez la configuration réelle de vos boutiques avant leur activation."}</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))] px-3 py-2 text-sm text-[var(--success)]">
          <span className="size-2 rounded-full bg-[var(--success)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_12%,transparent)]" /> Accès sécurisé
        </div>
      </header>

      <div className="grid overflow-hidden rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)] sm:grid-cols-2 xl:grid-cols-4">
        {[
          [UsersRound, "Utilisateurs", summary?.users],
          [UserPlus, "Invitations en attente", summary?.pendingInvitations],
          [TabletSmartphone, "Appareils enregistrés", summary?.devices],
          [KeyRound, "Approbations requises", summary?.pendingDevices],
        ].map(([Icon, label, value], index) => {
          const SummaryIcon = Icon as typeof UsersRound;
          return (
            <div key={String(label)} className={"px-5 py-4 " + (index > 0 ? "border-t border-[var(--separator)]/60 sm:border-l " : "") + (index === 2 ? "sm:border-l-0 xl:border-l " : "") + (index > 1 ? "xl:border-t-0" : "")}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                <SummaryIcon aria-hidden="true" className="size-4 text-[var(--primary)]" />
                {String(label)}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value === undefined ? "—" : String(value)}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Données d’accès réelles</p>
            </div>
          );
        })}
      </div>

      <div className="grid overflow-hidden rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)] sm:grid-cols-2 xl:grid-cols-4">
        {[
          [Store, "Boutiques", overview?.indicators.shops.total],
          [Boxes, "Produits / variantes", overview ? `${overview.indicators.catalog.products} / ${overview.indicators.catalog.variants}` : undefined],
          [Warehouse, "Stock disponible", overview?.indicators.stock.quantity],
          [WalletCards, "Ventes encaissées", overview ? `${overview.indicators.sales.revenueMinor} XAF` : undefined],
        ].map(([Icon, label, value], index) => {
          const MetricIcon = Icon as typeof Store;
          return <div key={String(label)} className={"px-5 py-4 " + (index > 0 ? "border-t border-[var(--separator)]/60 sm:border-l" : "")}>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]"><MetricIcon className="size-4 text-[var(--primary)]" />{String(label)}</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value === undefined ? "—" : String(value)}</p>
          </div>;
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-lg bg-[var(--surface)] px-5 py-5 shadow-[var(--shadow-card)] sm:px-6"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--primary)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))] text-[var(--primary)]">
            <Store aria-hidden="true" className="size-5" />
          </div>
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold">Configuration de l’activité</h2>
              <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">{overview?.state === "ACTIVE" ? "En activité" : overview?.state === "EMPTY" ? "Initialisée" : "En préparation"}</span>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">Les indicateurs ci-dessus proviennent des boutiques, du catalogue, des écritures de stock et des fonds réellement enregistrés.</p>
          </div>
        </div>
      </motion.div>

      <div>
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">Accès rapides</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Gérez les éléments déjà disponibles.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {quickLinks.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div key={item.href} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + index * 0.06 }}>
                <Link href={item.href} className="group flex h-full min-h-40 flex-col rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                  <div className={`grid size-11 place-items-center rounded-lg ${item.accent}`}><Icon aria-hidden="true" className="size-5" /></div>
                  <h3 className="mt-5 font-display font-semibold">{item.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">Ouvrir <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-display text-xl font-semibold">Mise en place</h2><p className="mt-1 text-sm text-[var(--muted)]">Les étapes qui préparent votre exploitation.</p></div>
            <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--muted)]">Phase 3</span>
          </div>
          <div className="mt-6 space-y-1">
            {[
              [true, "Accès propriétaire sécurisé", "MFA et session protégée"],
              [true, "Gestion des utilisateurs", "Invitations et affectations"],
              [true, "Appareils autorisés", "Approbation et révocation"],
              [Boolean(overview && overview.state === "EMPTY"), "Initialisation des boutiques", overview?.state === "EMPTY" ? "Au moins une boutique active" : "À finaliser dans l’assistant"],
            ].map(([done, title, detail], index) => (
              <div key={String(title)} className="relative flex gap-4 py-3">
                {index < 3 ? <span aria-hidden="true" className="absolute left-[0.94rem] top-9 h-6 w-px bg-[var(--separator)]" /> : null}
                <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ${done ? "bg-[color-mix(in_srgb,var(--success)_12%,var(--surface))] text-[var(--success)]" : "bg-[var(--surface-subtle)] text-[var(--muted)]"}`}>
                  {done ? <Check aria-hidden="true" className="size-4" /> : <Clock3 aria-hidden="true" className="size-4" />}
                </span>
                <div><p className="text-sm font-semibold">{String(title)}</p><p className="mt-0.5 text-sm text-[var(--muted)]">{String(detail)}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-lg bg-[color-mix(in_srgb,var(--brand-accent)_12%,var(--surface))] p-6">
          <div>
            <div className="grid size-11 place-items-center rounded-lg bg-[var(--brand-accent)] text-[var(--brand-accent-foreground)]"><ShieldCheck aria-hidden="true" className="size-5" /></div>
            <h2 className="mt-5 font-display text-xl font-semibold">Aucun chiffre artificiel</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Les indicateurs resteront vides jusqu’à l’enregistrement de données réelles issues de vos boutiques.</p>
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--success)]">Source de vérité préservée</p>
        </div>
      </div>
    </section>
  );
}
