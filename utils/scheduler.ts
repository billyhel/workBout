/**
 * utils/scheduler.ts
 *
 * Energy-aware task scheduler.
 *
 * `groupTasksIntoWorkBouts()` takes an array of Supabase task rows and a
 * user's energy map, then returns tasks grouped into 90-minute "Work Bouts"
 * where each bout targets a specific energy level matched to the user's
 * predicted energy peaks.
 *
 * ─── Algorithm overview ───────────────────────────────────────────────────────
 *  1. Filter tasks to actionable only (exclude completed / cancelled)
 *  2. Derive energy peaks from the energy map:
 *       weeklyPattern (today's time-of-day slots)
 *       → insights.bestWorkHours (infer high / medium / low tiers)
 *       → currentEnergyLevel / energy_level (generate 3 tiers from current)
 *  3. Sort tasks: priority desc, then energy proximity to the highest peak
 *  4. Greedy bin-pack tasks into 90-min bouts:
 *       - Assign each task to the bout whose energy level is closest to the
 *         task's energy_req AND that still has capacity
 *       - If no existing bout fits, open an overflow bout at the task's level
 *       - Tasks longer than 90 min go to `unscheduled`
 *  5. Return { bouts, unscheduled, summary }
 *
 * ─── Usage example ────────────────────────────────────────────────────────────
 *
 * ```ts
 * import { groupTasksIntoWorkBouts } from '@/utils/scheduler';
 *
 * const result = groupTasksIntoWorkBouts(tasks, energyMapRow);
 *
 * result.bouts.forEach(bout => {
 *   console.log(`${bout.label}: ${bout.tasks.length} tasks · ${bout.totalMinutes}min used`);
 *   bout.tasks.forEach(t => console.log(`  - ${t.title} (⚡${t.energy_req})`));
 * });
 *
 * if (result.unscheduled.length > 0) {
 *   console.warn('Could not schedule:', result.unscheduled.map(t => t.title));
 * }
 * ```
 */

import type { TaskRow } from '@/utils/supabase/tasks';
import type { EnergyLevel, Priority } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration of a single Work Bout in minutes */
export const BOUT_DURATION_MINUTES = 90;

/**
 * Default task duration (minutes) used when `estimated_duration` is null.
 * Represents a typical short task that fits comfortably within a bout.
 */
export const DEFAULT_TASK_DURATION = 30;

// ─── Input types ──────────────────────────────────────────────────────────────

/**
 * Minimal energy map row as stored in the Supabase `energy_map` table.
 * Represents the user's current energy level at the time of the last check-in.
 */
export interface EnergyMapRow {
  id: string;
  user_id: string;
  /** Current energy level 1–5 */
  energy_level: number;
  created_at: string;
}

/**
 * Richer energy map with weekly patterns and insights.
 * Matches the `UserEnergyMap` interface from types/index.ts.
 */
export interface RichEnergyMap {
  userId: string;
  timezone?: string;
  /** Current energy level 1–5 */
  currentEnergyLevel?: EnergyLevel;
  /**
   * Weekly pattern: day of week (0 = Sunday … 6 = Saturday)
   * → energy levels for morning / afternoon / evening.
   */
  weeklyPattern?: {
    [dayOfWeek: number]: {
      morning:   EnergyLevel; // 6 am – 12 pm
      afternoon: EnergyLevel; // 12 pm – 6 pm
      evening:   EnergyLevel; // 6 pm – 12 am
    };
  };
  insights?: {
    bestWorkHours?: number[];
    recommendedBreakTimes?: number[];
    averageEnergyByDay?: Map<number, number>;
  };
}

/** Accepts either the minimal DB row or the rich weekly-pattern map */
export type EnergyMapInput = EnergyMapRow | RichEnergyMap;

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ScheduledWorkBout {
  /** 1-based index for display */
  boutIndex: number;
  /** Human-readable label, e.g. "Bout 1 · Morning · Intense Focus" */
  label: string;
  /** Target energy level for this bout (1 = minimal, 5 = intense) */
  targetEnergyLevel: EnergyLevel;
  /** Tasks assigned to this bout, in priority order */
  tasks: TaskRow[];
  /** Sum of task durations (minutes) */
  totalMinutes: number;
  /** Remaining capacity in the 90-min bout */
  remainingMinutes: number;
  /** Utilization percentage (0–100) */
  utilizationPct: number;
}

export interface ScheduleResult {
  /** Bouts ordered by energy level descending (peaks first) */
  bouts: ScheduledWorkBout[];
  /** Tasks that could not be scheduled (duration > 90 min or no bout fits) */
  unscheduled: TaskRow[];
  summary: {
    totalBouts: number;
    totalTasksScheduled: number;
    totalTasksUnscheduled: number;
    /** Total minutes of work across all bouts */
    totalScheduledMinutes: number;
    /** Average bout utilization across all bouts (0–100) */
    averageUtilizationPct: number;
  };
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface EnergySlot {
  energyLevel: EnergyLevel;
  /** Short label for this slot, e.g. "Morning" or "High Energy" */
  label: string;
}

interface MutableBout {
  slot: EnergySlot;
  tasks: TaskRow[];
  totalMinutes: number;
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<Priority, number> = {
  urgent: 4,
  high:   3,
  medium: 2,
  low:    1,
};

const ENERGY_LABEL: Record<number, string> = {
  1: 'Minimal Energy',
  2: 'Light Energy',
  3: 'Moderate Energy',
  4: 'High Energy',
  5: 'Intense Focus',
};

// ─── Type guard ───────────────────────────────────────────────────────────────

function isRichEnergyMap(map: EnergyMapInput): map is RichEnergyMap {
  return 'userId' in map;
}

// ─── Energy peak derivation ───────────────────────────────────────────────────

/**
 * Derives an ordered list of energy slots from the energy map.
 *
 * Data-source priority (highest to lowest):
 *  1. `weeklyPattern` for today → time-of-day slots still ahead of us
 *  2. `insights.bestWorkHours` → infer high / medium / low tiers
 *  3. `currentEnergyLevel` / `energy_level` → 3 tiers from current level
 *
 * Slots are returned sorted by energy level descending (peaks first) so that
 * high-priority tasks are scheduled into the most energetic bouts.
 */
function deriveEnergySlots(map: EnergyMapInput): EnergySlot[] {
  // ── Source 1: weekly pattern ───────────────────────────────────────────────
  if (isRichEnergyMap(map) && map.weeklyPattern) {
    const dayOfWeek = new Date().getDay();
    const pattern   = map.weeklyPattern[dayOfWeek];

    if (pattern) {
      const hour = new Date().getHours();
      const slots: EnergySlot[] = [];

      // Only include time slots that are still ahead of us today
      if (hour < 12) slots.push({ energyLevel: pattern.morning,   label: 'Morning'   });
      if (hour < 18) slots.push({ energyLevel: pattern.afternoon, label: 'Afternoon' });
      if (hour < 24) slots.push({ energyLevel: pattern.evening,   label: 'Evening'   });

      if (slots.length > 0) {
        return slots.sort((a, b) => b.energyLevel - a.energyLevel);
      }
    }
  }

  // ── Source 2: insights.bestWorkHours ──────────────────────────────────────
  if (isRichEnergyMap(map) && (map.insights?.bestWorkHours?.length ?? 0) > 0) {
    return [
      { energyLevel: 5 as EnergyLevel, label: 'Peak Focus'  },
      { energyLevel: 3 as EnergyLevel, label: 'Steady Work' },
      { energyLevel: 1 as EnergyLevel, label: 'Light Tasks' },
    ];
  }

  // ── Source 3: current energy level (fallback) ──────────────────────────────
  const current = (
    isRichEnergyMap(map)
      ? (map.currentEnergyLevel ?? 3)
      : map.energy_level
  ) as EnergyLevel;

  const high   = Math.min(5, current)     as EnergyLevel;
  const medium = Math.max(1, current - 1) as EnergyLevel;
  const low    = Math.max(1, current - 2) as EnergyLevel;

  // Deduplicate (e.g. when current = 1, all three would collapse to 1)
  const seen  = new Set<number>();
  const tiers: EnergySlot[] = [];
  for (const [level, label] of [
    [high,   'High Energy'  ],
    [medium, 'Medium Energy'],
    [low,    'Low Energy'   ],
  ] as [EnergyLevel, string][]) {
    if (!seen.has(level)) {
      seen.add(level);
      tiers.push({ energyLevel: level, label });
    }
  }
  return tiers; // already sorted high → low
}

// ─── Bout label builder ───────────────────────────────────────────────────────

function buildBoutLabel(slot: EnergySlot, boutIndex: number): string {
  return `Bout ${boutIndex} · ${slot.label} · ${ENERGY_LABEL[slot.energyLevel] ?? ''}`.trim();
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Groups tasks into 90-minute Work Bouts by matching task energy requirements
 * to the user's predicted energy peaks.
 *
 * @param tasks     - Task rows from Supabase (any status; completed/cancelled
 *                    are filtered out automatically)
 * @param energyMap - Either a minimal `EnergyMapRow` (from the `energy_map`
 *                    Supabase table) or a `RichEnergyMap` with weekly patterns
 *                    and insights
 * @returns         - `{ bouts, unscheduled, summary }`
 *
 * @example — minimal energy map (DB row)
 * ```ts
 * const result = groupTasksIntoWorkBouts(tasks, {
 *   id: 'abc', user_id: 'xyz', energy_level: 4, created_at: '...'
 * });
 * ```
 *
 * @example — rich energy map (weekly pattern)
 * ```ts
 * const result = groupTasksIntoWorkBouts(tasks, {
 *   userId: 'xyz',
 *   currentEnergyLevel: 4,
 *   weeklyPattern: {
 *     1: { morning: 5, afternoon: 3, evening: 2 }, // Monday
 *   },
 * });
 * ```
 */
export function groupTasksIntoWorkBouts(
  tasks: TaskRow[],
  energyMap: EnergyMapInput,
): ScheduleResult {

  // ── 1. Filter to actionable tasks ──────────────────────────────────────────
  const actionable = tasks.filter(
    t => t.status !== 'completed' && t.status !== 'cancelled',
  );

  if (actionable.length === 0) {
    return {
      bouts: [],
      unscheduled: [],
      summary: {
        totalBouts:              0,
        totalTasksScheduled:     0,
        totalTasksUnscheduled:   0,
        totalScheduledMinutes:   0,
        averageUtilizationPct:   0,
      },
    };
  }

  // ── 2. Derive energy slots (peaks) ─────────────────────────────────────────
  const slots = deriveEnergySlots(energyMap);
  // slots[0] is the highest-energy slot (peak)
  const peakEnergy = slots[0]?.energyLevel ?? 3;

  // ── 3. Sort tasks: priority desc, then energy proximity to peak ────────────
  const sorted = [...actionable].sort((a, b) => {
    const priorityDiff =
      (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary: prefer tasks whose energy_req is closer to the peak
    return (
      Math.abs(a.energy_req - peakEnergy) -
      Math.abs(b.energy_req - peakEnergy)
    );
  });

  // ── 4. Initialise mutable bouts from derived slots ─────────────────────────
  const bouts: MutableBout[] = slots.map(slot => ({
    slot,
    tasks: [],
    totalMinutes: 0,
  }));

  const unscheduled: TaskRow[] = [];

  // ── 5. Greedy bin-pack ─────────────────────────────────────────────────────
  for (const task of sorted) {
    const duration = task.estimated_duration ?? DEFAULT_TASK_DURATION;

    // Tasks longer than a single bout cannot be scheduled
    if (duration > BOUT_DURATION_MINUTES) {
      unscheduled.push(task);
      continue;
    }

    const remaining = (b: MutableBout) => BOUT_DURATION_MINUTES - b.totalMinutes;

    /**
     * Find the best fitting bout:
     *  a) Must have enough remaining capacity for this task
     *  b) Among those, pick the one whose energy level is closest to
     *     the task's energy_req (best energy match)
     *  c) Tie-break: prefer the bout with less remaining space
     *     (tighter packing → fewer half-empty bouts)
     */
    const candidate = bouts
      .filter(b => remaining(b) >= duration)
      .sort((a, b) => {
        const energyDiff =
          Math.abs(a.slot.energyLevel - task.energy_req) -
          Math.abs(b.slot.energyLevel - task.energy_req);
        if (energyDiff !== 0) return energyDiff;
        return remaining(a) - remaining(b); // tighter packing wins
      })[0];

    if (candidate) {
      candidate.tasks.push(task);
      candidate.totalMinutes += duration;
    } else {
      // No existing bout has capacity — open an overflow bout at the
      // task's own energy level so the energy match is still preserved.
      const overflowSlot: EnergySlot = {
        energyLevel: task.energy_req as EnergyLevel,
        label: `${ENERGY_LABEL[task.energy_req] ?? 'Energy'} Overflow`,
      };
      bouts.push({
        slot:         overflowSlot,
        tasks:        [task],
        totalMinutes: duration,
      });
    }
  }

  // ── 6. Build final result ──────────────────────────────────────────────────
  const filledBouts: ScheduledWorkBout[] = bouts
    .filter(b => b.tasks.length > 0)
    .map((b, i) => {
      const totalMinutes     = b.totalMinutes;
      const remainingMinutes = Math.max(0, BOUT_DURATION_MINUTES - totalMinutes);
      const utilizationPct   = Math.min(
        100,
        Math.round((totalMinutes / BOUT_DURATION_MINUTES) * 100),
      );
      return {
        boutIndex:         i + 1,
        label:             buildBoutLabel(b.slot, i + 1),
        targetEnergyLevel: b.slot.energyLevel,
        tasks:             b.tasks,
        totalMinutes,
        remainingMinutes,
        utilizationPct,
      };
    });

  const totalScheduledMinutes =
    filledBouts.reduce((s, b) => s + b.totalMinutes, 0);

  const averageUtilizationPct =
    filledBouts.length > 0
      ? Math.round(
          filledBouts.reduce((s, b) => s + b.utilizationPct, 0) /
          filledBouts.length,
        )
      : 0;

  return {
    bouts: filledBouts,
    unscheduled,
    summary: {
      totalBouts:            filledBouts.length,
      totalTasksScheduled:   filledBouts.reduce((s, b) => s + b.tasks.length, 0),
      totalTasksUnscheduled: unscheduled.length,
      totalScheduledMinutes,
      averageUtilizationPct,
    },
  };
}
