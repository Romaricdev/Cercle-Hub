import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  assignManager,
  createDepot,
  createPaymentSource,
  createPolicy,
  createPrice,
  createProduct,
  createShop,
  createUnit,
  createVariant,
  saveOpeningDraft,
  transitionShop,
  validateOpening,
} from "../packages/domain/src/index.ts";

const OWNER_EMAIL = "owner.local@example.test";
const MANAGER_EMAIL = "manager.local@example.test";
const SHOP_ACTIVE_CODE = "CC01";
const SHOP_PREP_CODE = "CC02";
const PRODUCT_SKU = "SEED-RIZ";

function assertLocalDevelopmentDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Le seed P03 refuse un hôte qui n’est pas 127.0.0.1 ou localhost.");
  }
  if (name.endsWith("_test")) {
    throw new Error("Le seed P03 refuse la base de test. Utiliser DATABASE_URL (cercle_complet).");
  }
}

function ctx(organizationId: string, actorId: string, label: string) {
  const key = crypto.randomUUID();
  return { organizationId, actorId, actorRole: "OWNER" as const, key, requestId: `seed-p03-${label}-${key}` };
}

async function main(): Promise<void> {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL est requis.");
  assertLocalDevelopmentDatabase(databaseUrl);

  const prisma = createPrismaClient(databaseUrl);
  try {
    const ownerUser = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
    const managerUser = await prisma.user.findUnique({ where: { email: MANAGER_EMAIL } });
    if (!ownerUser || !managerUser) {
      throw new Error("Comptes locaux absents. Exécutez d’abord : corepack pnpm db:seed-local");
    }
    const owner = await prisma.appUser.findFirst({ where: { authUserId: ownerUser.id, role: "OWNER" } });
    const manager = await prisma.appUser.findFirst({ where: { authUserId: managerUser.id, role: "MANAGER" } });
    if (!owner || !manager) {
      throw new Error("Profils AppUser absents. Exécutez d’abord : corepack pnpm db:seed-local");
    }

    const organizationId = owner.organizationId;
    const ownerCtx = (label: string) => ctx(organizationId, owner.id, label);

    if ((await prisma.policy.count({ where: { organizationId, shopId: null } })) === 0) {
      await createPolicy(prisma, ownerCtx("policy-org"), {
        values: { lots: false, expiry: false, advancedUnits: true, thresholds: true },
        reason: "Configuration seed locale P03",
      });
      console.log("Politique entreprise enregistrée.");
    } else {
      console.log("Politique entreprise déjà présente.");
    }

    if (!(await prisma.location.findFirst({ where: { organizationId, type: "DEPOT" } }))) {
      await createDepot(prisma, ownerCtx("depot"), { name: "Dépôt central" });
      console.log("Dépôt central activé.");
    } else {
      console.log("Dépôt central déjà présent.");
    }

    let activeShop = await prisma.shop.findFirst({ where: { organizationId, code: SHOP_ACTIVE_CODE } });
    if (!activeShop) {
      const created = await createShop(prisma, ownerCtx("shop-active"), {
        code: SHOP_ACTIVE_CODE,
        name: "Boutique Centre-ville",
      });
      activeShop = await prisma.shop.findUniqueOrThrow({ where: { id: created.id } });
      console.log(`Boutique créée : ${SHOP_ACTIVE_CODE}`);
    } else {
      console.log(`Boutique déjà présente : ${SHOP_ACTIVE_CODE} (${activeShop.status})`);
    }

    let prepShop = await prisma.shop.findFirst({ where: { organizationId, code: SHOP_PREP_CODE } });
    if (!prepShop) {
      const created = await createShop(prisma, ownerCtx("shop-prep"), {
        code: SHOP_PREP_CODE,
        name: "Boutique en préparation",
      });
      prepShop = await prisma.shop.findUniqueOrThrow({ where: { id: created.id } });
      console.log(`Boutique brouillon créée : ${SHOP_PREP_CODE} (SETUP, sans initialisation)`);
    } else {
      console.log(`Boutique brouillon déjà présente : ${SHOP_PREP_CODE}`);
    }

    const activeAssignments = await prisma.managerAssignment.count({ where: { shopId: activeShop.id, endedAt: null } });
    if (activeAssignments === 0) {
      await assignManager(prisma, {
        organizationId,
        actorId: owner.id,
        shopId: activeShop.id,
        userId: manager.id,
        reason: "Responsable seed local P03",
        requestId: crypto.randomUUID(),
      });
      console.log("Gérant affecté à la boutique active.");
    }

    let variantId: string;
    const existingProduct = await prisma.product.findFirst({
      where: { organizationId, sku: PRODUCT_SKU },
      include: { variants: { include: { units: true } } },
    });
    if (!existingProduct) {
      const product = await createProduct(prisma, ownerCtx("product-riz"), {
        name: "Riz local",
        sku: PRODUCT_SKU,
        family: "Épicerie",
        shopIds: [activeShop.id, prepShop.id],
      });
      const variant = await createVariant(prisma, ownerCtx("variant-riz"), product.id, { name: "Sac 25 kg", sku: "SEED-RIZ-25" });
      const unit = await createUnit(prisma, ownerCtx("unit-riz"), variant.id, {
        name: "Sac",
        symbol: "sac",
        factor: "1",
        precision: 0,
        isReference: true,
      });
      await createPrice(prisma, ownerCtx("price-riz"), { saleUnitId: unit.id, shopId: activeShop.id, amountMinor: "15000" });
      variantId = variant.id;
      console.log("Catalogue seed : Riz local / Sac 25 kg / prix 15 000.");
    } else {
      const variant = existingProduct.variants[0];
      if (!variant?.units[0]) {
        throw new Error("Produit seed incomplet : relancez après correction manuelle ou supprimez SEED-RIZ.");
      }
      variantId = variant.id;
      console.log("Catalogue seed déjà présent (Riz local).");
    }

    if ((await prisma.product.count({ where: { organizationId, sku: "SEED-HUILE" } })) === 0) {
      const huile = await createProduct(prisma, ownerCtx("product-huile"), {
        name: "Huile végétale",
        sku: "SEED-HUILE",
        shopIds: [activeShop.id],
      });
      await createVariant(prisma, ownerCtx("variant-huile"), huile.id, { name: "Bidon 5 L" });
      console.log("Catalogue seed : Huile végétale (sans stock).");
    }

    let cashSource = await prisma.paymentSource.findFirst({
      where: { organizationId, shopId: activeShop.id, name: "Caisse principale" },
    });
    if (!cashSource) {
      const created = await createPaymentSource(prisma, ownerCtx("source-cash"), {
        name: "Caisse principale",
        type: "CASH",
        shopId: activeShop.id,
      });
      cashSource = await prisma.paymentSource.findUniqueOrThrow({ where: { id: created.id } });
      console.log("Source de fonds : Caisse principale.");
    }

    if (!(await prisma.paymentSource.findFirst({ where: { organizationId, shopId: null, name: "Compte banque seed" } }))) {
      await createPaymentSource(prisma, ownerCtx("source-bank"), { name: "Compte banque seed", type: "BANK" });
      console.log("Source de fonds entreprise : Compte banque seed.");
    }

    const location = await prisma.location.findFirstOrThrow({
      where: { shopId: activeShop.id, type: "SHOP" },
    });

    const account = await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: cashSource.id } });

    const validated = await prisma.openingDraft.findFirst({
      where: { shopId: activeShop.id, status: "VALIDATED" },
    });
    if (!validated && activeShop.status === "SETUP") {
      await saveOpeningDraft(prisma, ownerCtx("opening-draft"), activeShop.id, {
        step: 12,
        stockLines: [{ variantId, locationId: location.id, quantity: "12.000000", unitCostMinor: "9000" }],
        funds: [{ accountId: account.id, amountMinor: "500000" }],
        obligations: [{ label: "Dette fournisseur antérieure (seed)", amountMinor: "25000" }],
      });
      const opening = await validateOpening(prisma, ownerCtx("opening-validate"), activeShop.id);
      console.log(
        `Initialisation validée : stock ${opening.stockValueMinor}, fonds ${opening.fundTotalMinor}, obligations ${opening.obligationTotalMinor}.`,
      );
      activeShop = await prisma.shop.findUniqueOrThrow({ where: { id: activeShop.id } });
    } else if (validated) {
      console.log("Initialisation déjà validée pour la boutique active.");
    }

    activeShop = await prisma.shop.findUniqueOrThrow({ where: { id: activeShop.id } });
    if (activeShop.status === "SETUP" && (validated || (await prisma.openingDraft.findFirst({ where: { shopId: activeShop.id, status: "VALIDATED" } })))) {
      await transitionShop(prisma, ownerCtx("shop-activate"), activeShop.id, "ACTIVE", "Ouverture seed locale P03");
      console.log("Boutique active activée.");
    } else if (activeShop.status === "ACTIVE") {
      console.log("Boutique active déjà ACTIVE.");
    }

    console.log("");
    console.log("Seed P03 terminé sur cercle_complet.");
    console.log(`  Boutique active   ${SHOP_ACTIVE_CODE} — dashboard EMPTY après connexion owner + MFA`);
    console.log(`  Boutique brouillon ${SHOP_PREP_CODE} — parcours /setup`);
    console.log("  Connexion : http://127.0.0.1:8080/login");
    console.log(`  Propriétaire      ${OWNER_EMAIL}`);
    console.log(`  Gérant            ${MANAGER_EMAIL}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
