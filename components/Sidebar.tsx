'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Calendar, ListTodo } from 'lucide-react';

const navItems = [
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
];

function getCurrentHour(): number {
  return new Date().getHours();
}

function getEnergyForHour(hour: number): number {
  const minutes = hour * 60;

  if (minutes < 6 * 60) return 30;

  if (minutes < 12 * 60) {
    const t = (minutes - 6 * 60) / (6 * 60);
    const eased = t * t;
    return Math.round(30 + eased * (100 - 30));
  }

  if (minutes < 15 * 60) return 95;

  if (minutes < 21 * 60) {
    const t = (minutes - 15 * 60) / (6 * 60);
    const eased = 1 - Math.pow(1 - t, 2);
    return Math.round(95 - eased * (95 - 30));
  }

  return 30;
}

function getEnergyColor(hour: number): string {
  const energy = getEnergyForHour(hour);

  if (energy >= 70) return 'from-green-500/85 to-green-700/95';
  if (energy >= 41) return 'from-yellow-400/85 to-amber-600/95';
  return 'from-red-500/85 to-red-700/95';
}

export default function Sidebar() {
  const pathname = usePathname();
  const [currentHour, setCurrentHour] = useState<number>(getCurrentHour());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(getCurrentHour());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const sidebarEnergyGradient = getEnergyColor(currentHour);

  return (
    <aside
      className={`w-20 border-r border-slate-800 flex flex-col items-center py-8 space-y-8 bg-gradient-to-b ${sidebarEnergyGradient} transition-colors duration-1000`}
    >
      {/* Logo */}
      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
        <span className="text-white font-bold text-xl">P</span>
      </div>

      {/* Navigation Icons */}
      <nav className="flex-1 flex flex-col items-center space-y-6">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              className={`group relative w-12 h-12 flex items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-indigo-400'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="w-6 h-6" />
              <span className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-slate-200 text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
