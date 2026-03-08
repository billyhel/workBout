'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';

type SlotTask = {
  id: string;
  title: string;
};

type WorkBout = {
  id: string;
  label: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

type ScheduledBlock = {
  id: string;
  taskId: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
};

interface CalendarGridProps {
  slotTasks?: Record<string, SlotTask[]>;
  workBouts?: WorkBout[];
  scheduledBlocks?: ScheduledBlock[];
}

const HOUR_HEIGHT = 60; // px
const TOTAL_HOURS = 24;
const TIMELINE_HEIGHT = HOUR_HEIGHT * TOTAL_HOURS; // 1440px

const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const key = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return { key, hour24, minute, minutes };
});

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour24) => {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const label = `${hour12} ${suffix}`;
  return { hour24, label };
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatTimeLabel(hour24: number, minute: number): string {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isSlotInBout(slotKey: string, bout: WorkBout): boolean {
  const slotMin = toMinutes(slotKey);
  return slotMin >= toMinutes(bout.start) && slotMin < toMinutes(bout.end);
}

function getBoutForSlot(slotKey: string, workBouts: WorkBout[]): WorkBout | undefined {
  return workBouts.find((bout) => isSlotInBout(slotKey, bout));
}

function DroppableHalfHourSlot({
  slotKey,
  top,
  tasks,
  bout,
}: {
  slotKey: string;
  top: number;
  tasks: SlotTask[];
  bout?: WorkBout;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `calendar-slot-${slotKey}`,
    data: { slotKey },
  });

  return (
    <div
      ref={setNodeRef}
      aria-label={`Calendar slot ${slotKey}`}
      className={`absolute left-0 right-0 h-[30px] border-t transition-colors ${
        bout ? 'border-sky-500/40 bg-sky-500/5' : 'border-slate-800'
      } ${isOver ? 'bg-indigo-500/20 ring-1 ring-indigo-400' : ''}`}
      style={{ top }}
    >
      {tasks.length > 0 && (
        <ul className="mx-2 mt-1 space-y-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded border border-slate-600 bg-slate-800/90 px-2 py-1 text-xs text-slate-100"
            >
              {task.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CalendarGrid({
  slotTasks = {},
  workBouts = [],
  scheduledBlocks = [],
}: CalendarGridProps) {
  const [currentMinutes, setCurrentMinutes] = useState<number>(getCurrentMinutes());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMinutes(getCurrentMinutes());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const currentTimeTop = useMemo(() => {
    const bounded = Math.max(0, Math.min(currentMinutes, 1439));
    return bounded;
  }, [currentMinutes]);

  return (
    <section aria-label="Daily calendar timeline" className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex h-[75vh] overflow-auto">
        {/* Sticky time labels column */}
        <div className="sticky left-0 z-20 w-24 shrink-0 border-r border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
            {HOUR_LABELS.map(({ hour24, label }) => (
              <div
                key={hour24}
                className="absolute left-0 right-0 -translate-y-1/2 px-3 text-xs font-medium text-slate-400"
                style={{ top: hour24 * HOUR_HEIGHT }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Main schedule area */}
        <div className="relative flex-1" role="grid" aria-label="24 hour schedule grid">
          <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
            {/* 30-minute grid lines + droppable areas */}
            {HALF_HOUR_SLOTS.map((slot) => {
              const top = slot.minutes;
              return (
                <DroppableHalfHourSlot
                  key={slot.key}
                  slotKey={slot.key}
                  top={top}
                  tasks={slotTasks[slot.key] ?? []}
                  bout={getBoutForSlot(slot.key, workBouts)}
                />
              );
            })}

            {/* Hour labels within grid for better orientation on small screens */}
            {HOUR_LABELS.map(({ hour24, label }) => (
              <div
                key={`grid-label-${hour24}`}
                className="absolute left-3 -translate-y-1/2 text-[10px] uppercase tracking-wide text-slate-600 md:hidden"
                style={{ top: hour24 * HOUR_HEIGHT }}
              >
                {label}
              </div>
            ))}

            {/* Connected scheduled blocks */}
            {scheduledBlocks.map((block) => (
              <div
                key={block.id}
                className="absolute left-2 right-2 z-20 rounded border border-indigo-400/50 bg-indigo-500/20 px-2 py-1 text-xs text-indigo-100 shadow-sm pointer-events-none"
                style={{
                  top: block.startMinutes,
                  height: Math.max(24, block.durationMinutes),
                }}
                aria-label={`${block.title} from ${formatTimeLabel(
                  Math.floor(block.startMinutes / 60),
                  block.startMinutes % 60
                )} for ${block.durationMinutes} minutes`}
              >
                <div className="truncate font-medium">
                  {block.title}
                </div>
                <div className="text-[10px] text-indigo-200/90">
                  {formatTimeLabel(Math.floor(block.startMinutes / 60), block.startMinutes % 60)} · {Math.round(block.durationMinutes)}m
                </div>
              </div>
            ))}

            {/* Current Time Indicator */}
            <div
              className="pointer-events-none absolute left-0 right-0 z-30"
              style={{ top: currentTimeTop }}
              aria-hidden="true"
            >
              <div className="relative border-t border-red-500">
                <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
              </div>
            </div>

            <p className="sr-only" aria-live="polite">
              Current time indicator at {formatTimeLabel(Math.floor(currentMinutes / 60), currentMinutes % 60)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
