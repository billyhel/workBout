'use client';

/**
 * hooks/useTasks.ts
 *
 * Custom React hook for managing the authenticated user's tasks.
 *
 * Features:
 *  - Fetches all tasks on mount (scoped to the signed-in user via RLS)
 *  - `addTask`      — inserts a new task; user_id is resolved from the active session
 *  - `toggleComplete` — flips a task between 'todo' ↔ 'completed' with optimistic UI
 *  - `refresh`      — manually re-fetches tasks from Supabase
 *  - Exposes `loading` and `error` state for UI feedback
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE EXAMPLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```tsx
 * 'use client';
 * import { useTasks } from '@/hooks/useTasks';
 *
 * export default function TaskList() {
 *   const { tasks, loading, error, addTask, toggleComplete } = useTasks();
 *
 *   if (loading) return <p>Loading…</p>;
 *   if (error)   return <p>Error: {error}</p>;
 *
 *   return (
 *     <ul>
 *       {tasks.map(task => (
 *         <li key={task.id}>
 *           <span style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
 *             {task.title}
 *           </span>
 *           <button onClick={() => toggleComplete(task.id)}>
 *             {task.status === 'completed' ? 'Undo' : 'Complete'}
 *           </button>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type React from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  fetchTasks,
  insertTask,
  updateTask,
  batchUpdateTaskOrder,
  type TaskRow,
  type TaskOrderUpdate,
  type InsertTaskPayload,
} from '@/utils/supabase/tasks';

// ─── Public return type ───────────────────────────────────────────────────────

export interface UseTasksReturn {
  /** All tasks belonging to the authenticated user, ordered by bout + position */
  tasks: TaskRow[];
  /** True while the initial fetch (or a manual refresh) is in flight */
  loading: boolean;
  /** Last error message, or null if no error */
  error: string | null;
  /**
   * Insert a new task for the signed-in user.
   * `user_id` is resolved automatically from the active Supabase session —
   * you do NOT need to pass it.
   *
   * @throws if the user is not authenticated or the insert fails
   */
  addTask: (payload: InsertTaskPayload) => Promise<void>;
  /**
   * Toggle a task's completion status:
   *   'completed' → 'todo'
   *   anything else → 'completed'
   *
   * Uses an optimistic update — the UI flips immediately and reverts on error.
   *
   * @throws if the update fails (after reverting the optimistic change)
   */
  toggleComplete: (id: string) => Promise<void>;
  /**
   * Persist a drag-and-drop reorder to Supabase.
   *
   * Applies an optimistic update to local state immediately, then sends
   * `batchUpdateTaskOrder` to Supabase.  On failure the optimistic change
   * is reverted by re-fetching from the server.
   *
   * `updates` should contain every task whose `order_index` or `bout_id`
   * changed — typically all tasks in the source bout + all tasks in the
   * destination bout (including the moved task).
   *
   * @example
   * await reorderTasks([
   *   { id: 'task-1', order_index: 0, bout_id: 'bout-1' },
   *   { id: 'task-2', order_index: 1, bout_id: 'bout-1' },
   *   { id: 'task-3', order_index: 0, bout_id: 'bout-2' }, // moved task
   * ]);
   */
  reorderTasks: (updates: TaskOrderUpdate[]) => Promise<void>;
  /** Manually re-fetch all tasks from Supabase */
  refresh: () => Promise<void>;
  /** Local state setter exposed for realtime sync merges */
  setTasks: React.Dispatch<React.SetStateAction<TaskRow[]>>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks]     = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<string | null>(null);

  /**
   * Memoize the Supabase browser client so the same instance is reused
   * across renders. `createBrowserClient` is safe to call multiple times
   * (it uses an internal singleton), but `useMemo` keeps the reference
   * stable for `useCallback` dependency arrays.
   */
  const supabase = useMemo(() => createClient(), []);

  // ── Load tasks ─────────────────────────────────────────────────────────────

  const loadTasks = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // RLS SELECT policy ensures only the authenticated user's rows are returned
      const data = await fetchTasks(supabase);
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Fetch on mount
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ── addTask ────────────────────────────────────────────────────────────────

  const addTask = useCallback(
    async (payload: InsertTaskPayload): Promise<void> => {
      setError(null);
      try {
        /**
         * `insertTask` calls `supabase.auth.getUser()` internally and passes
         * `user_id: user.id` to the INSERT, satisfying the RLS WITH CHECK policy.
         * No need to pass user_id from here.
         */
        const newTask = await insertTask(supabase, payload);

        // Prepend so the new task appears at the top (matches `created_at DESC` order)
        setTasks(prev => [newTask, ...prev]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add task.';
        setError(message);
        throw err; // Re-throw so the calling component can show its own feedback
      }
    },
    [supabase]
  );

  // ── toggleComplete ─────────────────────────────────────────────────────────

  const toggleComplete = useCallback(
    async (id: string): Promise<void> => {
      // Find the task to toggle
      const task = tasks.find(t => t.id === id);
      if (!task) return;

      const newStatus = task.status === 'completed' ? 'todo' : 'completed';

      /**
       * Optimistic update — flip the status in local state immediately so
       * the UI feels instant. If the Supabase call fails, we revert.
       */
      setTasks(prev =>
        prev.map(t => (t.id === id ? { ...t, status: newStatus } : t))
      );

      try {
        // RLS UPDATE policy ensures only the task owner can update this row
        await updateTask(supabase, id, { status: newStatus });
      } catch (err) {
        // Revert the optimistic update on failure
        setTasks(prev =>
          prev.map(t => (t.id === id ? { ...t, status: task.status } : t))
        );
        const message = err instanceof Error ? err.message : 'Failed to update task.';
        setError(message);
        throw err;
      }
    },
    [supabase, tasks]
  );

  // ── reorderTasks ───────────────────────────────────────────────────────────

  const reorderTasks = useCallback(
    async (updates: TaskOrderUpdate[]): Promise<void> => {
      if (updates.length === 0) return;

      // Build a lookup map for O(1) access during optimistic update
      const updateMap = new Map(
        updates.map(u => [u.id, u]),
      );

      // Optimistic update — apply new order_index / bout_id immediately
      setTasks(prev =>
        prev
          .map(t => {
            const u = updateMap.get(t.id);
            return u ? { ...t, order_index: u.order_index, bout_id: u.bout_id } : t;
          })
          // Re-sort so the list reflects the new order without a round-trip
          .sort((a, b) => {
            // null bout_id (unscheduled) sorts first
            if (a.bout_id !== b.bout_id) {
              if (a.bout_id === null) return -1;
              if (b.bout_id === null) return  1;
              return a.bout_id.localeCompare(b.bout_id);
            }
            return a.order_index - b.order_index;
          }),
      );

      try {
        await batchUpdateTaskOrder(supabase, updates);
      } catch (err) {
        // Revert by re-fetching the authoritative server state
        await loadTasks();
        const message =
          err instanceof Error ? err.message : 'Failed to save task order.';
        setError(message);
        throw err;
      }
    },
    [supabase, loadTasks],
  );

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    tasks,
    loading,
    error,
    addTask,
    toggleComplete,
    reorderTasks,
    refresh: loadTasks,
    setTasks,
  };
}
