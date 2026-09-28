"use client";

import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Package, Printer, ReceiptText, Search, ShoppingBag, Store, WalletCards } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, RequestError } from "../../lib/api";
import { paths } from "../../lib/session";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";

const money = (value: string | bigint | null | undefined) =>
  value == null ? "—" : `${BigInt(value).toLocaleString("fr-FR")} FCFA`;
const modeLabel = (value: string) =>
  value === "CASH" ? "Espèces" : value === "MOBILE_MONEY" ? "Mobile Money" : value === "BANK" ? "Banque" : "Autre";
const statusLabel = (value: string) =>
  value === "POSTED" ? "Enregistrée" : value === "REVERSED" ? "Renversée" : value;

type Shop = { id: string; name: string; status: string };
type Source = { id: string; name: string; type: string };
type User = { id: string; displayName: string; role: string };
type SaleRow = {
  id: string; reference: string; status: string; postedAt: string; businessDate: string;
  shopId: string; shopName: string; managerId: string; managerName: string; lineCount: number;
  netMinor: string; collectedMinor: string; paymentModes: string[]; paymentLabels: string[];
};
type SalesList = {
  period: { from: string; to: string; timezone: string };
  freshness: string;
  nextCursor: string | null;
  totals: { count: number; revenueMinor: string; collectedMinor: string; averageBasketMinor: string | null; reversedCount: number };
  sales: SaleRow[];
};
type OwnerSale = {
  id: string; reference: string; status: string; postedAt: string; businessDate: string;
  shop: { id: string; name: string }; manager: { id: string; name: string }; device: { id: string; name: string };
  grossMinor: string; discountMinor: string; netMinor: string; collectedMinor: string; dueMinor: string | null;
  costMinor: string; estimatedGrossMarginMinor: string; estimatedGrossMargin: boolean;
  lines: Array<{ id: string; product: string; variant: string; unit: string; symbol: string; quantity: string; unitPriceMinor: string; discountMinor: string; netMinor: string; costMinor: string; imageUrl: string | null }>;
  payments: Array<{ id: string; source: string; mode: string; amountMinor: string; cashReceivedMinor: string | null; changeDueMinor: string | null; changeGivenMinor: string | null; externalReference: string | null }>;
  timeline: Array<{ type: string; at: string; label: string }>;
};
type Overview = {
  state: "SETUP" | "EMPTY" | "ACTIVE";
  period: { from: string; to: string; timezone: string };
  freshness: string;
  calculatedAt: string;
  coverage: string;
  indicators: {
    shops: { total: number; byStatus: Record<string, number> };
    catalog: { products: number; variants: number };
    stock: { quantity: string; valueMinor: string };
    funds: { balanceMinor: string; activeSources: number };
    sales: {
      available: boolean; count: number; revenueMinor: string; collectedMinor: string;
      averageBasketMinor: string | null; shopsWithSales: number;
      variation: { available: boolean; bps: string | null; direction: "up" | "down" | "flat" | null };
    };
  };
  collections: { CASH: string; MOBILE_MONEY: string; BANK: string; OTHER: string; total: string };
  recentSales: Array<{ id: string; reference: string; shopName: string; managerName: string; netMinor: string; status: string; postedAt: string }>;
  shopComparisons: Array<{ shopId: string; name: string; revenueMinor: string; count: number; averageBasketMinor: string | null; lastSaleAt: string | null; freshness: string }>;
  topProducts: Array<{ variantId: string; product: string; variant: string; quantity: string; revenueMinor: string }>;
};

function queryString(params: URLSearchParams) {
  const value = params.toString();
  return value ? `?${value}` : "";
}

function FieldSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-[var(--separator)]/70 bg-[var(--surface-subtle)] px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--focus)_35%,transparent)]">
        {children}
      </select>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{hint}</p>
    </div>
  );
}

function variationLabel(variation: Overview["indicators"]["sales"]["variation"]) {
  if (!variation.available || variation.bps == null) return "Comparaison indisponible";
  const bps = BigInt(variation.bps);
  const sign = bps < 0n ? "-" : variation.direction === "up" ? "+" : "";
  const abs = bps < 0n ? -bps : bps;
  const percent = `${sign}${abs / 100n},${(abs % 100n).toString().padStart(2, "0")} %`;
  if (variation.direction === "flat") return "Identique à la période précédente";
  return `${percent} vs période précédente`;
}

function periodLabel(from: string, to: string) {
  const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return from === to ? format(from) : `Du ${format(from)} au ${format(to)}`;
}

function DashboardMetric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <div className="rounded-lg bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p></div><span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--surface-subtle)] text-[var(--primary)]">{icon}</span></div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{hint}</p></div>;
}

export function OwnerSalesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [data, setData] = useState<SalesList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [extra, setExtra] = useState<SaleRow[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const filters = useMemo(() => ({
    shopId: searchParams.get("shopId") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    managerId: searchParams.get("managerId") ?? "",
    status: searchParams.get("status") ?? "",
    paymentSourceId: searchParams.get("paymentSourceId") ?? "",
    query: searchParams.get("query") ?? "",
  }), [searchParams]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const setFilter = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}${queryString(next)}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setExtra([]);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    api<SalesList>(`/api/v1/owner/sales${queryString(query)}`)
      .then(setData)
      .catch((caught: RequestError) => setError(caught.message));
  }, [filters]);

  useEffect(() => {
    void Promise.all([
      api<{ shops: Shop[] }>("/api/v1/shops"),
      api<{ sources: Source[] }>("/api/v1/payment-sources"),
      api<{ users: User[] }>("/api/v1/users"),
    ]).then(([shopData, sourceData, userData]) => {
      setShops(shopData.shops);
      setSources(sourceData.sources);
      setManagers(userData.users.filter((user) => user.role === "MANAGER"));
    }).catch(() => undefined);
  }, []);

  const rows = [...(data?.sales ?? []), ...extra];
  const listQuery = queryString(searchParams);
  const selectedShop = shops.find((shop) => shop.id === filters.shopId);
  const advancedFilterCount = [filters.managerId, filters.status, filters.paymentSourceId, filters.query].filter(Boolean).length;
  const hasSales = Boolean(data && data.totals.count > 0);

  return (
    <section className="min-w-0 max-w-full space-y-6 overflow-x-clip">
      <PageHeader title="Ventes">
        Consultez les ventes réellement enregistrées, leurs encaissements et le détail de chaque ticket.
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
        <span>{data ? periodLabel(data.period.from, data.period.to) : "Période en cours de chargement"}</span>
        <span aria-hidden="true">·</span>
        <span>{selectedShop?.name ?? "Toutes les boutiques"}</span>
        <span aria-hidden="true">·</span>
        <span>{data ? `${data.totals.count} vente${data.totals.count > 1 ? "s" : ""}` : "—"}</span>
        <span aria-hidden="true">·</span>
        <span>{data?.freshness === "LIVE" ? "Données à jour" : data?.freshness ?? "—"}</span>
        {activeFilterCount ? <Badge>{activeFilterCount} filtre{activeFilterCount > 1 ? "s" : ""} actif{activeFilterCount > 1 ? "s" : ""}</Badge> : null}
      </div>
      {hasSales && data ? (
        <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="grid overflow-hidden rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)] sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Chiffre d’affaires" value={money(data.totals.revenueMinor)} hint="Somme des ventes enregistrées, hors monnaie rendue." />
          <Metric label="Ventes" value={String(data.totals.count)} hint="Nombre de tickets enregistrés sur la période." />
          <Metric label="Panier moyen" value={data.totals.averageBasketMinor ? money(data.totals.averageBasketMinor) : "Indisponible"} hint="Chiffre d’affaires divisé par le nombre de ventes." />
          <Metric label="Encaissements" value={money(data.totals.collectedMinor)} hint="Montants payés avec les moyens de paiement, distincts du solde actuel d’une caisse." />
        </motion.div>
      ) : !data ? <Skeleton className="h-28" /> : null}
      {data && data.totals.reversedCount > 0 ? <p className="text-sm text-[var(--muted)]">{data.totals.reversedCount} vente{data.totals.reversedCount > 1 ? "s" : ""} renversée{data.totals.reversedCount > 1 ? "s" : ""} sur cette période.</p> : null}
      <form className="rounded-lg bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]" onSubmit={(event) => event.preventDefault()}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(9rem,.65fr)_minmax(9rem,.65fr)_auto] md:items-end"><FieldSelect id="sales-shop" label="Boutique" value={filters.shopId} onChange={(value) => setFilter("shopId", value)}><option value="">Toutes les boutiques</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</FieldSelect><div className="space-y-1.5"><Label htmlFor="sales-from">Du</Label><Input id="sales-from" type="date" value={filters.from || data?.period.from || ""} onChange={(event) => setFilter("from", event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="sales-to">Au</Label><Input id="sales-to" type="date" value={filters.to || data?.period.to || ""} onChange={(event) => setFilter("to", event.target.value)} /></div><Button type="button" variant="secondary" onClick={() => setAdvancedOpen((value) => !value)}>Filtres avancés{advancedFilterCount ? ` (${advancedFilterCount})` : ""}</Button></div>
        {advancedOpen || advancedFilterCount ? <motion.div initial={reduced ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid gap-3 border-t border-[var(--separator)]/60 pt-4 md:grid-cols-2 xl:grid-cols-4"><FieldSelect id="sales-manager" label="Gérant" value={filters.managerId} onChange={(value) => setFilter("managerId", value)}><option value="">Tous les gérants</option>{managers.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</FieldSelect><FieldSelect id="sales-status" label="Statut" value={filters.status} onChange={(value) => setFilter("status", value)}><option value="">Tous les statuts</option><option value="POSTED">Enregistrée</option><option value="REVERSED">Renversée</option></FieldSelect><FieldSelect id="sales-source" label="Moyen de paiement" value={filters.paymentSourceId} onChange={(value) => setFilter("paymentSourceId", value)}><option value="">Tous les moyens</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</FieldSelect><div className="space-y-1.5"><Label htmlFor="sales-query">Recherche</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><Input id="sales-query" className="pl-9" placeholder="Référence ou produit" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} /></div></div></motion.div> : null}
        {activeFilterCount ? <div className="mt-3 flex justify-end"><Button type="button" variant="ghost" onClick={() => router.replace(pathname)}>Réinitialiser les filtres</Button></div> : null}
      </form>
      {!data ? <Skeleton className="h-64" /> : rows.length === 0 ? (
        <section className="rounded-lg bg-[var(--surface)] px-5 py-7 text-center shadow-[var(--shadow-card)]"><div className="mx-auto grid size-10 place-items-center rounded-md bg-[var(--surface-subtle)] text-[var(--primary)]"><ReceiptText className="size-5" /></div><h2 className="mt-3 font-display text-lg font-semibold">{activeFilterCount ? "Aucun résultat pour ces filtres" : "Aucune vente sur la période"}</h2><p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">{activeFilterCount ? "Modifiez ou réinitialisez les filtres pour élargir la recherche." : "Les ventes validées apparaîtront ici. Vous pouvez aussi choisir une période plus large ou consulter une autre boutique."}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{activeFilterCount ? <Button variant="secondary" onClick={() => router.replace(pathname)}>Réinitialiser les filtres</Button> : null}<Link href="/owner"><Button variant="secondary">Retour à la vue générale</Button></Link></div></section>
      ) : (
        <>
          <div className="hidden min-w-0 overflow-x-auto rounded-lg bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-[var(--surface-subtle)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Référence</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Boutique</th>
                  <th className="px-5 py-3 font-semibold">Gérant</th>
                  <th className="px-5 py-3 text-right font-semibold">Lignes</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 font-semibold">Paiement</th>
                  <th className="px-5 py-3 font-semibold">Statut</th>
                  <th className="px-5 py-3 font-semibold"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sale) => (
                  <tr key={sale.id} className="border-t border-[var(--separator)]/60">
                    <td className="px-5 py-3 font-medium">{sale.reference}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{new Date(sale.postedAt).toLocaleString("fr-FR")}</td>
                    <td className="px-5 py-3">{sale.shopName}</td>
                    <td className="px-5 py-3">{sale.managerName}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{sale.lineCount}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(sale.netMinor)}</td>
                    <td className="px-5 py-3">{sale.paymentLabels.join(", ")}</td>
                    <td className="px-5 py-3"><Badge>{statusLabel(sale.status)}</Badge></td>
                    <td className="px-5 py-3 text-right"><Link className="font-semibold text-[var(--primary)]" href={`/owner/sales/${sale.id}${listQuery}`}>Voir la vente</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 xl:hidden">
            {rows.map((sale) => (
              <li key={sale.id} className="rounded-lg bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display font-semibold">{sale.reference}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{sale.shopName} · {sale.managerName}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{new Date(sale.postedAt).toLocaleString("fr-FR")}</p>
                  </div>
                  <Badge>{statusLabel(sale.status)}</Badge>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-sm text-[var(--muted)]">{sale.lineCount} ligne{sale.lineCount > 1 ? "s" : ""} · {sale.paymentLabels.join(", ")}</p>
                  <strong className="tabular-nums">{money(sale.netMinor)}</strong>
                </div>
                <Link className="mt-3 inline-flex text-sm font-semibold text-[var(--primary)]" href={`/owner/sales/${sale.id}${listQuery}`}>Voir la vente</Link>
              </li>
            ))}
          </ul>
          {data.nextCursor ? (
            <Button variant="secondary" onClick={() => {
              const query = new URLSearchParams();
              for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
              query.set("cursor", data.nextCursor!);
              void api<SalesList>(`/api/v1/owner/sales${queryString(query)}`).then((page) => {
                setExtra((current) => [...current, ...page.sales]);
                setData({ ...data, nextCursor: page.nextCursor });
              });
            }}>Voir la suite</Button>
          ) : null}
        </>
      )}
    </section>
  );
}

export function OwnerSaleDetailPage({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const [sale, setSale] = useState<OwnerSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ sale: OwnerSale }>(`/api/v1/owner/sales/${id}`)
      .then(({ sale: value }) => setSale(value))
      .catch((caught: RequestError) => setError(caught.message));
  }, [id]);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!sale) return <Skeleton className="h-[36rem]" />;
  const back = `/owner/sales${queryString(searchParams)}`;
  const hasDiscount = BigInt(sale.discountMinor) > 0n;
  const hasDue = sale.dueMinor != null && BigInt(sale.dueMinor) > 0n;
  return (
    <section className="space-y-6">
      <PageHeader
        title="Détail de la vente"
        action={<div className="flex gap-2 print:hidden"><Link href={back}><Button variant="secondary"><ArrowLeft className="size-4" /> Retour</Button></Link><Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Imprimer</Button></div>}
      >
        Consultez le ticket, son encaissement et les écritures associées.
      </PageHeader>
      <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><Badge>{statusLabel(sale.status)}</Badge><span className="font-mono text-sm font-semibold">{sale.reference}</span></div><p className="mt-2 font-display text-lg font-semibold">{sale.shop.name}</p><p className="mt-1 text-sm text-[var(--muted)]">Enregistrée par {sale.manager.name} le {new Date(sale.postedAt).toLocaleString("fr-FR")}</p></div>
          <div className="grid gap-1 text-sm text-[var(--muted)] sm:text-right"><span>Appareil : {sale.device.name}</span><span>Journée d’activité : {new Date(`${sale.businessDate}T00:00:00Z`).toLocaleDateString("fr-FR")}</span></div>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--surface-subtle)] p-4"><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Total net de la vente</dt><dd className="mt-2 font-display text-2xl font-semibold tabular-nums">{money(sale.netMinor)}</dd></div>
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--success)_8%,var(--surface))] p-4"><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Total encaissé</dt><dd className="mt-2 font-display text-2xl font-semibold tabular-nums text-[var(--success)]">{money(sale.collectedMinor)}</dd></div>
        </dl>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-[var(--muted)]">Sous-total</dt><dd className="mt-0.5 font-semibold tabular-nums">{money(sale.grossMinor)}</dd></div>
          {hasDiscount ? <div><dt className="text-[var(--muted)]">Remise accordée</dt><dd className="mt-0.5 font-semibold tabular-nums text-[var(--success)]">− {money(sale.discountMinor)}</dd></div> : null}
          {hasDue ? <div><dt className="text-[var(--muted)]">Reste à payer</dt><dd className="mt-0.5 font-semibold tabular-nums text-[var(--warning)]">{money(sale.dueMinor)}</dd></div> : null}
        </dl>
        <div className="mt-5 border-t border-[var(--separator)]/60 pt-4"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Rentabilité propriétaire</p><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-[var(--muted)]">Coût alloué</dt><dd className="mt-1 font-semibold tabular-nums">{money(sale.costMinor)}</dd></div><div><dt className="text-sm text-[var(--muted)]">Marge brute estimée</dt><dd className="mt-1 font-semibold tabular-nums">{money(sale.estimatedGrossMarginMinor)}</dd>{sale.estimatedGrossMargin ? <p className="mt-1 text-xs text-[var(--muted)]">Calculée à partir des coûts alloués à cette vente.</p> : null}</div></dl></div>
      </section>
      <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Produits vendus</h2>
        <ul className="mt-3 divide-y divide-[var(--separator)]/60">
          {sale.lines.map((line) => (
            <li key={line.id} className="grid gap-3 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              {line.imageUrl ? <img src={line.imageUrl} alt="" className="size-14 rounded-md object-cover" /> : <div className="grid size-14 place-items-center rounded-md bg-[var(--surface-subtle)] text-[var(--muted)]"><Package className="size-5" /></div>}
              <div>
                <p className="font-medium">{line.product}</p>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{line.variant} · {line.unit}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{line.quantity} {line.symbol} × {money(line.unitPriceMinor)}{BigInt(line.discountMinor) > 0n ? ` · remise ${money(line.discountMinor)}` : ""}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Coût alloué : {money(line.costMinor)}</p>
              </div>
              <div className="sm:text-right"><p className="text-xs text-[var(--muted)]">Total de la ligne</p><strong className="mt-1 block tabular-nums">{money(line.netMinor)}</strong></div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Paiements</h2>
        <ul className="mt-3 space-y-3">
          {sale.payments.map((payment) => (
            <li key={payment.id} className="rounded-lg bg-[var(--surface-subtle)] p-4 text-sm">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-semibold">{modeLabel(payment.mode)} · {payment.source}</p>
                  {payment.externalReference ? <p className="text-[var(--muted)]">Référence {payment.externalReference}</p> : null}
                </div>
                <div className="text-right"><p className="text-xs text-[var(--muted)]">Montant encaissé</p><strong className="mt-1 block tabular-nums">{money(payment.amountMinor)}</strong></div>
              </div>
              {payment.mode === "CASH" ? (
                BigInt(payment.changeDueMinor ?? "0") > 0n ? <dl className="mt-3 grid gap-3 border-t border-[var(--separator)]/60 pt-3 sm:grid-cols-3"><div><dt className="text-[var(--muted)]">Somme remise par le client</dt><dd className="mt-1 font-semibold tabular-nums">{money(payment.cashReceivedMinor)}</dd></div><div><dt className="text-[var(--muted)]">Monnaie à rendre</dt><dd className="mt-1 font-semibold tabular-nums">{money(payment.changeDueMinor)}</dd></div><div><dt className="text-[var(--muted)]">Monnaie rendue</dt><dd className="mt-1 font-semibold tabular-nums text-[var(--success)]">{money(payment.changeGivenMinor)}</dd></div></dl> : <p className="mt-3 flex items-center gap-2 border-t border-[var(--separator)]/60 pt-3 text-[var(--muted)]"><CheckCircle2 className="size-4 text-[var(--success)]" /> Paiement exact, aucune monnaie à rendre.</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Traçabilité</h2>
        <ol className="relative mt-4 space-y-0 text-sm before:absolute before:bottom-4 before:left-[0.6875rem] before:top-4 before:w-px before:bg-[var(--separator)]">
          {sale.timeline.map((event, index) => (
            <li key={`${event.type}-${index}`} className="relative flex gap-3 py-3">
              <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-[var(--primary)]">{index === sale.timeline.length - 1 ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="font-medium">{event.label}</span><time className="text-xs text-[var(--muted)]" dateTime={event.at}>{new Date(event.at).toLocaleString("fr-FR")}</time></div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

export function OwnerDashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reduced = useReducedMotion();
  const shopId = searchParams.get("shopId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams();
    if (shopId) query.set("shopId", shopId);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    setError(null);
    void Promise.all([api<Overview>(`/api/v1/reports/overview${queryString(query)}`), api<{ shops: Shop[] }>("/api/v1/shops")])
      .then(([overviewData, shopData]) => { setOverview(overviewData); setShops(shopData.shops); })
      .catch((caught: RequestError) => setError(caught.message));
  }, [from, shopId, to]);

  const setScope = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`/owner${queryString(next)}`);
  };
  const salesHref = `/owner/sales${queryString(new URLSearchParams({ ...(shopId ? { shopId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }))}`;
  const selectedShop = shops.find((shop) => shop.id === shopId);
  const sales = overview?.indicators.sales;
  const hasSales = Boolean(sales?.available && sales.count > 0);

  return <section className="min-w-0 max-w-full space-y-5 overflow-x-clip">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-3xl font-semibold tracking-[-0.035em]">Vue générale</h1>{overview ? <Badge>{overview.state === "ACTIVE" ? "En activité" : overview.state === "EMPTY" ? "Initialisée" : "En préparation"}</Badge> : null}</div><p className="mt-1.5 max-w-2xl text-sm text-[var(--muted)]">Suivez les ventes, les encaissements et l’activité de vos boutiques à partir des opérations réellement enregistrées.</p></div>
      <div className="flex flex-wrap gap-2"><Link href={salesHref}><Button><ReceiptText className="size-4" /> Voir les ventes</Button></Link><Link href={paths.ownerSources}><Button variant="secondary"><WalletCards className="size-4" /> Sources de fonds</Button></Link></div>
    </header>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <section className="rounded-lg bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="grid gap-3 sm:grid-cols-3"><FieldSelect id="dash-shop" label="Boutique" value={shopId} onChange={(value) => setScope("shopId", value)}><option value="">Toutes les boutiques</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</FieldSelect><div className="space-y-1.5"><Label htmlFor="dash-from">Du</Label><Input id="dash-from" type="date" value={from || overview?.period.from || ""} onChange={(event) => setScope("from", event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="dash-to">Au</Label><Input id="dash-to" type="date" value={to || overview?.period.to || ""} onChange={(event) => setScope("to", event.target.value)} /></div></div>
      {overview ? <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]"><CalendarDays className="size-3.5" /><span>{periodLabel(overview.period.from, overview.period.to)}</span><span aria-hidden="true">·</span><span>{selectedShop?.name ?? "Toutes les boutiques"}</span><span aria-hidden="true">·</span><span>{overview.freshness === "LIVE" ? "Données à jour" : `Couverture ${overview.freshness}`}</span><span aria-hidden="true">·</span><span>Actualisé à {new Date(overview.calculatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></div> : null}
    </section>
    {!overview ? <Skeleton className="h-40" /> : overview.state !== "ACTIVE" || !sales?.available ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><DashboardMetric icon={<Store className="size-4" />} label="Boutiques" value={String(overview.indicators.shops.total)} hint="Boutiques réellement configurées." /><DashboardMetric icon={<ShoppingBag className="size-4" />} label="Catalogue" value={`${overview.indicators.catalog.products} / ${overview.indicators.catalog.variants}`} hint="Produits et variantes existants." /><DashboardMetric icon={<ShoppingBag className="size-4" />} label="Stock disponible" value={overview.indicators.stock.quantity} hint="Quantités issues des écritures validées." /><DashboardMetric icon={<WalletCards className="size-4" />} label="Fonds enregistrés" value={money(overview.indicators.funds.balanceMinor)} hint="Soldes actuels, distincts des encaissements." /></div><EmptyState icon={<Store />} title="Aucune activité commerciale à afficher">Les indicateurs de vente apparaîtront après le premier encaissement réel dans ce périmètre.</EmptyState></> : <>
      <motion.div initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><DashboardMetric icon={<CircleDollarSign className="size-4" />} label="Chiffre d’affaires" value={money(sales.revenueMinor)} hint="Montant net vendu sur la période." /><DashboardMetric icon={<WalletCards className="size-4" />} label="Encaissements" value={money(sales.collectedMinor)} hint="Paiements reçus, hors solde actuel des caisses." /><DashboardMetric icon={<ReceiptText className="size-4" />} label="Ventes" value={String(sales.count)} hint="Nombre de tickets enregistrés." /><DashboardMetric icon={<ShoppingBag className="size-4" />} label="Panier moyen" value={sales.averageBasketMinor ? money(sales.averageBasketMinor) : "Indisponible"} hint="Chiffre d’affaires divisé par le nombre de ventes." /></motion.div>
      {hasSales ? <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-[var(--surface)] px-3 py-1.5 shadow-[var(--shadow-card)]">{variationLabel(sales.variation)}</span><span className="rounded-full bg-[var(--surface)] px-3 py-1.5 shadow-[var(--shadow-card)]">{sales.shopsWithSales} boutique{sales.shopsWithSales > 1 ? "s" : ""} avec ventes</span></div> : null}
      {!hasSales ? <section className="rounded-lg bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]"><div className="mx-auto max-w-xl text-center"><div className="mx-auto grid size-11 place-items-center rounded-lg bg-[var(--surface-subtle)] text-[var(--primary)]"><ReceiptText className="size-5" /></div><h2 className="mt-3 font-display text-lg font-semibold">Aucune vente sur cette période</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Aucune opération ne correspond à {selectedShop?.name ?? "l’ensemble des boutiques"} pour {periodLabel(overview.period.from, overview.period.to).toLowerCase()}. Modifiez la période ou consultez l’historique complet.</p><Link href={salesHref} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">Ouvrir l’historique <ArrowRight className="size-4" /></Link></div></section> : <>
        <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-lg font-semibold">Ventes récentes</h2><p className="mt-1 text-sm text-[var(--muted)]">Dernières opérations de la période.</p></div><Link href={salesHref} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">Tout voir <ArrowRight className="size-4" /></Link></div><ul className="mt-3 divide-y divide-[var(--separator)]/60">{overview.recentSales.map((sale) => <li key={sale.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><Link className="font-semibold hover:text-[var(--primary)]" href={`/owner/sales/${sale.id}`}>{sale.reference}</Link><p className="text-sm text-[var(--muted)]">{sale.shopName} · {sale.managerName} · {new Date(sale.postedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p></div><div className="flex items-center gap-3"><Badge>{statusLabel(sale.status)}</Badge><strong className="tabular-nums">{money(sale.netMinor)}</strong></div></li>)}</ul></div><div className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-lg font-semibold">Encaissements</h2><p className="mt-1 text-sm text-[var(--muted)]">Flux reçus par moyen de paiement.</p></div><Link href={paths.ownerSources} className="text-sm font-semibold text-[var(--primary)]">Détails</Link></div><ul className="mt-4 space-y-2 text-sm">{(["CASH", "MOBILE_MONEY", "BANK", "OTHER"] as const).filter((type) => BigInt(overview.collections[type]) !== 0n).map((type) => <li key={type} className="flex justify-between gap-4"><span>{modeLabel(type)}</span><strong className="tabular-nums">{money(overview.collections[type])}</strong></li>)}<li className="flex justify-between gap-4 border-t border-[var(--separator)]/60 pt-3"><span>Total encaissé</span><strong className="tabular-nums">{money(overview.collections.total)}</strong></li></ul></div></section>
        {overview.shopComparisons.length > 1 ? <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display text-lg font-semibold">Comparaison des boutiques</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[42rem] text-sm"><thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="py-2 font-semibold">Boutique</th><th className="py-2 text-right font-semibold">Chiffre d’affaires</th><th className="py-2 text-right font-semibold">Ventes</th><th className="py-2 text-right font-semibold">Panier moyen</th><th className="py-2 pl-5 font-semibold">Dernière vente</th></tr></thead><tbody>{overview.shopComparisons.map((shop) => <tr key={shop.shopId} className="border-t border-[var(--separator)]/60"><td className="py-3 font-medium">{shop.name}</td><td className="py-3 text-right tabular-nums">{money(shop.revenueMinor)}</td><td className="py-3 text-right tabular-nums">{shop.count}</td><td className="py-3 text-right tabular-nums">{shop.averageBasketMinor ? money(shop.averageBasketMinor) : "—"}</td><td className="py-3 pl-5 text-[var(--muted)]">{shop.lastSaleAt ? new Date(shop.lastSaleAt).toLocaleString("fr-FR") : "—"}</td></tr>)}</tbody></table></div></section> : null}
        {overview.topProducts.length ? <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display text-lg font-semibold">Produits les plus vendus</h2><ul className="mt-3 grid gap-2 md:grid-cols-2">{overview.topProducts.map((product) => <li key={product.variantId} className="flex items-center justify-between gap-4 rounded-md bg-[var(--surface-subtle)] px-4 py-3 text-sm"><div><p className="font-medium">{product.product}</p><p className="text-[var(--muted)]">{product.variant} · {product.quantity}</p></div><strong className="tabular-nums">{money(product.revenueMinor)}</strong></li>)}</ul></section> : null}
      </>}
    </>}
  </section>;
}
