CREATE TABLE "opening_obligations" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    CONSTRAINT "opening_obligations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opening_obligations_amount_check" CHECK ("amount_minor" >= 0),
    CONSTRAINT "opening_obligations_draft_id_fkey"
      FOREIGN KEY ("draft_id") REFERENCES "opening_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "opening_obligations_draft_id_idx" ON "opening_obligations"("draft_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "opening_obligations" TO cercle_app;
