/**
 * app/tasks/page.tsx  — Server Component
 *
 * Guards against missing Supabase credentials before mounting the
 * Client Component. Shows clear setup instructions if .env.local
 * is not yet configured, preventing a hard crash.
 *
 * Visit: http://localhost:3000/tasks
 */

import TasksClient from './TasksClient';

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function TasksPage() {
  // ── Not configured: show setup instructions ──────────────────────────────
  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-lg w-full space-y-6">

          {/* Icon + heading */}
          <div className="text-center space-y-2">
            <div className="text-5xl">🔧</div>
            <h1 className="text-2xl font-bold text-white">Setup Required</h1>
            <p className="text-slate-400 text-sm">
              Supabase credentials are not configured yet.
            </p>
          </div>

          {/* Steps */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4 text-sm">
            <h2 className="font-semibold text-slate-200">To get started:</h2>

            <ol className="space-y-3 text-slate-400 list-none">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                <span>
                  Copy the example env file:
                  <code className="block mt-1 bg-slate-900 text-indigo-300 px-3 py-1.5 rounded-md font-mono text-xs">
                    cp .env.local.example .env.local
                  </code>
                </span>
              </li>

              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                <span>
                  Open{' '}
                  <code className="bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded font-mono text-xs">.env.local</code>{' '}
                  and fill in your project URL and anon key from{' '}
                  <span className="text-indigo-400">
                    Supabase Dashboard → Project Settings → API
                  </span>
                </span>
              </li>

              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                <span>
                  Run the migration by pasting{' '}
                  <code className="bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    supabase/migrations/001_initial_schema.sql
                  </code>{' '}
                  into the Supabase SQL Editor and clicking <strong className="text-slate-200">Run</strong>
                </span>
              </li>

              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                <span>
                  Restart the dev server:
                  <code className="block mt-1 bg-slate-900 text-indigo-300 px-3 py-1.5 rounded-md font-mono text-xs">
                    npm run dev
                  </code>
                </span>
              </li>
            </ol>
          </div>

          {/* Env var checklist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-xs space-y-2">
            <p className="text-slate-500 font-medium uppercase tracking-wide">Required env vars</p>
            {[
              'NEXT_PUBLIC_SUPABASE_URL',
              'NEXT_PUBLIC_SUPABASE_ANON_KEY',
            ].map(key => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-red-400">✕</span>
                <code className="text-slate-400 font-mono">{key}</code>
                <span className="text-slate-600">— not set</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    );
  }

  // ── Configured: render the full task UI ──────────────────────────────────
  return <TasksClient />;
}
