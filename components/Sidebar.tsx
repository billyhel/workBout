'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, ListTodo } from 'lucide-react';

const navItems = [
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-20 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-8 space-y-8">
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
