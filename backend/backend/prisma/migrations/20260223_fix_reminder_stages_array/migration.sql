-- AlterColumn: Convert reminderStagesSent from JSONB to TEXT[]
-- This is required for atomic array_append operations in PostgreSQL
-- to prevent duplicate overdue notifications from concurrent cron cycles.

-- Step 1: Add a temporary TEXT[] column
ALTER TABLE "Task" ADD COLUMN "reminderStagesSent_new" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Step 2: Migrate existing JSONB data to the new TEXT[] column
UPDATE "Task"
SET "reminderStagesSent_new" = COALESCE(
    (SELECT array_agg(elem::text)
     FROM jsonb_array_elements_text("reminderStagesSent") AS elem),
    ARRAY[]::TEXT[]
)
WHERE "reminderStagesSent" IS NOT NULL;

-- Step 3: Drop the old JSONB column
ALTER TABLE "Task" DROP COLUMN "reminderStagesSent";

-- Step 4: Rename the new column
ALTER TABLE "Task" RENAME COLUMN "reminderStagesSent_new" TO "reminderStagesSent";

-- Step 5: Set the default
ALTER TABLE "Task" ALTER COLUMN "reminderStagesSent" SET DEFAULT ARRAY[]::TEXT[];

-- Step 6: Add composite index for cleanup job
CREATE INDEX IF NOT EXISTS "Task_status_completedAt_idx" ON "Task"("status", "completedAt");
