-- CreateTable
CREATE TABLE "mobile_session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "last_used_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(0) NOT NULL,
    "revoked_at" TIMESTAMPTZ(0),
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_session_refresh_token_hash_key" ON "mobile_session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "mobile_session_user_id_idx" ON "mobile_session"("user_id");

-- CreateIndex
CREATE INDEX "db_table_description_idx" ON "db_table"("description");

-- CreateIndex
CREATE INDEX "organization_description_idx" ON "organization"("description");

-- CreateIndex
CREATE INDEX "organization_name_idx" ON "organization"("name");

-- CreateIndex
CREATE INDEX "parent1_description_idx" ON "parent1"("description");

-- CreateIndex
CREATE INDEX "procedure_description_idx" ON "procedure"("description");

-- CreateIndex
CREATE INDEX "procedure_name_idx" ON "procedure"("name");

-- CreateIndex
CREATE INDEX "role_description_idx" ON "role"("description");

-- CreateIndex
CREATE INDEX "role_name_idx" ON "role"("name");

-- CreateIndex
CREATE INDEX "room_type_description_idx" ON "room_type"("description");

-- CreateIndex
CREATE INDEX "room_type_name_idx" ON "room_type"("name");

-- CreateIndex
CREATE INDEX "supply_pool_description_idx" ON "supply_pool"("description");

-- CreateIndex
CREATE INDEX "supply_pool_name_idx" ON "supply_pool"("name");

-- CreateIndex
CREATE INDEX "supply_request_description_idx" ON "supply_request"("description");

-- CreateIndex
CREATE INDEX "supply_request_name_idx" ON "supply_request"("name");

-- CreateIndex
CREATE INDEX "xxxxx_xxxxx_description_idx" ON "xxxxx_xxxxx"("description");

-- AddForeignKey
ALTER TABLE "mobile_session" ADD CONSTRAINT "mobile_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
