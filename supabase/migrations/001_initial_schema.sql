-- ============================================================
-- Migration: 001_initial_schema.sql
-- Description: Creates tasks and energy_map tables with
--              ENUM types, RLS enabled, and CRUD policies.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1: Create ENUM types
-- ------------------------------------------------------------

-- Priority levels aligned with the TypeScript Priority type
CREATE TYPE priority_level AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

-- Task status aligned with the TypeScript TaskStatus type
CREATE TYPE task_status AS ENUM (
  'todo',
  'in-progress',
  'completed',
  'cancelled'
);


-- ------------------------------------------------------------
-- STEP 2: Create the `tasks` table
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT          NOT NULL,
  description     TEXT,
  priority        priority_level NOT NULL DEFAULT 'medium',
  status          task_status   NOT NULL DEFAULT 'todo',
  energy_req      INT           NOT NULL DEFAULT 3
                                CHECK (energy_req BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks (user_id);


-- ------------------------------------------------------------
-- STEP 3: Create the `energy_map` table (minimal setup)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS energy_map (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  energy_level    INT           NOT NULL
                                CHECK (energy_level BETWEEN 1 AND 5),
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS energy_map_user_id_idx ON energy_map (user_id);


-- ------------------------------------------------------------
-- STEP 4: Auto-update `updated_at` trigger for `tasks`
-- ------------------------------------------------------------

-- Reusable trigger function
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to tasks table
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();


-- ------------------------------------------------------------
-- STEP 5: Enable Row Level Security (RLS)
-- ------------------------------------------------------------

ALTER TABLE tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_map ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- STEP 6: RLS Policies for `tasks`
--         Ownership-based: auth.uid() must match user_id
-- ------------------------------------------------------------

-- SELECT: users can only read their own tasks
CREATE POLICY "tasks: select own rows"
  ON tasks
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can only insert rows for themselves
CREATE POLICY "tasks: insert own rows"
  ON tasks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can only update their own tasks
CREATE POLICY "tasks: update own rows"
  ON tasks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own tasks
CREATE POLICY "tasks: delete own rows"
  ON tasks
  FOR DELETE
  USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- STEP 7: RLS Policies for `energy_map`
--         Ownership-based: auth.uid() must match user_id
-- ------------------------------------------------------------

-- SELECT: users can only read their own energy entries
CREATE POLICY "energy_map: select own rows"
  ON energy_map
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can only insert their own energy entries
CREATE POLICY "energy_map: insert own rows"
  ON energy_map
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can only update their own energy entries
CREATE POLICY "energy_map: update own rows"
  ON energy_map
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own energy entries
CREATE POLICY "energy_map: delete own rows"
  ON energy_map
  FOR DELETE
  USING (auth.uid() = user_id);
