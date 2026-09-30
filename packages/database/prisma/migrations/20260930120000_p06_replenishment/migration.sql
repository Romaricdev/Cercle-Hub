ALTER TABLE cost_layers
  ADD COLUMN IF NOT EXISTS initial_value_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_value_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compartment text NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS valuation_origin text NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN IF NOT EXISTS origin_layer_id uuid,
  ADD COLUMN IF NOT EXISTS shipment_line_id uuid;

UPDATE cost_layers
SET
  initial_value_minor = ROUND(unit_cost_minor * initial_quantity),
  remaining_value_minor = ROUND(unit_cost_minor * remaining_quantity),
  valuation_origin = CASE
    WHEN origin_type IN ('opening_drafts', 'e2e_fixture') THEN 'OPENING'
    ELSE 'PURCHASE'
  END
WHERE initial_value_minor = 0 AND remaining_value_minor = 0;

ALTER TABLE cost_layers DROP CONSTRAINT IF EXISTS cost_layers_compartment_check;
ALTER TABLE cost_layers ADD CONSTRAINT cost_layers_compartment_check
  CHECK (compartment IN ('AVAILABLE', 'TRANSIT', 'QUARANTINE', 'DAMAGED', 'MISSING_PENDING'));
ALTER TABLE cost_layers DROP CONSTRAINT IF EXISTS cost_layers_valuation_check;
ALTER TABLE cost_layers ADD CONSTRAINT cost_layers_valuation_check
  CHECK (valuation_origin IN ('PURCHASE', 'OPENING', 'ESTIMATE', 'TRANSFER', 'UNVALUED'));
ALTER TABLE cost_layers DROP CONSTRAINT IF EXISTS cost_layers_remaining_qty_check;
ALTER TABLE cost_layers ADD CONSTRAINT cost_layers_remaining_qty_check CHECK (remaining_quantity >= 0);
ALTER TABLE cost_layers DROP CONSTRAINT IF EXISTS cost_layers_remaining_value_check;
ALTER TABLE cost_layers ADD CONSTRAINT cost_layers_remaining_value_check CHECK (remaining_value_minor >= 0);

CREATE INDEX IF NOT EXISTS cost_layers_compartment_idx ON cost_layers(variant_id, location_id, compartment, received_at);

ALTER TABLE money_events DROP CONSTRAINT IF EXISTS money_events_type_check;
ALTER TABLE money_events ADD CONSTRAINT money_events_type_check CHECK (type IN (
  'OPENING_FUND','OWNER_CONTRIBUTION','CORRECTION','SALE_PAYMENT',
  'EXPENSE_PAYMENT','FUND_SEND','FUND_RECEIVE','COUNT_VARIANCE','OWNER_WITHDRAWAL',
  'PURCHASE_PAYMENT','PURCHASE_EXTERNAL_FEE'
));

CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  trade_name text,
  phone text,
  email text,
  address text,
  tax_id text,
  contact_name text,
  payment_terms text,
  lead_time_days integer,
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  normalized_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid NOT NULL REFERENCES app_users(id),
  CHECK (char_length(trim(name)) BETWEEN 2 AND 160)
);
CREATE UNIQUE INDEX suppliers_org_name_phone_uidx ON suppliers(organization_id, normalized_name, COALESCE(phone, ''));
CREATE INDEX suppliers_org_status_idx ON suppliers(organization_id, status, name);

CREATE TABLE purchase_requests (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shop_id uuid NOT NULL REFERENCES shops(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  type text NOT NULL DEFAULT 'RESTOCK' CHECK (type IN ('RESTOCK')),
  status text NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','NEEDS_INFO','APPROVED','PARTIAL','REJECTED','CANCELLED','CLOSED')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  urgency text NOT NULL DEFAULT 'NORMAL' CHECK (urgency IN ('LOW','NORMAL','HIGH')),
  comment text NOT NULL,
  suggested_supplier_id uuid REFERENCES suppliers(id),
  estimated_fees_minor bigint NOT NULL DEFAULT 0 CHECK (estimated_fees_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (family_id, version)
);
CREATE INDEX purchase_requests_shop_status_idx ON purchase_requests(shop_id, status, created_at DESC);
CREATE INDEX purchase_requests_org_status_idx ON purchase_requests(organization_id, status, created_at DESC);
CREATE INDEX purchase_requests_family_idx ON purchase_requests(family_id, version DESC);

CREATE TABLE purchase_request_lines (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES purchase_requests(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  unit_id uuid NOT NULL REFERENCES sale_units(id),
  quantity_base numeric(20,6) NOT NULL CHECK (quantity_base > 0),
  estimated_unit_minor bigint CHECK (estimated_unit_minor IS NULL OR estimated_unit_minor >= 0),
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX purchase_request_lines_request_idx ON purchase_request_lines(request_id, sort);

CREATE TABLE purchase_request_actions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES purchase_requests(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  action_type text NOT NULL CHECK (action_type IN ('COMMENT','SUBMIT','REQUEST_INFO','MANAGER_RESPONSE','DECIDE','WITHDRAW','CANCEL_REMAINDER')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_request_actions_request_idx ON purchase_request_actions(request_id, created_at);

CREATE TABLE purchase_approvals (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES purchase_requests(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  outcome text NOT NULL CHECK (outcome IN ('APPROVED','PARTIAL','REJECTED','NEEDS_INFO')),
  buyer text CHECK (buyer IS NULL OR buyer IN ('MANAGER','OWNER','EXISTING_STOCK')),
  budget_minor bigint NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
  source_account_id uuid REFERENCES money_accounts(id),
  valid_until timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_approvals_request_idx ON purchase_approvals(request_id, created_at DESC);

CREATE TABLE purchase_approval_lines (
  id uuid PRIMARY KEY,
  approval_id uuid NOT NULL REFERENCES purchase_approvals(id),
  request_line_id uuid NOT NULL REFERENCES purchase_request_lines(id),
  max_qty_base numeric(20,6) NOT NULL CHECK (max_qty_base >= 0),
  max_amount_minor bigint NOT NULL CHECK (max_amount_minor >= 0),
  consumed_qty_base numeric(20,6) NOT NULL DEFAULT 0 CHECK (consumed_qty_base >= 0),
  consumed_amount_minor bigint NOT NULL DEFAULT 0 CHECK (consumed_amount_minor >= 0),
  CHECK (consumed_qty_base <= max_qty_base),
  CHECK (consumed_amount_minor <= max_amount_minor)
);
CREATE INDEX purchase_approval_lines_approval_idx ON purchase_approval_lines(approval_id);

CREATE TABLE purchases (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shop_id uuid REFERENCES shops(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  request_id uuid REFERENCES purchase_requests(id),
  approval_id uuid REFERENCES purchase_approvals(id),
  reference text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  goods_minor bigint NOT NULL CHECK (goods_minor >= 0),
  supplier_fees_minor bigint NOT NULL DEFAULT 0 CHECK (supplier_fees_minor >= 0),
  external_fees_minor bigint NOT NULL DEFAULT 0 CHECK (external_fees_minor >= 0),
  stock_value_minor bigint NOT NULL CHECK (stock_value_minor >= 0),
  paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  received_status text NOT NULL DEFAULT 'NONE' CHECK (received_status IN ('NONE','PARTIAL','COMPLETE')),
  payment_status text NOT NULL DEFAULT 'DUE' CHECK (payment_status IN ('DUE','PARTIAL','PAID')),
  control_status text NOT NULL DEFAULT 'OPEN' CHECK (control_status IN ('OPEN','CLOSED')),
  due_date date,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_minor <= goods_minor + supplier_fees_minor)
);
CREATE INDEX purchases_org_status_idx ON purchases(organization_id, status, created_at DESC);
CREATE INDEX purchases_shop_idx ON purchases(shop_id, created_at DESC);
CREATE INDEX purchases_supplier_idx ON purchases(supplier_id, created_at DESC);

CREATE TABLE purchase_lines (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  unit_id uuid NOT NULL REFERENCES sale_units(id),
  quantity_base numeric(20,6) NOT NULL CHECK (quantity_base > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  goods_minor bigint NOT NULL CHECK (goods_minor >= 0),
  allocated_fees_minor bigint NOT NULL DEFAULT 0 CHECK (allocated_fees_minor >= 0),
  allocated_external_minor bigint NOT NULL DEFAULT 0 CHECK (allocated_external_minor >= 0),
  received_qty_base numeric(20,6) NOT NULL DEFAULT 0 CHECK (received_qty_base >= 0)
);
CREATE INDEX purchase_lines_purchase_idx ON purchase_lines(purchase_id);

CREATE TABLE purchase_destinations (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  purchase_line_id uuid NOT NULL REFERENCES purchase_lines(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  qty_base numeric(20,6) NOT NULL CHECK (qty_base > 0),
  received_qty_base numeric(20,6) NOT NULL DEFAULT 0 CHECK (received_qty_base >= 0),
  CHECK (received_qty_base <= qty_base)
);
CREATE INDEX purchase_destinations_purchase_idx ON purchase_destinations(purchase_id);
CREATE INDEX purchase_destinations_location_idx ON purchase_destinations(location_id);

CREATE TABLE purchase_fees (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  kind text NOT NULL CHECK (kind IN ('SUPPLIER','EXTERNAL')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  account_id uuid REFERENCES money_accounts(id),
  description text NOT NULL
);
CREATE INDEX purchase_fees_purchase_idx ON purchase_fees(purchase_id);

CREATE TABLE purchase_payments (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  account_id uuid NOT NULL REFERENCES money_accounts(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  session_id uuid REFERENCES cash_sessions(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_payments_purchase_idx ON purchase_payments(purchase_id, created_at);

CREATE TABLE shipments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_location_id uuid REFERENCES locations(id),
  destination_location_id uuid NOT NULL REFERENCES locations(id),
  request_id uuid REFERENCES purchase_requests(id),
  purchase_id uuid REFERENCES purchases(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','DISPATCHED','PARTIAL','RECEIVED','DISPUTED','CLOSED','REJECTED')),
  carrier text,
  note text,
  dispatched_by_id uuid REFERENCES app_users(id),
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_location_id IS DISTINCT FROM destination_location_id)
);
CREATE INDEX shipments_org_status_idx ON shipments(organization_id, status, created_at DESC);
CREATE INDEX shipments_destination_idx ON shipments(destination_location_id, status);
CREATE INDEX shipments_source_idx ON shipments(source_location_id, status);
CREATE INDEX shipments_purchase_idx ON shipments(purchase_id);

CREATE TABLE shipment_lines (
  id uuid PRIMARY KEY,
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  purchase_line_id uuid REFERENCES purchase_lines(id),
  requested_qty numeric(20,6) NOT NULL CHECK (requested_qty > 0),
  dispatched_qty numeric(20,6) NOT NULL DEFAULT 0 CHECK (dispatched_qty >= 0),
  received_qty numeric(20,6) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  CHECK (received_qty <= dispatched_qty)
);
CREATE INDEX shipment_lines_shipment_idx ON shipment_lines(shipment_id);

CREATE TABLE shipment_cost_allocations (
  id uuid PRIMARY KEY,
  shipment_line_id uuid NOT NULL REFERENCES shipment_lines(id),
  origin_cost_layer_id uuid REFERENCES cost_layers(id),
  transit_cost_layer_id uuid NOT NULL REFERENCES cost_layers(id),
  qty numeric(20,6) NOT NULL CHECK (qty > 0),
  value_minor bigint NOT NULL CHECK (value_minor >= 0)
);
CREATE INDEX shipment_cost_allocations_line_idx ON shipment_cost_allocations(shipment_line_id);

ALTER TABLE cost_layers
  ADD CONSTRAINT cost_layers_origin_layer_fkey FOREIGN KEY (origin_layer_id) REFERENCES cost_layers(id) ON DELETE RESTRICT;
ALTER TABLE cost_layers
  ADD CONSTRAINT cost_layers_shipment_line_fkey FOREIGN KEY (shipment_line_id) REFERENCES shipment_lines(id) ON DELETE RESTRICT;

CREATE TABLE goods_receipts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  destination_location_id uuid NOT NULL REFERENCES locations(id),
  received_by_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED')),
  delivery_complete boolean NOT NULL DEFAULT false,
  surplus_case_id uuid REFERENCES discrepancy_cases(id),
  missing_case_id uuid REFERENCES discrepancy_cases(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goods_receipts_shipment_idx ON goods_receipts(shipment_id, created_at);

CREATE TABLE goods_receipt_lines (
  id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES goods_receipts(id),
  shipment_line_id uuid NOT NULL REFERENCES shipment_lines(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  lot_id uuid REFERENCES lots(id),
  accepted_qty numeric(20,6) NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
  damaged_qty numeric(20,6) NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  surplus_qty numeric(20,6) NOT NULL DEFAULT 0 CHECK (surplus_qty >= 0),
  remarks text,
  CHECK (accepted_qty + damaged_qty + surplus_qty > 0)
);
CREATE INDEX goods_receipt_lines_receipt_idx ON goods_receipt_lines(receipt_id);

CREATE OR REPLACE FUNCTION prevent_p06_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P06 documents are append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_request_actions_immutable BEFORE UPDATE OR DELETE ON purchase_request_actions
  FOR EACH ROW EXECUTE FUNCTION prevent_p06_append_only();
CREATE TRIGGER purchase_payments_immutable BEFORE UPDATE OR DELETE ON purchase_payments
  FOR EACH ROW EXECUTE FUNCTION prevent_p06_append_only();
CREATE TRIGGER goods_receipts_immutable BEFORE UPDATE OR DELETE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_p06_append_only();
CREATE TRIGGER goods_receipt_lines_immutable BEFORE UPDATE OR DELETE ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_p06_append_only();
CREATE TRIGGER shipment_cost_allocations_immutable BEFORE UPDATE OR DELETE ON shipment_cost_allocations
  FOR EACH ROW EXECUTE FUNCTION prevent_p06_append_only();

GRANT SELECT, INSERT, UPDATE ON TABLE suppliers, purchase_requests, purchase_request_lines, purchase_approvals, purchase_approval_lines, purchases, purchase_lines, purchase_destinations, purchase_fees, shipments, shipment_lines, cost_layers TO cercle_app;
GRANT SELECT, INSERT ON TABLE purchase_request_actions, purchase_payments, shipment_cost_allocations, goods_receipts, goods_receipt_lines TO cercle_app;
