"use client";

import {
  Banknote,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Package,
  PackageCheck,
  CircleAlert,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShoppingCart,
  ReceiptText,
  SlidersHorizontal,
  TabletSmartphone,
  Truck,
  UsersRound,
  WalletCards,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { paths, type MeResponse } from "../../lib/session";
import { BrandLogo } from "../brand/logo";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { ThemeSwitcher } from "./theme-switcher";

type NavigationLink = { href: string; label: string; icon: LucideIcon };
type NavigationGroup = { label: string; icon: LucideIcon; children: NavigationLink[] };
type NavigationItem = NavigationLink | NavigationGroup;

const ownerLinks: NavigationItem[] = [
  { href: paths.ownerHome, label: "Vue générale", icon: LayoutDashboard },
  {
    label: "Ventes et caisse",
    icon: Banknote,
    children: [
      { href: paths.ownerSales, label: "Ventes", icon: ReceiptText },
      { href: paths.ownerSessions, label: "Sessions de caisse", icon: Banknote },
      { href: paths.ownerExpenses, label: "Dépenses", icon: WalletCards },
      { href: paths.ownerFunds, label: "Mouvements de fonds", icon: WalletCards },
      { href: paths.ownerDiscrepancies, label: "Écarts de caisse", icon: CircleAlert },
    ],
  },
  {
    label: "Stock et achats",
    icon: Package,
    children: [
      { href: paths.ownerStock, label: "État du stock", icon: Warehouse },
      { href: paths.ownerProducts, label: "Catalogue", icon: Boxes },
      { href: paths.ownerPurchases, label: "Achats", icon: Package },
      { href: paths.ownerRequests, label: "Demandes d’achat", icon: ClipboardList },
      { href: paths.ownerTransfers, label: "Transferts", icon: PackageCheck },
      { href: paths.ownerSuppliers, label: "Fournisseurs", icon: Warehouse },
    ],
  },
  {
    label: "Organisation",
    icon: Settings2,
    children: [
      { href: paths.ownerShops, label: "Boutiques", icon: Building2 },
      { href: paths.ownerUsers, label: "Utilisateurs", icon: UsersRound },
      { href: paths.ownerDevices, label: "Appareils", icon: TabletSmartphone },
      { href: paths.ownerSources, label: "Sources de fonds", icon: WalletCards },
      { href: paths.ownerLocations, label: "Lieux", icon: Warehouse },
      { href: paths.ownerSettings, label: "Paramètres métier", icon: SlidersHorizontal },
    ],
  },
  { href: paths.ownerAccount, label: "Mon compte", icon: CircleUserRound },
];

const managerLinks: NavigationItem[] = [
  { href: paths.managerHome, label: "Vue générale", icon: LayoutDashboard },
  { href: paths.managerSale, label: "Vendre", icon: ShoppingCart },
  { label: "Ventes et caisse", icon: Banknote, children: [
    { href: paths.managerCash, label: "Caisse du jour", icon: Banknote },
    { href: paths.managerSales, label: "Historique des ventes", icon: ReceiptText },
    { href: paths.managerExpenses, label: "Dépenses", icon: WalletCards },
    { href: paths.managerFunds, label: "Mouvements de fonds", icon: WalletCards },
    { href: paths.managerDiscrepancies, label: "Demandes d’explication", icon: CircleAlert },
  ] },
  { label: "Stock et achats", icon: Package, children: [
    { href: paths.managerStock, label: "État du stock", icon: Warehouse },
    { href: paths.managerRequests, label: "Demandes d’achat", icon: ClipboardList },
    { href: paths.managerPurchases, label: "Achats autorisés", icon: Package },
    { href: paths.managerReceipts, label: "Réceptions", icon: PackageCheck },
    { href: paths.managerTransfers, label: "Expéditions", icon: Truck },
  ] },
  { href: paths.managerDevice, label: "Mon appareil", icon: TabletSmartphone },
];

export function AppShell({ role, children }: { role: "OWNER" | "MANAGER"; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ "Ventes et caisse": true });

  useEffect(() => {
    api<MeResponse>("/api/v1/me")
      .then((profile) => {
        if (profile.actor.role !== role) {
          router.replace(profile.actor.role === "OWNER" ? paths.ownerHome : paths.managerHome);
          return;
        }
        if (profile.next === "ENROLL_MFA") {
          router.replace(paths.loginMfa);
          return;
        }
        setMe(profile);
      })
      .catch((caught: { status?: number; message?: string }) => {
        if (caught.status === 401) {
          router.replace(paths.loginExpired);
          return;
        }
        setError(caught.message ?? "Impossible de charger le profil.");
      });
  }, [role, router]);

  useEffect(() => {
    const redirectToLogin = () => {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?reason=session&returnTo=${encodeURIComponent(returnTo)}`);
    };
    window.addEventListener("cercle:session-expired", redirectToLogin);
    return () => window.removeEventListener("cercle:session-expired", redirectToLogin);
  }, [router]);

  const links = role === "OWNER" ? ownerLinks : managerLinks;
  useEffect(() => {
    const activeGroup = links.find((item): item is NavigationGroup => "children" in item && item.children.some((child) => pathname === child.href));
    if (activeGroup) setOpenGroups((current) => current[activeGroup.label] ? current : { ...current, [activeGroup.label]: true });
  }, [links, pathname]);
  const pageLabel =
    pathname.startsWith("/owner/sales/") ? "Détail de vente" :
    pathname.startsWith("/owner/sessions/") ? "Fiche de session" :
    pathname.startsWith("/owner/discrepancies/") ? "Dossier d’écart" :
    pathname === paths.ownerPurchaseNew ? "Nouvel achat" :
    pathname.startsWith("/owner/purchases/") ? "Fiche d’achat" :
    pathname.startsWith("/owner/requests/") ? "Décision de demande" :
    pathname.startsWith("/owner/transfers/") ? "Suivi d’expédition" :
    pathname.startsWith("/owner/suppliers/") ? "Fiche fournisseur" :
    pathname.startsWith("/manager/requests/") ? "Détail de demande" :
    pathname.startsWith("/manager/receipts/") ? "Réception" :
    pathname.startsWith("/manager/transfers/") ? "Expédition" :
    pathname.startsWith("/manager/purchases/") ? "Achat autorisé" :
    ({
      [paths.ownerHome]: "Vue générale",
      [paths.ownerSales]: "Ventes",
      [paths.ownerSessions]: "Sessions de caisse",
      [paths.ownerExpenses]: "Dépenses",
      [paths.ownerFunds]: "Mouvements de fonds",
      [paths.ownerDiscrepancies]: "Écarts de caisse",
      [paths.ownerUsers]: "Utilisateurs",
      [paths.ownerDevices]: "Appareils",
      [paths.ownerAccount]: "Mon compte",
      [paths.ownerShops]: "Boutiques",
      [paths.ownerProducts]: "Catalogue",
      [paths.ownerSources]: "Sources de fonds",
      [paths.ownerLocations]: "Lieux",
      [paths.ownerSettings]: "Paramètres métier",
      [paths.ownerStock]: "Stock",
      [paths.ownerRequests]: "Demandes",
      [paths.ownerPurchases]: "Achats",
      [paths.ownerPurchaseNew]: "Nouvel achat",
      [paths.ownerSuppliers]: "Fournisseurs",
      [paths.ownerTransfers]: "Transferts",
      [paths.ownerTransferNew]: "Nouveau transfert",
      [paths.setup]: "Initialisation",
      [paths.managerHome]: "Vue générale",
      [paths.managerDevice]: "Mon appareil",
      [paths.managerStock]: "Stock",
      [paths.managerSale]: "Nouvelle vente",
      [paths.managerSalePayment]: "Paiement",
      [paths.managerSales]: "Historique des ventes",
      [paths.managerCash]: "Caisse du jour",
      [paths.managerCashCount]: "Comptage",
      [paths.managerExpenses]: "Dépenses",
      [paths.managerFunds]: "Mouvements de fonds",
      [paths.managerDiscrepancies]: "Demandes d’explication",
      [paths.managerRequests]: "Demandes d’achat",
      [paths.managerRequestNew]: "Nouvelle demande",
      [paths.managerPurchases]: "Achats autorisés",
      [paths.managerPurchaseNew]: "Achat autorisé",
      [paths.managerReceipts]: "Réceptions",
      [paths.managerTransfers]: "Expéditions",
    } as Record<string, string>)[pathname] ?? "Vue générale";

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" });
    router.replace(paths.login);
  }

  const navigation = (compact = false) => (
    <nav aria-label={compact ? "Navigation compacte" : "Navigation principale"} className="flex flex-col gap-1.5">
      {links.map((link) => {
        const Icon = link.icon;
        if ("children" in link && link.children) {
          const activeGroup = link.children.some((child) => pathname === child.href);
          const groupOpen = Boolean(openGroups[link.label]);
          return (
            <div key={link.label} className="space-y-1">
              <button
                type="button"
                aria-expanded={groupOpen}
                title={!compact ? link.label : undefined}
                onClick={() => setOpenGroups((current) => ({ ...current, [link.label]: !current[link.label] }))}
                className={`group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 font-display text-sm font-medium transition-colors ${activeGroup ? "text-[var(--primary)]" : "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"} ${!compact ? "md:justify-center md:px-0" : ""} ${!compact && !collapsed ? "lg:justify-start lg:px-3" : ""}`}
              >
                <Icon aria-hidden="true" className="size-[1.15rem] shrink-0" />
                <span className={`flex-1 whitespace-nowrap text-left ${!compact ? (collapsed ? "md:sr-only" : "md:sr-only lg:not-sr-only") : ""}`}>{link.label}</span>
                <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${groupOpen ? "rotate-180" : ""} ${!compact ? "md:hidden lg:block" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {groupOpen ? (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`space-y-1 overflow-hidden border-l border-[var(--separator)]/60 pl-2 ${!compact && !collapsed ? "lg:ml-5" : ""}`}>
                    {link.children.map((child) => {
                      const ChildIcon = child.icon;
                      const active = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          title={!compact ? child.label : undefined}
                          className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${active ? "bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))] text-[var(--primary)]" : "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"} ${!compact ? "md:justify-center md:px-0" : ""} ${!compact && !collapsed ? "lg:justify-start lg:px-3" : ""}`}
                        >
                          <ChildIcon aria-hidden="true" className="size-4 shrink-0" />
                          <span className={`${!compact ? (collapsed ? "md:sr-only" : "md:sr-only lg:not-sr-only") : ""}`}>{child.label}</span>
                        </Link>
                      );
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        }

        if (!("href" in link)) return null;
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            title={collapsed && !compact ? link.label : undefined}
            className={`group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-lg px-3 font-display text-sm font-medium transition-colors duration-200 ${
              active ? "text-[var(--primary)]" : "text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"
            } ${!compact ? "md:justify-center md:px-0" : ""} ${!compact && !collapsed ? "lg:justify-start lg:px-3" : ""}`}
          >
            {active ? (
              <motion.span
                layoutId={compact ? "active-mobile-navigation" : "active-desktop-navigation"}
                className="absolute inset-0 bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <Icon aria-hidden="true" className={`relative z-10 size-[1.15rem] shrink-0 transition-transform duration-200 group-hover:scale-105 ${active ? "text-[var(--primary)]" : ""}`} />
            <span className={`relative z-10 whitespace-nowrap ${!compact ? (collapsed ? "md:sr-only" : "md:sr-only lg:not-sr-only") : ""}`}>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  if (error) return <p className="p-6" role="alert">{error}</p>;
  if (!me) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
        <div className="w-full max-w-sm space-y-4"><Skeleton className="h-12" /><Skeleton className="h-48" /></div>
      </div>
    );
  }

  const initials = me.actor.displayName.slice(0, 2).toUpperCase();
  const contextLabel = me.shop?.name ?? (role === "OWNER" ? "Toutes les boutiques" : "Aucune boutique");

  return (
    <div className={`min-h-screen bg-[var(--background)] text-[var(--foreground)] lg:grid ${collapsed ? "lg:grid-cols-[4.75rem_1fr]" : "lg:grid-cols-[15.5rem_1fr]"}`}>
      <aside className="sticky top-0 hidden h-screen border-r border-[var(--separator)]/60 bg-[var(--surface)] px-3 py-4 lg:flex lg:flex-col">
        <div className={`flex min-h-12 items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          <div className={collapsed ? "hidden" : "hidden lg:block"}><BrandLogo official /></div>
          <div className={collapsed ? "block" : "lg:hidden"}><BrandLogo compact /></div>
          <Button
            className={`hidden size-9 min-h-9 min-w-9 rounded-lg lg:inline-flex ${collapsed ? "absolute -right-4 top-7 bg-[var(--surface)] shadow-[var(--shadow-card)]" : ""}`}
            variant="ghost"
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navigation()}
        </div>
        <div className={`mt-3 shrink-0 rounded-xl bg-[var(--surface-subtle)] p-3 md:bg-transparent md:p-0 ${collapsed ? "lg:bg-transparent" : "lg:bg-[var(--surface-subtle)] lg:p-3"}`}>
          <div className={`flex items-center gap-3 md:justify-center ${!collapsed ? "lg:justify-start" : ""}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-accent)] text-xs font-bold text-[var(--brand-accent-foreground)]">{initials}</span>
            <div className={`min-w-0 md:hidden ${collapsed ? "lg:hidden" : "lg:block"}`}>
              <p className="truncate text-sm font-semibold">{me.actor.displayName}</p>
              <p className="truncate text-xs text-[var(--muted)]">{role === "OWNER" ? "Propriétaire" : "Gérant"}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-[var(--separator)]/60 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] px-4 backdrop-blur-xl md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button className="size-10 min-h-10 min-w-10 lg:hidden" variant="ghost" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(true)}><Menu className="size-5" /></Button>
            <span className="lg:hidden"><BrandLogo compact /></span>
            <p className="hidden min-w-0 items-center gap-1.5 text-xs text-[var(--muted)] xl:flex">
              <span>{role === "OWNER" ? "Espace propriétaire" : "Espace gérant"}</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-[var(--foreground)]">{pageLabel}</span>
            </p>
            <div className="hidden min-w-0 items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm shadow-[var(--shadow-card)] sm:flex">
              <Building2 aria-hidden="true" className="size-4 text-[var(--primary)]" />
              <span className="max-w-48 truncate">{contextLabel}</span>
              <ChevronDown aria-hidden="true" className="size-3.5 text-[var(--muted)]" />
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <ThemeSwitcher />
            <Button variant="ghost" className="relative size-10 min-h-10 min-w-10 rounded-lg" aria-label="Notifications">
              <Bell aria-hidden="true" className="size-[1.15rem]" />
              <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[var(--brand-accent)]" />
            </Button>
            <div className="relative">
              <Button variant="ghost" className="min-h-10 rounded-lg p-1.5 sm:pr-2" aria-label={`Ouvrir le profil de ${me.actor.displayName}`} aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((value) => !value)}>
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-[var(--brand-accent)] text-xs font-bold text-[var(--brand-accent-foreground)]">{initials}</span>
                <ChevronDown aria-hidden="true" className={`hidden size-3.5 text-[var(--muted)] transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`} />
              </Button>
              <AnimatePresence>
                {profileOpen ? (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 z-40 mt-2 w-64 origin-top-right rounded-xl bg-[var(--surface)] p-2 shadow-[var(--shadow-float)]"
                  >
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-semibold">{me.actor.displayName}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{me.actor.email}</p>
                    </div>
                    <div className="mx-2 h-px bg-[var(--separator)]/70" />
                    <Button className="mt-1 w-full justify-start text-sm" variant="ghost" onClick={() => void signOut()}><LogOut aria-hidden="true" className="size-4" /> Se déconnecter</Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto min-w-0 w-full max-w-[96rem] overflow-x-clip px-4 pb-12 pt-6 md:px-6 lg:px-8"
        >
          {children}
        </motion.main>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Navigation">
        <div className="mb-7"><BrandLogo official /></div>
        {navigation(true)}
      </Sheet>
    </div>
  );
}
