'use client';

import { BatteryFull, BatteryLow, BatteryMedium, Flag, Flame, GripVertical } from 'lucide-react';

type Level = 1 | 2 | 3 | 4 | 5;

interface TaskCardProps {
  title: string;
  energy: Level;
  priority: Level;
}

function getEnergyVisual(energy: Level) {
  if (energy <= 2) {
    return {
      Icon: BatteryLow,
      label: 'Low energy',
      className: 'text-emerald-400',
    };
  }

  if (energy === 3) {
    return {
      Icon: BatteryMedium,
      label: 'Medium energy',
      className: 'text-yellow-400',
    };
  }

  if (energy === 4) {
    return {
      Icon: BatteryFull,
      label: 'High energy',
      className: 'text-indigo-400',
    };
  }

  return {
    Icon: Flame,
    label: 'Intense energy',
    className: 'text-orange-400',
  };
}

function getPriorityColor(priority: Level) {
  const colorMap: Record<Level, string> = {
    1: 'text-slate-400',
    2: 'text-blue-400',
    3: 'text-yellow-400',
    4: 'text-orange-400',
    5: 'text-red-500',
  };

  return colorMap[priority];
}

export default function TaskCard({ title, energy, priority }: TaskCardProps) {
  const { Icon: EnergyIcon, label: energyLabel, className: energyClass } = getEnergyVisual(energy);
  const priorityClass = getPriorityColor(priority);

  return (
    <article className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 shadow-sm transition-colors hover:border-slate-700">
      <button
        type="button"
        aria-label="Drag task"
        className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-slate-100">{title}</h3>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-300" title={`Energy: ${energy}`}>
          <EnergyIcon className={`h-4 w-4 ${energyClass}`} />
          <span>{energyLabel}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-300" title={`Priority: ${priority}`}>
          <Flag className={`h-4 w-4 ${priorityClass}`} />
          <span>P{priority}</span>
        </div>
      </div>
    </article>
  );
}
