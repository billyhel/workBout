'use client';

import { useDroppable } from '@dnd-kit/core';

type SlotTask = {
  id: string;
  title: string;
};

type WorkBout = {
  id: string;
  label: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
};

interface CalendarGridProps {
  slotTasks?: Record<string, SlotTask[]>;
  workBouts?: WorkBout[];
}

const DEFAULT_WORK_BOUTS: WorkBout[] = [
  { id: 'deep-focus', label: 'Deep Focus', start: '09:00', end: '11:00' },
];

const HALF_HOUR_SLOTS = Array.from({ length: 47 }, (_, index) => {
  const minutes = index * 30; // 00:00 -> 23:00
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const key = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const label = `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;

  return { key, label, hour24, minute };
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isSlotInBout(slotKey: string, bout: WorkBout): boolean {
  const slotMin = toMinutes(slotKey);
  return slotMin >= toMinutes(bout.start) && slotMin < toMinutes(bout.end);
}

function getBoutForSlot(slotKey: string, workBouts: WorkBout[]): WorkBout | undefined {
  return workBouts.find((bout) => isSlotInBout(slotKey, bout));
}

function DroppableSlot({
  slotKey,
  slotLabel,
  tasks,
  bout,
}: {
  slotKey: string;
  slotLabel: string;
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
      className={`grid grid-cols-[120px_1fr] gap-3 rounded-lg border p-3 transition-colors ${
        bout
          ? 'border-sky-500/40 bg-sky-500/10'
          : 'border-slate-700 bg-slate-800/50'
      } ${isOver ? 'ring-2 ring-indigo-400 border-indigo-400' : ''}`}
    >
      <div className="text-xs font-medium text-slate-400">{slotLabel}</div>

      <div className="min-h-10">
        {bout && (
          <div className="mb-2 inline-flex items-center rounded-full bg-sky-400/20 px-2 py-0.5 text-xs font-medium text-sky-200">
            Work Bout: {bout.label}
          </div>
        )}

        {tasks.length > 0 ? (
          <ul className="space-y-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="rounded-md border border-slate-600 bg-slate-700/80 px-2 py-1 text-sm text-slate-100"
              >
                {task.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Drop tasks here</p>
        )}
      </div>
    </div>
  );
}

export default function CalendarGrid({
  slotTasks = {},
  workBouts = DEFAULT_WORK_BOUTS,
}: CalendarGridProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-200">Calendar Grid</h2>
      <div className="space-y-2">
        {HALF_HOUR_SLOTS.map((slot) => (
          <DroppableSlot
            key={slot.key}
            slotKey={slot.key}
            slotLabel={slot.label}
            tasks={slotTasks[slot.key] ?? []}
            bout={getBoutForSlot(slot.key, workBouts)}
          />
        ))}
      </div>
    </section>
  );
}
