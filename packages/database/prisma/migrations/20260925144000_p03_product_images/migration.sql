ALTER TABLE "products"
  ADD COLUMN "image_key" TEXT,
  ADD COLUMN "image_mime" TEXT,
  ADD COLUMN "image_size" INTEGER;

ALTER TABLE "products"
  ADD CONSTRAINT "products_image_metadata_check"
  CHECK (
    ("image_key" IS NULL AND "image_mime" IS NULL AND "image_size" IS NULL)
    OR
    ("image_key" IS NOT NULL AND "image_mime" IN ('image/jpeg', 'image/png', 'image/webp') AND "image_size" > 0 AND "image_size" <= 750000)
  );
