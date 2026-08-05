-- CreateTable
CREATE TABLE "personal_note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(0) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "updater_id" TEXT NOT NULL,

    CONSTRAINT "personal_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_note_creator_id_idx" ON "personal_note"("creator_id");

-- CreateIndex
CREATE INDEX "personal_note_updater_id_idx" ON "personal_note"("updater_id");

-- AddForeignKey
ALTER TABLE "personal_note" ADD CONSTRAINT "personal_note_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_note" ADD CONSTRAINT "personal_note_updater_id_fkey" FOREIGN KEY ("updater_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
