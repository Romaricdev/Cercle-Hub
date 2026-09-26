-- DropIndex
DROP INDEX "app_users_organization_id_idx";

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "activated_at" TIMESTAMPTZ(6),
ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'XAF',
ADD COLUMN     "suspended_at" TIMESTAMPTZ(6),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Douala',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "family" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tracks_lots" BOOLEAN NOT NULL DEFAULT false,
    "tracks_expiry" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_units" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "factor" DECIMAL(20,6) NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 0,
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "sale_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL,
    "sale_unit_id" UUID NOT NULL,
    "shop_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_products" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" DATE,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID,
    "actor_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "origin_type" TEXT NOT NULL,
    "origin_id" TEXT NOT NULL,
    "correction_of_id" UUID,
    "reason" TEXT,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_entries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "stock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "shop_id" UUID,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_layers" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "origin_type" TEXT NOT NULL,
    "origin_id" TEXT NOT NULL,
    "initial_quantity" DECIMAL(20,6) NOT NULL,
    "remaining_quantity" DECIMAL(20,6) NOT NULL,
    "unit_cost_minor" BIGINT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cost_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "payment_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID,
    "payment_source_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "correction_of_id" UUID,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_entries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "money_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "correction_of_id" UUID,
    "posted_at" TIMESTAMPTZ(6),

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_code" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID,
    "version" INTEGER NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "values" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_drafts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "step" INTEGER NOT NULL DEFAULT 1,
    "funds" JSONB,
    "obligations" JSONB,
    "summary" JSONB,
    "validated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_stock_lines" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_code" TEXT,
    "expires_at" DATE,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unit_cost_minor" BIGINT NOT NULL,

    CONSTRAINT "opening_stock_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_status_name_idx" ON "products"("organization_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_name_key" ON "product_variants"("product_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE INDEX "sale_units_variant_id_status_idx" ON "sale_units"("variant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sale_units_variant_id_name_key" ON "sale_units"("variant_id", "name");

-- CreateIndex
CREATE INDEX "prices_sale_unit_id_shop_id_valid_from_idx" ON "prices"("sale_unit_id", "shop_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_shop_id_product_id_key" ON "shop_products"("shop_id", "product_id");

-- CreateIndex
CREATE INDEX "locations_organization_id_status_idx" ON "locations"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "locations_shop_id_type_key" ON "locations"("shop_id", "type");

-- CreateIndex
CREATE INDEX "lots_expires_at_idx" ON "lots"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "lots_variant_id_location_id_code_key" ON "lots"("variant_id", "location_id", "code");

-- CreateIndex
CREATE INDEX "stock_events_organization_id_posted_at_idx" ON "stock_events"("organization_id", "posted_at");

-- CreateIndex
CREATE INDEX "stock_entries_variant_id_location_id_idx" ON "stock_entries"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_balances_shop_id_updated_at_idx" ON "stock_balances"("shop_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_variant_id_location_id_key" ON "stock_balances"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "cost_layers_variant_id_location_id_received_at_idx" ON "cost_layers"("variant_id", "location_id", "received_at");

-- CreateIndex
CREATE INDEX "payment_sources_organization_id_status_idx" ON "payment_sources"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_sources_organization_id_shop_id_name_key" ON "payment_sources"("organization_id", "shop_id", "name");

-- CreateIndex
CREATE INDEX "money_accounts_organization_id_shop_id_idx" ON "money_accounts"("organization_id", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "money_accounts_payment_source_id_currency_key" ON "money_accounts"("payment_source_id", "currency");

-- CreateIndex
CREATE INDEX "money_events_organization_id_posted_at_idx" ON "money_events"("organization_id", "posted_at");

-- CreateIndex
CREATE INDEX "money_entries_account_id_event_id_idx" ON "money_entries"("account_id", "event_id");

-- CreateIndex
CREATE INDEX "journal_entries_organization_id_posted_at_idx" ON "journal_entries"("organization_id", "posted_at");

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "policies_organization_id_effective_at_idx" ON "policies"("organization_id", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "policies_organization_id_shop_id_version_key" ON "policies"("organization_id", "shop_id", "version");

-- CreateIndex
CREATE INDEX "opening_drafts_organization_id_status_idx" ON "opening_drafts"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "opening_drafts_shop_id_version_key" ON "opening_drafts"("shop_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "opening_stock_lines_draft_id_variant_id_location_id_lot_cod_key" ON "opening_stock_lines"("draft_id", "variant_id", "location_id", "lot_code");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_units" ADD CONSTRAINT "sale_units_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_sale_unit_id_fkey" FOREIGN KEY ("sale_unit_id") REFERENCES "sale_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prices" ADD CONSTRAINT "prices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_correction_of_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "stock_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "stock_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_layers" ADD CONSTRAINT "cost_layers_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_layers" ADD CONSTRAINT "cost_layers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_layers" ADD CONSTRAINT "cost_layers_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_payment_source_id_fkey" FOREIGN KEY ("payment_source_id") REFERENCES "payment_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_correction_of_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "money_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "money_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_correction_of_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_drafts" ADD CONSTRAINT "opening_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_drafts" ADD CONSTRAINT "opening_drafts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_drafts" ADD CONSTRAINT "opening_drafts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "opening_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "sale_units" ADD CONSTRAINT "sale_units_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "sale_units" ADD CONSTRAINT "sale_units_factor_check" CHECK ("factor" > 0 AND "precision" BETWEEN 0 AND 6);
ALTER TABLE "prices" ADD CONSTRAINT "prices_amount_check" CHECK ("amount_minor" >= 0);
ALTER TABLE "prices" ADD CONSTRAINT "prices_period_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");
ALTER TABLE "locations" ADD CONSTRAINT "locations_type_check" CHECK ("type" IN ('SHOP', 'DEPOT'));
ALTER TABLE "locations" ADD CONSTRAINT "locations_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "locations" ADD CONSTRAINT "locations_scope_check" CHECK (("type" = 'SHOP' AND "shop_id" IS NOT NULL) OR ("type" = 'DEPOT' AND "shop_id" IS NULL));
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_quantity_check" CHECK ("quantity" <> 0);
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "cost_layers" ADD CONSTRAINT "cost_layers_quantity_check" CHECK ("initial_quantity" > 0 AND "remaining_quantity" >= 0 AND "remaining_quantity" <= "initial_quantity");
ALTER TABLE "cost_layers" ADD CONSTRAINT "cost_layers_cost_check" CHECK ("unit_cost_minor" >= 0);
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_type_check" CHECK ("type" IN ('CASH', 'BANK', 'MOBILE_MONEY', 'OTHER'));
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_balance_check" CHECK ("balance_minor" >= 0);
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_type_check" CHECK ("type" IN ('OPENING_FUND', 'OWNER_CONTRIBUTION', 'CORRECTION'));
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_status_check" CHECK ("status" IN ('DRAFT', 'POSTED'));
ALTER TABLE "opening_drafts" ADD CONSTRAINT "opening_drafts_status_check" CHECK ("status" IN ('DRAFT', 'VALIDATED'));
ALTER TABLE "opening_drafts" ADD CONSTRAINT "opening_drafts_step_check" CHECK ("step" BETWEEN 1 AND 13);
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "opening_stock_lines" ADD CONSTRAINT "opening_stock_cost_check" CHECK ("unit_cost_minor" >= 0);

CREATE UNIQUE INDEX "sale_units_one_reference" ON "sale_units"("variant_id") WHERE "is_reference" = true;
CREATE UNIQUE INDEX "locations_one_depot_per_organization" ON "locations"("organization_id") WHERE "type" = 'DEPOT';
CREATE UNIQUE INDEX "payment_sources_global_name" ON "payment_sources"("organization_id", "name") WHERE "shop_id" IS NULL;
CREATE UNIQUE INDEX "prices_one_current_scope" ON "prices"("sale_unit_id", COALESCE("shop_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "valid_until" IS NULL;

CREATE OR REPLACE FUNCTION forbid_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable posted record';
END;
$$;

CREATE TRIGGER stock_events_immutable BEFORE UPDATE OR DELETE ON "stock_events"
FOR EACH ROW EXECUTE FUNCTION forbid_immutable_change();
CREATE TRIGGER stock_entries_immutable BEFORE UPDATE OR DELETE ON "stock_entries"
FOR EACH ROW EXECUTE FUNCTION forbid_immutable_change();
CREATE TRIGGER money_events_immutable BEFORE UPDATE OR DELETE ON "money_events"
FOR EACH ROW EXECUTE FUNCTION forbid_immutable_change();
CREATE TRIGGER money_entries_immutable BEFORE UPDATE OR DELETE ON "money_entries"
FOR EACH ROW EXECUTE FUNCTION forbid_immutable_change();

CREATE OR REPLACE FUNCTION protect_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'posted journal entry is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION protect_posted_journal();

CREATE OR REPLACE FUNCTION protect_posted_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE id = OLD.entry_id AND status = 'POSTED') THEN
    RAISE EXCEPTION 'posted journal line is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON "journal_lines"
FOR EACH ROW EXECUTE FUNCTION protect_posted_journal_line();

CREATE OR REPLACE FUNCTION verify_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED' AND (
    NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id = NEW.id)
    OR (SELECT COALESCE(SUM(amount_minor), 0) FROM journal_lines WHERE entry_id = NEW.id) <> 0
  ) THEN
    RAISE EXCEPTION 'journal entry is not balanced';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_entries_balance BEFORE INSERT OR UPDATE OF status ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION verify_balanced_journal();

REVOKE UPDATE, DELETE ON TABLE "stock_events", "stock_entries", "money_events", "money_entries" FROM cercle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "products", "product_variants", "sale_units", "prices", "shop_products", "locations", "lots",
  "stock_balances", "cost_layers", "payment_sources", "money_accounts", "journal_entries",
  "journal_lines", "policies", "opening_drafts", "opening_stock_lines"
TO cercle_app;
GRANT SELECT, INSERT ON TABLE "stock_events", "stock_entries", "money_events", "money_entries" TO cercle_app;
