-- Garantit la présence du déclencheur append-only après l’évolution P07
-- (compteurs de règlement autorisés). Idempotent pour les bases déjà corrigées.
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
