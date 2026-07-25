-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('available', 'maintenance');

-- AlterTable (Int -> nativeEnum via CASE WHEN; Prisma's default USING cast
-- cannot cast integer directly to an enum type)
ALTER TABLE "room" ADD COLUMN "status_new" "RoomStatus";
UPDATE "room" SET "status_new" = CASE "status"
  WHEN 0 THEN 'available'::"RoomStatus"
  WHEN 1 THEN 'maintenance'::"RoomStatus"
END;
ALTER TABLE "room" ALTER COLUMN "status_new" SET DEFAULT 'available'::"RoomStatus";
ALTER TABLE "room" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "room" DROP COLUMN "status";
ALTER TABLE "room" RENAME COLUMN "status_new" TO "status";
