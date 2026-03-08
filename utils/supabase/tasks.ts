/**
 * utils/supabase/tasks.ts
 *
 * Browser-client CRUD helpers for the `tasks` table.
 * Use these inside Client Components or custom hooks alongside
 * `createClient` from '@/utils/supabase/client'.
 *
 * RLS enforcement:
 *  - The anon key is used (no service-role bypass)
 *  - DB policies enforce `auth.uid() = user_id` on every operation
 *  - `insertTask` explicitly passes `user_id` from the authenticated session
 *    to satisfy the `WITH CHECK (auth.uid() = user_id)` INSERT policy
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE EXAMPLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```tsx
 * 'use client';
 * import { useEffect, useState } from 'react';
 * import { createClient } from '@/utils/supabase/client';
 * import { fetchTasks, insertTask, updateTask, deleteTask } from '@/utils/supabase/tasks';
 * import type { TaskRow } from '@/utils/supabase/tasks';
 *
 * export default function TaskList() {
 *   const [tasks, setTasks] = useState<TaskRow[]>([]);
 *   const supabase = createClient();
 *
 *   useEffect(() => {
 *     fetchTasks(supabase).then(setTasks);
 *   }, [supabase]);
 *
 *   return ( ... );
 * }
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Priority, TaskStatus } from '@/types';

// ─── Row shape returned from Supabase (snake_case = DB column names) ──────────

export interface TaskRow {
  id: string;                        // UUID — matches `id UUID PRIMARY KEY`
  user_id: string;                   // UUID — matches `user_id UUID NOT NULL`
  title: string;                     // matches `title TEXT NOT NULL`
  description: string | null;        // matches `description TEXT` (nullable)
  priority: Priority;                // matches `priority priority_level` ENUM
  status: TaskStatus;                // matches `status task_status` ENUM
  energy_req: number;                // matches `energy_req INT CHECK (1–5)`
  estimated_duration: number | null; // matches `estimated_duration INT` (nullable, minutes) — added in 002
  deadline: string | null;           // matches `deadline TIMESTAMPTZ` (nullable, ISO 8601) — added in 002
  order_index: number;               // matches `order_index INT NOT NULL DEFAULT 0` — added in 003
  bout_id: string | null;            // matches `bout_id TEXT` (nullable) — added in 003
  created_at: string;                // ISO 8601 — matches `created_at TIMESTAMPTZ`
  updated_at: string;                // ISO 8601 — matches `updated_at TIMESTAMPTZ`
}

// ─── INSERT payload (user_id is resolved internally from auth session) ────────

export interface InsertTaskPayload {
  title: string;
  description?: string;
  priority?: Priority;          // defaults to 'medium'
  status?: TaskStatus;          // defaults to 'todo'
  energy_req?: number;          // 1–5, defaults to 3
  estimated_duration?: number;  // minutes, must be > 0 if provided
  deadline?: string;            // ISO 8601 UTC string (e.g. new Date().toISOString())
  order_index?: number;         // 0-based sort position within a bout — added in 003
  bout_id?: string | null;      // work bout identifier, null = unscheduled — added in 003
}

// ─── UPDATE payload (all fields optional) ────────────────────────────────────

export type UpdateTaskPayload = Partial<InsertTaskPayload>;

// ─── BATCH ORDER UPDATE payload ───────────────────────────────────────────────

/** Minimal shape used by batchUpdateTaskOrder — only the fields that change on drag */
export interface TaskOrderUpdate {
  /** Task UUID */
  id: string;
  /** New 0-based position within the bout */
  order_index: number;
  /** Destination bout id, or null for the unscheduled pool */
  bout_id: string | null;
}

/** Update a task's calendar slot assignment (`slot_id`), null = unscheduled. */
export async function updateTaskSlot(
  supabase: SupabaseClient,
  taskId: string,
  newSlotId: string | null,
): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ slot_id: newSlotId })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('[updateTaskSlot] Error:', error.message);
    throw new Error(error.message);
  }

  return data;
}


// ─────────────────────────────────────────────────────────────────────────────
// FETCH — SELECT all tasks for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all tasks owned by the currently authenticated user, newest first.
 *
 * RLS SELECT policy (`auth.uid() = user_id`) ensures no other user's rows
 * are ever returned — no manual `.eq('user_id', ...)` filter is needed.
 *
 * @throws if the Supabase query fails
 *
 * @example
 * const supabase = createClient();
 * const tasks = await fetchTasks(supabase);
 */
export async function fetchTasks(supabase: SupabaseClient): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    // Primary sort: bout + position so grouped views render in correct order
    .order('bout_id',    { ascending: true,  nullsFirst: true })
    .order('order_index', { ascending: true })
    // Secondary: newest first within same position (e.g. before first drag)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchTasks] Error:', error.message);
    throw new Error(error.message);
  }

  return data ?? [];
}


// ─────────────────────────────────────────────────────────────────────────────
// INSERT — Add a new task row
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new task for the authenticated user and returns the created row.
 *
 * WHY user_id is fetched here:
 *   The RLS INSERT policy uses `WITH CHECK (auth.uid() = user_id)`.
 *   This means the inserted row MUST include `user_id = auth.uid()` or
 *   Supabase will reject the INSERT (user_id would be NULL otherwise,
 *   and `auth.uid() = NULL` evaluates to FALSE).
 *   We fetch the user from the active session and pass it explicitly.
 *
 * @throws if the user is not authenticated or the query fails
 *
 * @example
 * const supabase = createClient();
 * const task = await insertTask(supabase, {
 *   title: 'Write project proposal',
 *   priority: 'high',
 *   energy_req: 4,
 * });
 */
export async function insertTask(
  supabase: SupabaseClient,
  payload: InsertTaskPayload
): Promise<TaskRow> {
  // Resolve the authenticated user's ID to satisfy the RLS INSERT policy
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Not authenticated. Please sign in to create tasks.');
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id:            user.id,                          // ← required by RLS WITH CHECK
      title:              payload.title,
      description:        payload.description ?? null,
      priority:           payload.priority ?? 'medium',
      status:             payload.status ?? 'todo',
      energy_req:         payload.energy_req ?? 3,
      estimated_duration: payload.estimated_duration ?? null,
      deadline:           payload.deadline ?? null,
      order_index:        payload.order_index ?? 0,
      bout_id:            payload.bout_id ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[insertTask] Error:', error.message);
    throw new Error(error.message);
  }

  return data;
}


// ─────────────────────────────────────────────────────────────────────────────
// UPDATE — Modify an existing task
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates one or more fields on an existing task by its `id`.
 *
 * RLS UPDATE policy (`auth.uid() = user_id`) ensures a user can only
 * update their own tasks — attempts to update another user's task are
 * silently rejected by Supabase (returns 0 rows).
 *
 * Only fields present in `payload` are sent to the DB (no accidental nulling).
 *
 * @throws if the Supabase query fails
 *
 * @example
 * const supabase = createClient();
 * const updated = await updateTask(supabase, 'task-uuid', {
 *   status: 'completed',
 *   priority: 'low',
 * });
 */
export async function updateTask(
  supabase: SupabaseClient,
  id: string,
  payload: UpdateTaskPayload
): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      ...(payload.title              !== undefined && { title: payload.title }),
      ...(payload.description        !== undefined && { description: payload.description }),
      ...(payload.priority           !== undefined && { priority: payload.priority }),
      ...(payload.status             !== undefined && { status: payload.status }),
      ...(payload.energy_req         !== undefined && { energy_req: payload.energy_req }),
      ...(payload.estimated_duration !== undefined && { estimated_duration: payload.estimated_duration }),
      ...(payload.deadline           !== undefined && { deadline: payload.deadline }),
      ...(payload.order_index        !== undefined && { order_index: payload.order_index }),
      ...(payload.bout_id            !== undefined && { bout_id: payload.bout_id }),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[updateTask] Error:', error.message);
    throw new Error(error.message);
  }

  return data;
}


// ─────────────────────────────────────────────────────────────────────────────
// BATCH ORDER UPDATE — Re-index tasks after a drag-and-drop reorder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically re-indexes a set of tasks after a drag-and-drop operation.
 *
 * Sends one UPDATE per task in parallel (Promise.all).  Each UPDATE touches
 * only `order_index` and `bout_id` — the `updated_at` trigger fires
 * automatically so no manual timestamp management is needed.
 *
 * RLS UPDATE policy (`auth.uid() = user_id`) ensures a user can only
 * reorder their own tasks.
 *
 * @param supabase - Browser Supabase client
 * @param updates  - Array of { id, order_index, bout_id } for every task
 *                   whose position or bout changed
 *
 * @throws if any individual update fails
 *
 * @example
 * await batchUpdateTaskOrder(supabase, [
 *   { id: 'task-1', order_index: 0, bout_id: 'bout-1' },
 *   { id: 'task-2', order_index: 1, bout_id: 'bout-1' },
 *   { id: 'task-3', order_index: 0, bout_id: 'bout-2' },
 * ]);
 */
export async function batchUpdateTaskOrder(
  supabase: SupabaseClient,
  updates: TaskOrderUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  const results = await Promise.allSettled(
    updates.map(({ id, order_index, bout_id }) =>
      supabase
        .from('tasks')
        .update({ order_index, bout_id })
        .eq('id', id),
    ),
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error('[batchUpdateTaskOrder] Some updates failed:', failed);
    throw new Error(
      `Failed to save order for ${failed.length} task(s). Please refresh and try again.`,
    );
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Remove a task by id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes a task by its `id`.
 *
 * RLS DELETE policy (`auth.uid() = user_id`) ensures a user can only
 * delete their own tasks.
 *
 * @throws if the Supabase query fails
 *
 * @example
 * const supabase = createClient();
 * await deleteTask(supabase, 'task-uuid');
 */
export async function deleteTask(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[deleteTask] Error:', error.message);
    throw new Error(error.message);
  }
}
