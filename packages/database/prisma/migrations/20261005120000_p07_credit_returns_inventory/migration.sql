ALTER TABLE shops ADD COLUMN IF NOT EXISTS suspension_mode text;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'TRADING';
ALTER TABLE cash_sessions DROP CONSTRAINT IF EXISTS cash_sessions_purpose_check;
ALTER TABLE cash_sessions ADD CONSTRAINT cash_sessions_purpose_check CHECK (purpose IN ('TRADING', 'SETTLEMENT', 'RECOVERY'));

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS paid_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_reduction_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS write_off_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS credit_authorization_id uuid;

UPDATE sales SET paid_minor = net_minor WHERE paid_minor = 0;

ALTER TABLE opening_obligations
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'PAYABLE',
  ADD COLUMN IF NOT EXISTS party_type text,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  name text NOT NULL,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  credit_limit_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_limit_check CHECK (credit_limit_minor >= 0)
);
CREATE INDEX IF NOT EXISTS customers_shop_status_name_idx ON customers(shop_id, status, name);
CREATE INDEX IF NOT EXISTS customers_shop_phone_idx ON customers(shop_id, normalized_phone);

CREATE TABLE IF NOT EXISTS credit_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL,
  max_due_minor bigint NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_sale_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_authorizations_max_check CHECK (max_due_minor >= 0)
);
CREATE INDEX IF NOT EXISTS credit_authorizations_shop_customer_idx ON credit_authorizations(shop_id, customer_id, expires_at);

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_customer_fk;
ALTER TABLE sales ADD CONSTRAINT sales_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_credit_auth_fk;
ALTER TABLE sales ADD CONSTRAINT sales_credit_auth_fk FOREIGN KEY (credit_authorization_id) REFERENCES credit_authorizations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS sales_shop_customer_idx ON sales(shop_id, customer_id);

ALTER TABLE opening_obligations DROP CONSTRAINT IF EXISTS opening_obligations_customer_fk;
ALTER TABLE opening_obligations ADD CONSTRAINT opening_obligations_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE opening_obligations DROP CONSTRAINT IF EXISTS opening_obligations_supplier_fk;
ALTER TABLE opening_obligations ADD CONSTRAINT opening_obligations_supplier_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  party_type text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT,
  origin_type text NOT NULL,
  origin_id uuid NOT NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE RESTRICT,
  purchase_id uuid REFERENCES purchases(id) ON DELETE RESTRICT,
  original_minor bigint NOT NULL,
  remaining_minor bigint NOT NULL,
  due_date date,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT receivables_remaining_check CHECK (remaining_minor >= 0 AND remaining_minor <= original_minor),
  CONSTRAINT receivables_origin_unique UNIQUE (origin_type, origin_id)
);
CREATE INDEX IF NOT EXISTS receivables_shop_remaining_idx ON receivables(shop_id, remaining_minor, due_date);
CREATE INDEX IF NOT EXISTS receivables_customer_idx ON receivables(customer_id, remaining_minor);
CREATE INDEX IF NOT EXISTS receivables_supplier_idx ON receivables(supplier_id, remaining_minor);

CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  preview_hash text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_payments_amount_check CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS customer_payments_shop_idx ON customer_payments(shop_id, posted_at);
CREATE INDEX IF NOT EXISTS customer_payments_customer_idx ON customer_payments(customer_id, posted_at);

CREATE TABLE IF NOT EXISTS customer_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES customer_payments(id) ON DELETE RESTRICT,
  receivable_id uuid NOT NULL REFERENCES receivables(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  CONSTRAINT customer_payment_allocations_amount_check CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS customer_payment_allocations_payment_idx ON customer_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS customer_payment_allocations_receivable_idx ON customer_payment_allocations(receivable_id);

CREATE TABLE IF NOT EXISTS debt_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  receivable_id uuid NOT NULL REFERENCES receivables(id) ON DELETE RESTRICT,
  type text NOT NULL,
  amount_minor bigint NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT debt_adjustments_amount_check CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS debt_adjustments_receivable_idx ON debt_adjustments(receivable_id, created_at);

CREATE TABLE IF NOT EXISTS customer_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status text NOT NULL,
  reason text NOT NULL,
  requested_minor bigint NOT NULL,
  approved_minor bigint NOT NULL DEFAULT 0,
  received_minor bigint NOT NULL DEFAULT 0,
  credit_reduction_minor bigint NOT NULL DEFAULT 0,
  write_off_reversal_minor bigint NOT NULL DEFAULT 0,
  refund_due_minor bigint NOT NULL DEFAULT 0,
  refunded_minor bigint NOT NULL DEFAULT 0,
  decided_by_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_returns_amounts_check CHECK (requested_minor >= 0 AND refunded_minor <= refund_due_minor)
);
CREATE INDEX IF NOT EXISTS customer_returns_shop_idx ON customer_returns(shop_id, status, created_at);
CREATE INDEX IF NOT EXISTS customer_returns_sale_idx ON customer_returns(sale_id);

CREATE TABLE IF NOT EXISTS customer_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES customer_returns(id) ON DELETE RESTRICT,
  sale_line_id uuid NOT NULL REFERENCES sale_lines(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  requested_qty numeric(20,6) NOT NULL,
  approved_qty numeric(20,6) NOT NULL DEFAULT 0,
  received_qty numeric(20,6) NOT NULL DEFAULT 0,
  disposition text NOT NULL DEFAULT 'AVAILABLE',
  net_minor bigint NOT NULL,
  cost_minor bigint NOT NULL DEFAULT 0,
  CONSTRAINT customer_return_lines_qty_check CHECK (requested_qty > 0 AND received_qty <= approved_qty AND approved_qty <= requested_qty)
);
CREATE INDEX IF NOT EXISTS customer_return_lines_return_idx ON customer_return_lines(return_id);

CREATE TABLE IF NOT EXISTS refund_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES customer_returns(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT refund_payments_amount_check CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS refund_payments_return_idx ON refund_payments(return_id);

CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid REFERENCES shops(id) ON DELETE RESTRICT,
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status text NOT NULL,
  reason text NOT NULL,
  dispatched_minor bigint NOT NULL DEFAULT 0,
  debt_reduction_minor bigint NOT NULL DEFAULT 0,
  reimbursement_due_minor bigint NOT NULL DEFAULT 0,
  reimbursement_received_minor bigint NOT NULL DEFAULT 0,
  decided_by_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  credit_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_returns_purchase_idx ON supplier_returns(purchase_id, status);
CREATE INDEX IF NOT EXISTS supplier_returns_org_idx ON supplier_returns(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS supplier_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES supplier_returns(id) ON DELETE RESTRICT,
  purchase_line_id uuid NOT NULL REFERENCES purchase_lines(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  qty_base numeric(20,6) NOT NULL,
  amount_minor bigint NOT NULL,
  cost_minor bigint NOT NULL,
  CONSTRAINT supplier_return_lines_qty_check CHECK (qty_base > 0)
);
CREATE INDEX IF NOT EXISTS supplier_return_lines_return_idx ON supplier_return_lines(return_id);

CREATE TABLE IF NOT EXISTS stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status text NOT NULL,
  revision int NOT NULL DEFAULT 1,
  previous_id uuid REFERENCES stock_counts(id) ON DELETE RESTRICT,
  reason text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_counts_shop_idx ON stock_counts(shop_id, status, created_at);

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES stock_counts(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  compartment text NOT NULL,
  declared_qty numeric(20,6),
  expected_qty numeric(20,6) NOT NULL,
  explanation text,
  CONSTRAINT stock_count_lines_unique UNIQUE (count_id, variant_id, compartment)
);

CREATE TABLE IF NOT EXISTS stock_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  quantity numeric(20,6) NOT NULL,
  compartment text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  written_off_at timestamptz,
  CONSTRAINT stock_losses_qty_check CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS stock_losses_shop_idx ON stock_losses(shop_id, status, created_at);

CREATE TABLE IF NOT EXISTS shop_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  from_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  to_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status text NOT NULL,
  reason text NOT NULL,
  recovery boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS shop_handovers_shop_idx ON shop_handovers(shop_id, status);

GRANT SELECT, INSERT, UPDATE ON TABLE
  customers,
  credit_authorizations,
  receivables,
  customer_payments,
  customer_payment_allocations,
  debt_adjustments,
  customer_returns,
  customer_return_lines,
  refund_payments,
  supplier_returns,
  supplier_return_lines,
  stock_counts,
  stock_count_lines,
  stock_losses,
  shop_handovers
TO cercle_app;

