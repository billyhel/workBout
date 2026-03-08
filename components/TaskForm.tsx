'use client';

/**
 * components/TaskForm.tsx
 *
 * Reusable task creation / editing form.
 * Supports: title, description, priority, energy requirement,
 *           estimated duration (minutes), and deadline (date).
 *
 * Validation:
 *  - Title is required
 *  - Deadline cannot be in the past (enforced client-side via `min` attr + submit guard)
 *  - Estimated duration must be a positive integer if provided
 */

import { useState } from 'react';
import type { Priority, EnergyLevel } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DurationMode = 'min' | 'hr' | 'hr:min';

export interface TaskFormData {
  title: string;
  description: string;
  priority: Priority;
  energyRequirement: EnergyLevel;
  durationMode: DurationMode;
  durationHours: number | '';    // used in 'hr' and 'hr:min' modes
  durationMinutes: number | '';  // used in 'min' and 'hr:min' modes
  /** Total minutes computed from mode + hours + minutes. undefined = not set. */
  estimatedDurationTotal?: number;
  deadline: string;              // YYYY-MM-DD from <input type="date">, '' = not set
}

interface TaskFormProps {
  onSubmit?: (data: TaskFormData) => void;
  onCancel?: () => void;
  initialData?: Partial<TaskFormData>;
  submitButtonText?: string;
  isSubmitting?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: { value: Priority; label: string; dot: string }[] = [
  { value: 'low',    label: 'Low',    dot: 'bg-slate-400'  },
  { value: 'medium', label: 'Medium', dot: 'bg-yellow-400' },
  { value: 'high',   label: 'High',   dot: 'bg-orange-400' },
  { value: 'urgent', label: 'Urgent', dot: 'bg-red-400'    },
];

const ENERGY_LABELS = ['', 'Minimal', 'Light', 'Moderate', 'High', 'Intense'];

/** Returns today's date as YYYY-MM-DD for the `min` attribute */
function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Converts total minutes to a human-readable string: "30m", "2h", "1h 30m" */
function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaskForm({
  onSubmit,
  onCancel,
  initialData,
  submitButtonText = 'Create Task',
  isSubmitting = false,
}: TaskFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title:             initialData?.title             ?? '',
    description:       initialData?.description       ?? '',
    priority:          initialData?.priority          ?? 'medium',
    energyRequirement: initialData?.energyRequirement ?? 3,
    durationMode:      initialData?.durationMode      ?? 'min',
    durationHours:     initialData?.durationHours     ?? '',
    durationMinutes:   initialData?.durationMinutes   ?? '',
    deadline:          initialData?.deadline          ?? '',
  });

  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  // ── Field helpers ───────────────────────────────────────────────────────────

  const set = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDeadlineError(null);

    if (!formData.title.trim()) return;

    // Past-date guard
    if (formData.deadline) {
      const selected = new Date(formData.deadline + 'T00:00:00');
      const today    = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected < today) {
        setDeadlineError('Deadline cannot be in the past. Please choose today or a future date.');
        return;
      }
    }

    onSubmit?.({
      ...formData,
      estimatedDurationTotal: computeTotalMinutes(
        formData.durationMode,
        formData.durationHours,
        formData.durationMinutes
      ),
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Title ── */}
      <div>
        <label htmlFor="tf-title" className="block text-sm font-medium text-slate-300 mb-1.5">
          Task Title <span className="text-red-400">*</span>
        </label>
        <input
          id="tf-title"
          type="text"
          value={formData.title}
          onChange={e => set('title', e.target.value)}
          placeholder="What needs to be done?"
          required
          className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
        />
      </div>

      {/* ── Description ── */}
      <div>
        <label htmlFor="tf-description" className="block text-sm font-medium text-slate-300 mb-1.5">
          Description <span className="text-slate-600 font-normal">(optional)</span>
        </label>
        <textarea
          id="tf-description"
          rows={3}
          value={formData.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Add more context…"
          className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors resize-none"
        />
      </div>

      {/* ── Priority + Energy ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Priority */}
        <div>
          <label htmlFor="tf-priority" className="block text-sm font-medium text-slate-300 mb-1.5">
            Priority
          </label>
          <select
            id="tf-priority"
            value={formData.priority}
            onChange={e => set('priority', e.target.value as Priority)}
            className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
          >
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Energy requirement */}
        <div>
          <label htmlFor="tf-energy" className="block text-sm font-medium text-slate-300 mb-1.5">
            Energy:{' '}
            <span className="text-indigo-400 font-semibold">
              {formData.energyRequirement} — {ENERGY_LABELS[formData.energyRequirement]}
            </span>
          </label>
          <input
            id="tf-energy"
            type="range"
            min={1} max={5} step={1}
            value={formData.energyRequirement}
            onChange={e => set('energyRequirement', Number(e.target.value) as EnergyLevel)}
            className="w-full h-2 bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500 mt-2.5"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1 px-0.5">
            {[1, 2, 3, 4, 5].map(n => <span key={n}>{n}</span>)}
          </div>
        </div>
      </div>

      {/* ── Duration + Deadline ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Duration — mode toggle + inputs */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Duration{' '}
            <span className="text-slate-600 font-normal">(optional)</span>
            {computeTotalMinutes(formData.durationMode, formData.durationHours, formData.durationMinutes) !== undefined && (
              <span className="ml-2 text-indigo-400 font-semibold">
                = {formatDuration(computeTotalMinutes(formData.durationMode, formData.durationHours, formData.durationMinutes)!)}
              </span>
            )}
          </label>

          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-600 mb-2">
            {(['min', 'hr', 'hr:min'] as DurationMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => set('durationMode', mode)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  formData.durationMode === mode
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
            {(formData.durationMode === 'hr' || formData.durationMode === 'hr:min') && (
              <div className="flex-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={formData.durationHours}
                  onChange={e =>
                    set('durationHours', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))
                  }
                  placeholder="0"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors text-center"
                />
                <p className="text-xs text-slate-600 text-center mt-1">hours</p>
              </div>
            )}
            {(formData.durationMode === 'min' || formData.durationMode === 'hr:min') && (
              <div className="flex-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={formData.durationMinutes}
                  onChange={e =>
                    set('durationMinutes', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))
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
          <label htmlFor="tf-deadline" className="block text-sm font-medium text-slate-300 mb-1.5">
            Deadline <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <input
            id="tf-deadline"
            type="date"
            min={todayDateString()}
            value={formData.deadline}
            onChange={e => { set('deadline', e.target.value); setDeadlineError(null); }}
            className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors [color-scheme:dark]"
          />
          {deadlineError && (
            <p className="mt-1.5 text-xs text-red-400">{deadlineError}</p>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !formData.title.trim()}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving…
            </span>
          ) : submitButtonText}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
