-- AlterTable
ALTER TABLE "room_type" ADD COLUMN     "stripe_price_id" TEXT NOT NULL DEFAULT '';

-- Carry each room type's Price id over from its rooms, but only when every
-- room of the type holds the same non-empty value. Disagreeing or empty
-- values stay empty (checkout then refuses until a Price id is set).
UPDATE "room_type" AS rt
SET "stripe_price_id" = agg."price"
FROM (
    SELECT "room_type_id", MIN("stripe_price_id") AS "price"
    FROM "room"
    GROUP BY "room_type_id"
    HAVING COUNT(DISTINCT "stripe_price_id") = 1 AND MIN("stripe_price_id") <> ''
) AS agg
WHERE rt."id" = agg."room_type_id";

-- AlterTable
ALTER TABLE "room" DROP COLUMN "stripe_price_id";
