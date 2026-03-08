-- ============================================================
-- Migration: 003_add_drag_columns.sql
-- Project:   productivity-suite
-- Purpose:   Add order_index and bout_id columns to tasks
--            to support @dnd-kit drag-and-drop reordering
--            and work-bout assignment.
-- ============================================================
--
-- Run this in the Supabase SQL Editor AFTER 002_add_task_columns.sql.
--
-- ── New columns ──────────────────────────────────────────────
--
--   order_index  INT   NOT NULL DEFAULT 0
--     Sort position within a work bout (0-based, ascending).
--     Re-indexed on every drag so values stay contiguous (0, 1, 2…).
--
--   bout_id  TEXT  nullable
--     Identifier of the work bout this task belongs to
--     (e.g. "bout-1", "bout-2").  NULL = unscheduled.
--
-- ── RLS impact ───────────────────────────────────────────────
--
--   NONE. Existing ownership-based policies cover all columns
--   automatically — no policy changes required.
--
-- ─────────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS order_index  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bout_id      TEXT;

-- ── Indexes ───────────────────────────────────────────────────

-- Fast lookup of all tasks in a specific bout (for re-indexing)
CREATE INDEX IF NOT EXISTS tasks_bout_id_idx
  ON tasks (user_id, bout_id);

-- Fast ordered fetch within a bout
CREATE INDEX IF NOT EXISTS tasks_bout_order_idx
  ON tasks (user_id, bout_id, order_index ASC);

-- ── Column documentation ──────────────────────────────────────

COMMENT ON COLUMN tasks.order_index IS
  '0-based sort position within a work bout. '
  'Re-indexed after every drag so values are always contiguous (0, 1, 2…). '
  'Shared across all tasks when bout_id IS NULL (unscheduled pool).';

COMMENT ON COLUMN tasks.bout_id IS
  'Work bout identifier (e.g. "bout-1"). '
  'NULL means the task has not been assigned to a bout yet. '
  'Set by the energy-aware scheduler or manually via drag-and-drop.';

-- ── Verification query ────────────────────────────────────────
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM   information_schema.columns
-- WHERE  table_name  = 'tasks'
--   AND  column_name IN ('order_index', 'bout_id')
-- ORDER  BY column_name;
--
-- Expected:
--   bout_id      | text    | YES | null
--   order_index  | integer | NO  | 0
