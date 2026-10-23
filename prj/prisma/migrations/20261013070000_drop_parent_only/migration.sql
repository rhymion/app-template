-- DropForeignKey
ALTER TABLE "parent_only" DROP CONSTRAINT "parent_only_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "parent_only" DROP CONSTRAINT "parent_only_updater_id_fkey";

-- DropTable
DROP TABLE "parent_only";
