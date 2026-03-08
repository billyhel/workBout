-- ============================================================
-- Migration: 002_add_task_columns.sql
-- Project:   productivity-suite
-- Purpose:   Add estimated_duration and deadline columns to tasks
-- ============================================================
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- after 001_initial_schema.sql has already been applied.
--
-- ── New columns ──────────────────────────────────────────────
--
--   estimated_duration  INT          nullable  — task duration in minutes (must be > 0 if set)
--   deadline            TIMESTAMPTZ  nullable  — optional due date/time, stored in UTC
--
-- ── RLS impact ───────────────────────────────────────────────
--
--   NONE. The existing row-level policies operate exclusively on the
--   `user_id` column using `auth.uid() = user_id`. Row-level policies
--   cover ALL columns in the row automatically — no policy changes are
--   needed when adding new columns.
--
--   Existing policies that remain fully valid without modification:
--     • tasks_select_own   — SELECT  USING (auth.uid() = user_id)
--     • tasks_insert_own   — INSERT  WITH CHECK (auth.uid() = user_id)
--     • tasks_update_own   — UPDATE  USING (auth.uid() = user_id)
--     • tasks_delete_own   — DELETE  USING (auth.uid() = user_id)
--
-- ─────────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS estimated_duration INT
    CONSTRAINT tasks_estimated_duration_positive
    CHECK (estimated_duration IS NULL OR estimated_duration > 0),

  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- ── Column documentation ──────────────────────────────────────

COMMENT ON COLUMN tasks.estimated_duration IS
  'Estimated time to complete the task, in minutes. '
  'Must be a positive integer if provided. NULL means no estimate.';

COMMENT ON COLUMN tasks.deadline IS
  'Optional deadline for the task. Stored as UTC timestamptz. '
  'Convert to the user''s local timezone on the client side.';

-- ── Verification query (run after migration to confirm) ───────
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM   information_schema.columns
-- WHERE  table_name = 'tasks'
--   AND  column_name IN ('estimated_duration', 'deadline')
-- ORDER  BY column_name;
--
-- Expected output:
--   deadline            | timestamp with time zone | YES | null
--   estimated_duration  | integer                  | YES | null
