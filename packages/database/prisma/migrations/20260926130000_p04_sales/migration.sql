CREATE TABLE cash_sessions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), shop_id uuid NOT NULL REFERENCES shops(id),
  manager_id uuid NOT NULL REFERENCES app_users(id), device_id uuid NOT NULL REFERENCES devices(id), location_id uuid NOT NULL REFERENCES locations(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COUNTING','CLOSED')), business_date date NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE money_events DROP CONSTRAINT money_events_type_check;
ALTER TABLE money_events ADD CONSTRAINT money_events_type_check CHECK (type IN ('OPENING_FUND','OWNER_CONTRIBUTION','CORRECTION','SALE_PAYMENT'));
CREATE UNIQUE INDEX cash_sessions_one_open_per_shop ON cash_sessions(shop_id) WHERE status IN ('OPEN','COUNTING');
CREATE INDEX cash_sessions_shop_status_idx ON cash_sessions(shop_id,status);

CREATE TABLE online_authorizations (
  id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), session_id uuid NOT NULL REFERENCES cash_sessions(id),
  payload_hash text NOT NULL, expires_at timestamptz NOT NULL, consumed_operation_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX online_authorizations_device_expires_idx ON online_authorizations(device_id,expires_at);

CREATE TABLE sales (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), shop_id uuid NOT NULL REFERENCES shops(id),
  session_id uuid NOT NULL REFERENCES cash_sessions(id), actor_id uuid NOT NULL REFERENCES app_users(id), device_id uuid NOT NULL REFERENCES devices(id),
  reference text NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  gross_minor bigint NOT NULL CHECK (gross_minor >= 0), discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  net_minor bigint NOT NULL CHECK (net_minor > 0), cost_minor bigint NOT NULL CHECK (cost_minor >= 0),
  business_date date NOT NULL, posted_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id,reference)
);
CREATE INDEX sales_shop_posted_idx ON sales(shop_id,posted_at);

CREATE TABLE sale_lines (
  id uuid PRIMARY KEY, sale_id uuid NOT NULL REFERENCES sales(id), variant_id uuid NOT NULL REFERENCES product_variants(id),
  sale_unit_id uuid NOT NULL REFERENCES sale_units(id), product_name text NOT NULL, variant_name text NOT NULL,
  unit_name text NOT NULL, unit_symbol text NOT NULL, quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  quantity_base numeric(20,6) NOT NULL CHECK (quantity_base > 0), unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  gross_minor bigint NOT NULL CHECK (gross_minor >= 0), discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  net_minor bigint NOT NULL CHECK (net_minor >= 0), cost_minor bigint NOT NULL CHECK (cost_minor >= 0)
);
CREATE INDEX sale_lines_sale_idx ON sale_lines(sale_id);

CREATE TABLE sale_payments (
  id uuid PRIMARY KEY, sale_id uuid NOT NULL REFERENCES sales(id), account_id uuid NOT NULL REFERENCES money_accounts(id),
  mode text NOT NULL CHECK (mode IN ('CASH','BANK','MOBILE_MONEY','OTHER')), amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  cash_received_minor bigint, external_reference text, CHECK (cash_received_minor IS NULL OR cash_received_minor >= amount_minor)
);
CREATE INDEX sale_payments_sale_idx ON sale_payments(sale_id);

CREATE TABLE stock_cost_allocations (
  id uuid PRIMARY KEY, sale_line_id uuid NOT NULL REFERENCES sale_lines(id), layer_id uuid NOT NULL REFERENCES cost_layers(id),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0), value_minor bigint NOT NULL CHECK (value_minor >= 0)
);
CREATE INDEX stock_cost_allocations_sale_line_idx ON stock_cost_allocations(sale_line_id);
CREATE INDEX stock_cost_allocations_layer_idx ON stock_cost_allocations(layer_id);

CREATE OR REPLACE FUNCTION prevent_p04_posted_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'posted P04 documents are append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_immutable BEFORE UPDATE OR DELETE ON sales FOR EACH ROW WHEN (OLD.status IN ('POSTED','REVERSED')) EXECUTE FUNCTION prevent_p04_posted_mutation();
CREATE TRIGGER sale_lines_immutable BEFORE UPDATE OR DELETE ON sale_lines FOR EACH ROW EXECUTE FUNCTION prevent_p04_posted_mutation();
CREATE TRIGGER sale_payments_immutable BEFORE UPDATE OR DELETE ON sale_payments FOR EACH ROW EXECUTE FUNCTION prevent_p04_posted_mutation();
CREATE TRIGGER stock_cost_allocations_immutable BEFORE UPDATE OR DELETE ON stock_cost_allocations FOR EACH ROW EXECUTE FUNCTION prevent_p04_posted_mutation();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cash_sessions, online_authorizations TO cercle_app;
GRANT SELECT, INSERT, UPDATE ON TABLE sales TO cercle_app;
GRANT SELECT, INSERT ON TABLE sale_lines, sale_payments, stock_cost_allocations TO cercle_app;
