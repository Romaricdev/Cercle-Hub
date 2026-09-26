ALTER TABLE "organizations" ADD COLUMN "name" TEXT;
ALTER TABLE "organizations" ADD COLUMN "initialized_at" TIMESTAMPTZ(6);

ALTER TABLE "app_users" ADD COLUMN "display_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "app_users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "app_users" ADD COLUMN "deactivated_at" TIMESTAMPTZ(6);
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_status_check" CHECK ("status" IN ('INVITED', 'ACTIVE', 'DISABLED'));

CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shops_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shops_status_check" CHECK ("status" IN ('SETUP', 'ACTIVE', 'SUSPENDED', 'CLOSED'))
);

CREATE TABLE "manager_assignments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    CONSTRAINT "manager_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shop_id" UUID,
    "user_id" UUID NOT NULL,
    "public_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_agent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "last_seen_at" TIMESTAMPTZ(6),
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "devices_status_check" CHECK ("status" IN ('PENDING', 'ACTIVE', 'REVOKED', 'REPLACED'))
);

CREATE TABLE "device_capabilities" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "session_id" TEXT,
    "policy_revision" INTEGER NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_sequence" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "device_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shops_organization_id_code_key" ON "shops"("organization_id", "code");
CREATE INDEX "app_users_organization_id_status_idx" ON "app_users"("organization_id", "status");
CREATE INDEX "manager_assignments_shop_id_ended_at_idx" ON "manager_assignments"("shop_id", "ended_at");
CREATE INDEX "manager_assignments_user_id_ended_at_idx" ON "manager_assignments"("user_id", "ended_at");
CREATE UNIQUE INDEX "manager_assignments_one_active_shop" ON "manager_assignments"("shop_id") WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "manager_assignments_one_active_user" ON "manager_assignments"("user_id") WHERE "ended_at" IS NULL;
CREATE INDEX "invitations_token_hash_idx" ON "invitations"("token_hash");
CREATE INDEX "invitations_user_id_idx" ON "invitations"("user_id");
CREATE UNIQUE INDEX "devices_public_key_key" ON "devices"("public_key");
CREATE INDEX "devices_organization_id_status_idx" ON "devices"("organization_id", "status");
CREATE INDEX "devices_shop_id_status_idx" ON "devices"("shop_id", "status");
CREATE UNIQUE INDEX "devices_one_active_shop" ON "devices"("shop_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "device_capabilities_device_id_revoked_at_idx" ON "device_capabilities"("device_id", "revoked_at");

ALTER TABLE "shops" ADD CONSTRAINT "shops_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_capabilities" ADD CONSTRAINT "device_capabilities_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shops" TO cercle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "manager_assignments" TO cercle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invitations" TO cercle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "devices" TO cercle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "device_capabilities" TO cercle_app;
REVOKE UPDATE, DELETE ON TABLE "audit_events" FROM cercle_app;
