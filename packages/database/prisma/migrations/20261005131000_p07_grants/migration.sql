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

ALTER TABLE money_events DROP CONSTRAINT IF EXISTS money_events_type_check;
ALTER TABLE money_events ADD CONSTRAINT money_events_type_check CHECK (type IN (
  'OPENING_FUND','OWNER_CONTRIBUTION','CORRECTION','SALE_PAYMENT',
  'EXPENSE_PAYMENT','FUND_SEND','FUND_RECEIVE','COUNT_VARIANCE','OWNER_WITHDRAWAL',
  'PURCHASE_PAYMENT','PURCHASE_EXTERNAL_FEE',
  'CUSTOMER_COLLECTION','CUSTOMER_REFUND','WRITE_OFF','OPENING_RECEIVABLE'
));

CREATE OR REPLACE FUNCTION prevent_p04_posted_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales' AND TG_OP = 'UPDATE' THEN
    IF NEW.id = OLD.id
      AND NEW.organization_id = OLD.organization_id
      AND NEW.shop_id = OLD.shop_id
      AND NEW.session_id = OLD.session_id
      AND NEW.actor_id = OLD.actor_id
      AND NEW.device_id = OLD.device_id
      AND NEW.reference = OLD.reference
      AND NEW.status = OLD.status
      AND NEW.gross_minor = OLD.gross_minor
      AND NEW.discount_minor = OLD.discount_minor
      AND NEW.net_minor = OLD.net_minor
      AND NEW.cost_minor = OLD.cost_minor
      AND NEW.business_date = OLD.business_date
      AND NEW.posted_at = OLD.posted_at
      AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
      AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
      AND NEW.credit_authorization_id IS NOT DISTINCT FROM OLD.credit_authorization_id
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'posted P04 documents are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_immutable ON sales;
CREATE TRIGGER sales_immutable
  BEFORE UPDATE OR DELETE ON sales
  FOR EACH ROW
  WHEN (OLD.status IN ('POSTED','REVERSED'))
  EXECUTE FUNCTION prevent_p04_posted_mutation();
