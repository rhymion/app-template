-- cmd_499: normalize nativeEnum member casing to lowercase snake_case for
-- the 4 PascalCase outlier enums in app-template's schema (2 inherited from
-- app-generator's cmd_493, 2 app-template-only consumer additions).
-- Verified against an isolated test database seeded with pre-migration
-- (PascalCase) rows -- see docs/knowledge/enum-member-naming.md for the
-- app-generator-side worked example this mirrors.

BEGIN;

-- ApprovalRequestStatus: Pending/Approved/Rejected/TerminalRejected -> lowercase
CREATE TYPE "ApprovalRequestStatus_new" AS ENUM ('pending', 'approved', 'rejected', 'terminal_rejected');

ALTER TABLE "approval_request" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "approval_request" ALTER COLUMN "status" TYPE "ApprovalRequestStatus_new" USING (
  CASE "status"::text
    WHEN 'Pending' THEN 'pending'
    WHEN 'Approved' THEN 'approved'
    WHEN 'Rejected' THEN 'rejected'
    WHEN 'TerminalRejected' THEN 'terminal_rejected'
  END::"ApprovalRequestStatus_new"
);
ALTER TYPE "ApprovalRequestStatus" RENAME TO "ApprovalRequestStatus_old";
ALTER TYPE "ApprovalRequestStatus_new" RENAME TO "ApprovalRequestStatus";
DROP TYPE "ApprovalRequestStatus_old";
ALTER TABLE "approval_request" ALTER COLUMN "status" SET DEFAULT 'pending';

-- ReactionType: Like/Love/Laugh/Surprised/Sad -> lowercase
CREATE TYPE "ReactionType_new" AS ENUM ('like', 'love', 'laugh', 'surprised', 'sad');

ALTER TABLE "reaction" ALTER COLUMN "type" TYPE "ReactionType_new" USING (
  CASE "type"::text
    WHEN 'Like' THEN 'like'
    WHEN 'Love' THEN 'love'
    WHEN 'Laugh' THEN 'laugh'
    WHEN 'Surprised' THEN 'surprised'
    WHEN 'Sad' THEN 'sad'
  END::"ReactionType_new"
);
ALTER TYPE "ReactionType" RENAME TO "ReactionType_old";
ALTER TYPE "ReactionType_new" RENAME TO "ReactionType";
DROP TYPE "ReactionType_old";

-- DayOfWeek (app-template-only): Sunday..Saturday -> lowercase
CREATE TYPE "DayOfWeek_new" AS ENUM ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

ALTER TABLE "shift_template" ALTER COLUMN "day_of_week" TYPE "DayOfWeek_new" USING (
  CASE "day_of_week"::text
    WHEN 'Sunday' THEN 'sunday'
    WHEN 'Monday' THEN 'monday'
    WHEN 'Tuesday' THEN 'tuesday'
    WHEN 'Wednesday' THEN 'wednesday'
    WHEN 'Thursday' THEN 'thursday'
    WHEN 'Friday' THEN 'friday'
    WHEN 'Saturday' THEN 'saturday'
  END::"DayOfWeek_new"
);
ALTER TYPE "DayOfWeek" RENAME TO "DayOfWeek_old";
ALTER TYPE "DayOfWeek_new" RENAME TO "DayOfWeek";
DROP TYPE "DayOfWeek_old";

-- ShiftStatus (app-template-only): Scheduled/Approved/Cancelled -> lowercase
CREATE TYPE "ShiftStatus_new" AS ENUM ('scheduled', 'approved', 'cancelled');

ALTER TABLE "shift" ALTER COLUMN "status" TYPE "ShiftStatus_new" USING (
  CASE "status"::text
    WHEN 'Scheduled' THEN 'scheduled'
    WHEN 'Approved' THEN 'approved'
    WHEN 'Cancelled' THEN 'cancelled'
  END::"ShiftStatus_new"
);
ALTER TYPE "ShiftStatus" RENAME TO "ShiftStatus_old";
ALTER TYPE "ShiftStatus_new" RENAME TO "ShiftStatus";
DROP TYPE "ShiftStatus_old";

COMMIT;
