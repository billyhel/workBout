'use client';

/**
 * app/tasks/TasksClient.tsx
 *
 * Client Component — renders the task list UI using the useTasks hook.
 * Only mounted by app/tasks/page.tsx after confirming Supabase env vars exist.
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks } from '@/hooks/useTasks';
import { createClient } from '@/utils/supabase/client';
import type { InsertTaskPayload, TaskRow, TaskOrderUpdate } from '@/utils/supabase/tasks';
import type { Priority } from '@/types';
import CalendarGrid from '@/components/CalendarGrid';

// ─── Priority badge styles ────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<Priority, string> = {
  low:    'bg-slate-500/20 text-slate-300 border-slate-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  high:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  urgent: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const ENERGY_LABELS = ['', 'Minimal', 'Light', 'Moderate', 'High', 'Intense'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD (used as `min` on the deadline input) */
function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Formats an ISO deadline string into a readable label, e.g. "Jan 5" or "Dec 31, 2026" */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** True if the deadline has already passed */
function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date();
}

/** Converts total minutes to a human-readable string: "30m", "2h", "1h 30m" */
function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

type DurationMode = 'min' | 'hr' | 'hr:min';

/**
 * Computes total minutes from the duration mode + field values.
 * Returns undefined if no duration has been entered.
 */
function computeTotalMinutes(
  mode: DurationMode,
  hours: number | '',
  minutes: number | ''
): number | undefined {
  const h = hours   !== '' ? Number(hours)   : 0;
  const m = minutes !== '' ? Number(minutes) : 0;
  if (mode === 'min')    return m > 0 ? m         : undefined;
  if (mode === 'hr')     return h > 0 ? h * 60    : undefined;
  if (mode === 'hr:min') return (h > 0 || m > 0)  ? h * 60 + m : undefined;
}

// ─── Drag handle icon ─────────────────────────────────────────────────────────

function DragHandleIcon() {
  return (
    <svg
      className="w-4 h-4 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0"
      fill="currentColor" viewBox="0 0 20 20"
    >
      <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
    </svg>
  );
}

// ─── Task row content (shared between SortableTaskItem and DragOverlay) ────────

interface TaskRowContentProps {
  task: TaskRow;
  onToggleComplete: (id: string) => void;
  /** When true, renders the floating overlay style (rotated, elevated) */
  isDragOverlay?: boolean;
}

function TaskRowContent({ task, onToggleComplete, isDragOverlay = false }: TaskRowContentProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
      isDragOverlay
        ? 'bg-slate-700 border-indigo-500 shadow-2xl shadow-indigo-500/20 rotate-1 scale-[1.02]'
        : task.status === 'completed'
        ? 'bg-slate-800/40 border-slate-700/40 opacity-55'
        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
    }`}>
      {/* Drag handle (hidden in overlay) */}
      {!isDragOverlay && <DragHandleIcon />}

      {/* Toggle complete */}
      <button
        onClick={() => onToggleComplete(task.id)}
        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
          task.status === 'completed'
            ? 'bg-indigo-500 border-indigo-500 text-white'
            : 'border-slate-500 hover:border-indigo-400 hover:bg-indigo-500/10'
        }`}
        title={task.status === 'completed' ? 'Mark as to-do' : 'Mark as complete'}
        aria-label={task.status === 'completed' ? 'Mark as to-do' : 'Mark as complete'}
      >
        {task.status === 'completed' && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Task details */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          task.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-100'
        }`}>
          {task.title}
        </p>
        <div className="flex items-center flex-wrap gap-2 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority}
          </span>
          <span className="text-xs text-slate-500" title={`Energy required: ${task.energy_req}/5`}>
            ⚡ {task.energy_req}/5
          </span>
          {task.estimated_duration != null && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600"
              title={`Estimated duration: ${task.estimated_duration} min total`}>
              🕐 {formatDuration(task.estimated_duration)}
            </span>
          )}
          {task.deadline != null && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                task.status !== 'completed' && isOverdue(task.deadline)
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-slate-700/60 text-slate-400 border-slate-600'
              }`}
              title={`Deadline: ${new Date(task.deadline).toLocaleString()}`}
            >
              📅 {formatDeadline(task.deadline)}
              {task.status !== 'completed' && isOverdue(task.deadline) && ' · overdue'}
            </span>
          )}
        </div>
      </div>

      {/* Status chip */}
      <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-md font-medium ${
        task.status === 'completed'
          ? 'bg-green-500/10 text-green-400'
          : task.status === 'in-progress'
          ? 'bg-blue-500/10 text-blue-400'
          : 'bg-slate-700 text-slate-400'
      }`}>
        {task.status}
      </span>
    </div>
  );
}

// ─── Sortable task item ───────────────────────────────────────────────────────

interface SortableTaskItemProps {
  task: TaskRow;
  onToggleComplete: (id: string) => void;
}

function SortableTaskItem({ task, onToggleComplete }: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Hide the original row while dragging — DragOverlay renders the ghost
    opacity: isDragging ? 0 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskRowContent task={task} onToggleComplete={onToggleComplete} />
    </li>
  );
}

// ─── Droppable bout group ─────────────────────────────────────────────────────

interface DroppableBoutGroupProps {
  boutId: string | null;
  label: string;
  taskCount: number;
  children: React.ReactNode;
}

function DroppableBoutGroup({ boutId, label, taskCount, children }: DroppableBoutGroupProps) {
  const droppableId = `droppable-${boutId ?? 'unscheduled'}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div className="space-y-2">
      {/* Group header */}
      <div className="flex items-center gap-2 px-1">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          boutId ? 'text-indigo-400' : 'text-slate-500'
        }`}>
          {label}
        </span>
        <span className="text-xs text-slate-600">
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
        <div className="flex-1 h-px bg-slate-700/60" />
      </div>

      {/* Droppable list */}
      <ul
        ref={setNodeRef}
        className={`space-y-2 min-h-[56px] rounded-xl p-1 transition-colors duration-150 ${
          isOver ? 'bg-indigo-500/5 ring-1 ring-inset ring-indigo-500/30' : ''
        }`}
      >
        {children}
        {taskCount === 0 && (
          <li className="flex items-center justify-center h-12 text-xs text-slate-600 border border-dashed border-slate-700/60 rounded-xl">
            Drop tasks here
          </li>
        )}
      </ul>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TasksClient() {
  const { tasks, loading, error, addTask, toggleComplete, reorderTasks, refresh, setTasks } = useTasks();
  const router   = useRouter();
  const supabase = createClient();

  // ── Sign out ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title,             setTitle]             = useState('');
  const [priority,          setPriority]          = useState<Priority>('medium');
  const [energyReq,         setEnergyReq]         = useState(3);
  const [durationMode,    setDurationMode]    = useState<DurationMode>('min');
  const [durationHours,   setDurationHours]   = useState<number | ''>('');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');
  const [deadline,          setDeadline]          = useState('');
  const [submitting,        setSubmitting]        = useState(false);
  const [formError,         setFormError]         = useState<string | null>(null);
  const [formSuccess,       setFormSuccess]       = useState(false);

  // ── DnD state ───────────────────────────────────────────────────────────────
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Demo mapping for calendar slot task rendering (replace with persisted scheduling later)
  const calendarSlotTasks = useMemo(() => {
    const map: Record<string, { id: string; title: string }[]> = {};
    tasks.forEach((task, index) => {
      const slotKey = index % 2 === 0 ? '09:00' : '09:30';
      if (!map[slotKey]) map[slotKey] = [];
      map[slotKey].push({ id: task.id, title: task.title });
    });
    return map;
  }, [tasks]);

  useEffect(() => {
    const channel = supabase
      .channel('tasks-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        (payload: RealtimePostgresUpdatePayload<TaskRow>) => {
          const updated = payload.new;
          setTasks((prev) =>
            prev.map((task) => (task.id === updated.id ? { ...task, ...updated } : task))
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, setTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8 px of movement before activating drag (prevents accidental drags)
      activationConstraint: { distance: 8 },
    }),
  );

  /**
   * Group tasks by bout_id for the grouped list view.
   * Tasks are already ordered by (bout_id, order_index) from fetchTasks,
   * but we re-sort here to guarantee correctness after optimistic updates.
   */
  const boutGroups = useMemo(() => {
    const groups = new Map<string | null, TaskRow[]>();
    for (const task of tasks) {
      const key = task.bout_id ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }
    for (const groupTasks of groups.values()) {
      groupTasks.sort((a, b) => a.order_index - b.order_index);
    }
    return groups;
  }, [tasks]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string);
  };

  /**
   * handleDragEnd — bout-aware reorder
   *
   * After a drag completes:
   *  1. Determine the source bout (where the task came from)
   *  2. Determine the destination bout (where it was dropped)
   *  3. Re-index ALL tasks in the source bout (0, 1, 2…)
   *  4. Insert the moved task at the correct position and re-index the
   *     destination bout (0, 1, 2…)
   *  5. Call reorderTasks() which applies an optimistic update and sends
   *     a batch UPDATE to Supabase for every affected task
   *
   * Dropping on a task  → insert before that task in its bout
   * Dropping on a group → append to the end of that bout
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);

    if (!over) return;

    const draggedTaskId = active.id as string;
    const overId        = over.id as string;

    const draggedTask = tasks.find(t => t.id === draggedTaskId);
    if (!draggedTask) return;

    const sourceBoutId = draggedTask.bout_id ?? null;

    // ── Resolve destination bout ─────────────────────────────────────────────
    let destBoutId: string | null;
    let overTaskId: string | null = null;

    if (overId.startsWith('droppable-')) {
      // Dropped on a bout container (or empty area in that group)
      const rawId = overId.replace('droppable-', '');
      destBoutId = rawId === 'unscheduled' ? null : rawId;
    } else {
      // Dropped on a task — destination = that task's bout
      if (draggedTaskId === overId) return; // no-op
      const overTask = tasks.find(t => t.id === overId);
      if (!overTask) return;
      destBoutId = overTask.bout_id ?? null;
      overTaskId = overId;
    }

    // Source bout (without moved task), sorted
    const sourceBoutTasks = tasks
      .filter(t => (t.bout_id ?? null) === sourceBoutId && t.id !== draggedTaskId)
      .sort((a, b) => a.order_index - b.order_index);

    // Destination bout (without moved task), sorted
    const destBoutTasks = tasks
      .filter(t => (t.bout_id ?? null) === destBoutId && t.id !== draggedTaskId)
      .sort((a, b) => a.order_index - b.order_index);

    // Insert before target task if dropped on task; else append
    const rawInsertIndex = overTaskId
      ? destBoutTasks.findIndex(t => t.id === overTaskId)
      : destBoutTasks.length;
    const insertIndex = rawInsertIndex >= 0 ? rawInsertIndex : destBoutTasks.length;

    // Destination list with moved task inserted
    const newDestBoutTasks: TaskRow[] = [
      ...destBoutTasks.slice(0, insertIndex),
      { ...draggedTask, bout_id: destBoutId, order_index: insertIndex },
      ...destBoutTasks.slice(insertIndex),
    ];

    // Build minimal batch payload:
    // - Re-index ALL tasks in source bout
    // - Re-index ALL tasks in destination bout (incl. moved)
    const updates: TaskOrderUpdate[] = [];

    sourceBoutTasks.forEach((t, i) => {
      updates.push({
        id: t.id,
        order_index: i,
        bout_id: sourceBoutId,
      });
    });

    newDestBoutTasks.forEach((t, i) => {
      updates.push({
        id: t.id,
        order_index: i,
        bout_id: destBoutId,
      });
    });

    try {
      await reorderTasks(updates);
    } catch {
      // `reorderTasks` already handles rollback + error state
    }
  };

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // ── Deadline past-date validation ─────────────────────────────────────────
    if (deadline) {
      const selectedDate = new Date(deadline + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        setFormError('Deadline cannot be in the past. Please choose today or a future date.');
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    setFormSuccess(false);

    const payload: InsertTaskPayload = {
      title:      title.trim(),
      priority,
      energy_req: energyReq,
      ...(computeTotalMinutes(durationMode, durationHours, durationMinutes) !== undefined && {
        estimated_duration: computeTotalMinutes(durationMode, durationHours, durationMinutes),
      }),
      ...(deadline           !== '' && { deadline: new Date(deadline + 'T23:59:59').toISOString() }),
    };

    try {
      await addTask(payload);
      setTitle('');
      setPriority('medium');
      setEnergyReq(3);
      setDurationMode('min');
      setDurationHours('');
      setDurationMinutes('');
      setDeadline('');
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 2500);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to add task. Check your Supabase connection.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">My Tasks</h1>
            <p className="text-sm text-slate-500 mt-0.5">Powered by Supabase · RLS-secured</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Refresh */}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Re-fetch tasks from Supabase"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Global error banner (connection / RLS / auth issues) ── */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm">
            <span className="text-red-400 text-base mt-0.5 flex-shrink-0">⚠</span>
            <div className="space-y-1">
              <p className="font-semibold text-red-300">Supabase error</p>
              <p className="text-red-400">{error}</p>
              <p className="text-slate-500 text-xs mt-1">
                Common causes: not signed in (RLS blocks unauthenticated reads),
                migration not yet run, or invalid credentials in{' '}
                <code className="bg-slate-800 px-1 py-0.5 rounded">.env.local</code>.
              </p>
            </div>
          </div>
        )}

        {/* ── Add Task Form ── */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5"
        >
          <h2 className="text-base font-semibold text-slate-200">Add a Task</h2>

          {formError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <span className="flex-shrink-0 mt-0.5">✕</span>
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
              <span>✓</span>
              <span>Task added successfully!</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="task-title" className="block text-sm font-medium text-slate-400 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              required
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label htmlFor="task-priority" className="block text-sm font-medium text-slate-400 mb-1.5">
                Priority
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Energy Requirement */}
            <div>
              <label htmlFor="task-energy" className="block text-sm font-medium text-slate-400 mb-1.5">
                Energy:{' '}
                <span className="text-indigo-400 font-semibold">
                  {energyReq} — {ENERGY_LABELS[energyReq]}
                </span>
              </label>
              <input
                id="task-energy"
                type="range"
                min={1} max={5} step={1}
                value={energyReq}
                onChange={e => setEnergyReq(Number(e.target.value))}
                className="w-full h-2 bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500 mt-2.5"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-1 px-0.5">
                {[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Duration — mode toggle + inputs */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                Duration <span className="text-slate-600 font-normal">(optional)</span>
                {computeTotalMinutes(durationMode, durationHours, durationMinutes) !== undefined && (
                  <span className="ml-2 text-indigo-400 font-semibold">
                    = {formatDuration(computeTotalMinutes(durationMode, durationHours, durationMinutes)!)}
                  </span>
                )}
              </label>

              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-600 mb-2">
                {(['min', 'hr', 'hr:min'] as DurationMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDurationMode(mode)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      durationMode === mode
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'min' ? 'min' : mode === 'hr' ? 'hr' : 'hr : min'}
                  </button>
                ))}
              </div>

              {/* Inputs */}
              <div className="flex gap-2">
                {(durationMode === 'hr' || durationMode === 'hr:min') && (
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={durationHours}
                      onChange={e =>
                        setDurationHours(e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors text-center"
                    />
                    <p className="text-xs text-slate-600 text-center mt-1">hours</p>
                  </div>
                )}
                {(durationMode === 'min' || durationMode === 'hr:min') && (
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={durationMinutes}
                      onChange={e =>
                        setDurationMinutes(e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors text-center"
                    />
                    <p className="text-xs text-slate-600 text-center mt-1">minutes</p>
                  </div>
                )}
              </div>
            </div>

            {/* Deadline */}
            <div>
              <label htmlFor="task-deadline" className="block text-sm font-medium text-slate-400 mb-1.5">
                Deadline <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <input
                id="task-deadline"
                type="date"
                min={todayDateString()}
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Adding…
              </span>
            ) : '+ Add Task'}
          </button>
        </form>

        {/* ── Calendar Grid ── */}
        <CalendarGrid slotTasks={calendarSlotTasks} />

        {/* ── Task List ── */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-200">
            Tasks{' '}
            {!loading && (
              <span className="text-sm font-normal text-slate-500">
                ({tasks.filter(t => t.status !== 'completed').length} open ·{' '}
                {tasks.filter(t => t.status === 'completed').length} done)
              </span>
            )}
          </h2>

          {/* Loading skeleton */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[72px] bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
              ))}
            </div>

          /* Empty state */
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 border border-dashed border-slate-700 rounded-xl">
              <span className="text-4xl mb-3">📋</span>
              <p className="text-sm font-medium">No tasks yet</p>
              <p className="text-xs mt-1">Add your first task using the form above.</p>
            </div>

          /* Task rows (DnD grouped by bout_id) */
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-5">
                {[...boutGroups.entries()].map(([boutId, groupTasks]) => (
                  <DroppableBoutGroup
                    key={boutId ?? 'unscheduled'}
                    boutId={boutId}
                    label={boutId ? `Work Bout · ${boutId}` : 'Unscheduled'}
                    taskCount={groupTasks.length}
                  >
                    <SortableContext
                      items={groupTasks.map(t => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {groupTasks.map(task => (
                        <SortableTaskItem
                          key={task.id}
                          task={task}
                          onToggleComplete={toggleComplete}
                        />
                      ))}
                    </SortableContext>
                  </DroppableBoutGroup>
                ))}
              </div>

              <DragOverlay>
                {activeTaskId ? (
                  <TaskRowContent
                    task={tasks.find(t => t.id === activeTaskId)!}
                    onToggleComplete={() => {}}
                    isDragOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

      </div>
    </div>
  );
}
