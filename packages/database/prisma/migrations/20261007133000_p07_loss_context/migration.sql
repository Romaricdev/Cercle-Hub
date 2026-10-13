ALTER TABLE "stock_losses"
  ADD COLUMN "source_compartment" TEXT NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "lot_id" UUID;

ALTER TABLE "stock_losses"
  ADD CONSTRAINT "stock_losses_lot_id_fkey"
  FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "stock_losses_lot_id_idx" ON "stock_losses"("lot_id");
