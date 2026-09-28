ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS counted_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE payment_sources DROP CONSTRAINT IF EXISTS payment_sources_type_check;
ALTER TABLE payment_sources ADD CONSTRAINT payment_sources_type_check CHECK (type IN ('CASH','BANK','MOBILE_MONEY','OTHER','TRANSIT'));

ALTER TABLE money_events DROP CONSTRAINT IF EXISTS money_events_type_check;
ALTER TABLE money_events ADD CONSTRAINT money_events_type_check CHECK (type IN (
  'OPENING_FUND','OWNER_CONTRIBUTION','CORRECTION','SALE_PAYMENT',
  'EXPENSE_PAYMENT','FUND_SEND','FUND_RECEIVE','COUNT_VARIANCE','OWNER_WITHDRAWAL'
));

CREATE TABLE cash_closures (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  session_id uuid NOT NULL REFERENCES cash_sessions(id),
  account_id uuid NOT NULL REFERENCES money_accounts(id),
  declared_minor bigint NOT NULL CHECK (declared_minor >= 0),
  expected_minor bigint NOT NULL,
  variance_minor bigint NOT NULL,
  denomination_counts jsonb NOT NULL,
  explanation text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by_id uuid NOT NULL REFERENCES app_users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  UNIQUE (session_id, account_id)
);
CREATE INDEX cash_closures_org_submitted_idx ON cash_closures(organization_id, submitted_at DESC);

CREATE TABLE expenses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shop_id uuid NOT NULL REFERENCES shops(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  session_id uuid REFERENCES cash_sessions(id),
  account_id uuid NOT NULL REFERENCES money_accounts(id),
  category text NOT NULL CHECK (category IN ('RENT','UTILITIES','TRANSPORT','SUPPLIES','OTHER')),
  description text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  beneficiary text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REQUESTED','AUTHORIZED','POSTED','IRREGULAR','REJECTED')),
  policy_version integer,
  receipt_exception_reason text,
  approved_by_id uuid REFERENCES app_users(id),
  approved_at timestamptz,
  rejected_reason text,
  paid_event_id uuid REFERENCES money_events(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_org_shop_status_idx ON expenses(organization_id, shop_id, status);
CREATE INDEX expenses_session_idx ON expenses(session_id);

CREATE TABLE fund_transfers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shop_id uuid REFERENCES shops(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  source_account_id uuid NOT NULL REFERENCES money_accounts(id),
  destination_account_id uuid NOT NULL REFERENCES money_accounts(id),
  transit_account_id uuid NOT NULL REFERENCES money_accounts(id),
  amount_sent_minor bigint NOT NULL CHECK (amount_sent_minor > 0),
  amount_received_minor bigint NOT NULL DEFAULT 0 CHECK (amount_received_minor >= 0),
  purpose text NOT NULL CHECK (purpose IN ('REMITTANCE','FLOAT','OWNER_CONTRIBUTION','WITHDRAWAL')),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','SENT','PARTIAL','RECEIVED','DISPUTED','CLOSED')),
  reason text NOT NULL,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_received_minor <= amount_sent_minor),
  CHECK (source_account_id <> destination_account_id)
);
CREATE INDEX fund_transfers_org_state_idx ON fund_transfers(organization_id, state, created_at DESC);

CREATE TABLE fund_receipts (
  id uuid PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES fund_transfers(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  session_id uuid REFERENCES cash_sessions(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  comment text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_receipts_transfer_idx ON fund_receipts(transfer_id);

CREATE TABLE discrepancy_cases (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shop_id uuid REFERENCES shops(id),
  session_id uuid REFERENCES cash_sessions(id),
  type text NOT NULL CHECK (type IN ('CASH','STOCK','RECEIPT','BUDGET','OFFLINE','DOCUMENT')),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  expected_minor bigint,
  declared_minor bigint,
  original_amount_minor bigint NOT NULL,
  residual_amount_minor bigint NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','NEEDS_INFO','RESOLVED')),
  owner_decision text,
  resolved_at timestamptz,
  resolved_by_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discrepancy_cases_org_state_idx ON discrepancy_cases(organization_id, state, created_at DESC);
CREATE INDEX discrepancy_cases_shop_idx ON discrepancy_cases(shop_id, state);

CREATE TABLE discrepancy_actions (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES discrepancy_cases(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  action_type text NOT NULL CHECK (action_type IN ('COMMENT','REQUEST_INFO','RECLASSIFY','ADJUST','RESOLVE','REOPEN')),
  text text NOT NULL,
  event_id uuid REFERENCES money_events(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discrepancy_actions_case_idx ON discrepancy_actions(case_id, created_at);

CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  owner_document_type text NOT NULL,
  owner_document_id uuid,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL CHECK (size > 0 AND size <= 5000000),
  sha256 text NOT NULL,
  scan_status text NOT NULL DEFAULT 'PENDING' CHECK (scan_status IN ('PENDING','CLEAN','REJECTED','UNAVAILABLE')),
  scan_engine text,
  uploaded_by_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  scanned_at timestamptz
);
CREATE INDEX attachments_org_document_idx ON attachments(organization_id, owner_document_type, owner_document_id);

CREATE OR REPLACE FUNCTION prevent_p05_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P05 documents are append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_closures_immutable BEFORE UPDATE OR DELETE ON cash_closures
  FOR EACH ROW EXECUTE FUNCTION prevent_p05_immutable();
CREATE TRIGGER fund_receipts_immutable BEFORE UPDATE OR DELETE ON fund_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_p05_immutable();
CREATE TRIGGER discrepancy_actions_immutable BEFORE UPDATE OR DELETE ON discrepancy_actions
  FOR EACH ROW EXECUTE FUNCTION prevent_p05_immutable();

GRANT SELECT, INSERT, UPDATE ON TABLE payment_sources, money_accounts, journal_entries, journal_lines, money_events, money_entries, outbox_events, audit_events, idempotency_keys TO cercle_app;
GRANT SELECT, INSERT, UPDATE ON TABLE cash_sessions, expenses, fund_transfers, discrepancy_cases, attachments TO cercle_app;
GRANT SELECT, INSERT ON TABLE cash_closures, fund_receipts, discrepancy_actions TO cercle_app;
