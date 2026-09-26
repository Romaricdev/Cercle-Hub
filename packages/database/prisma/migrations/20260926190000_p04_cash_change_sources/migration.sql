ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS change_due_minor BIGINT,
  ADD COLUMN IF NOT EXISTS change_given_minor BIGINT;

-- Les ventes espèces antérieures ne conservaient pas le billet remis. Leur seule
-- reconstruction fidèle consiste à considérer un paiement exact, sans monnaie.
ALTER TABLE sale_payments DISABLE TRIGGER sale_payments_immutable;
UPDATE sale_payments
SET cash_received_minor = amount_minor,
    change_due_minor = 0,
    change_given_minor = 0
WHERE mode = 'CASH';
ALTER TABLE sale_payments ENABLE TRIGGER sale_payments_immutable;

ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_cash_change_consistent CHECK (
    (mode = 'CASH' AND cash_received_minor IS NOT NULL AND change_due_minor IS NOT NULL AND change_given_minor IS NOT NULL
      AND cash_received_minor >= amount_minor
      AND change_due_minor = cash_received_minor - amount_minor
      AND change_given_minor = change_due_minor)
    OR
    (mode <> 'CASH' AND cash_received_minor IS NULL AND change_due_minor IS NULL AND change_given_minor IS NULL)
  );
