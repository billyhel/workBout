'use client';

/**
 * app/login/page.tsx
 *
 * Simple email/password auth page — supports both Sign In and Sign Up.
 * Uses the Supabase browser client directly (Client Component).
 *
 * Flow:
 *  Sign In  → signInWithPassword → redirect to /tasks
 *  Sign Up  → signUp             → show "check your email" confirmation
 *  Already authenticated         → middleware redirects to /tasks before render
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

type AuthMode = 'signin' | 'signup';

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [mode,        setMode]        = useState<AuthMode>('signin');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      // Session is set — navigate to the protected page
      router.push('/tasks');
      router.refresh(); // flush server component cache so middleware sees new session
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setSuccessMsg(
        'Account created! Check your email for a confirmation link, then sign in.'
      );
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo + heading */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl items-center justify-center mx-auto">
            <span className="text-white font-bold text-xl">P</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            WorkBout
          </h1>
          <p className="text-sm text-slate-500">
            {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
          {(['signin', 'signup'] as AuthMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
                mode === m
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4"
        >
          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <span className="flex-shrink-0 mt-0.5">✕</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success banner */}
          {successMsg && (
            <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
              <span className="flex-shrink-0 mt-0.5">✓</span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-400 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
              </span>
            ) : (
              mode === 'signin' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-600">
          Secured by{' '}
          <span className="text-slate-500 font-medium">Supabase Auth</span>
          {' '}·{' '}
          <span className="text-slate-500 font-medium">RLS-protected</span>
        </p>

      </div>
    </div>
  );
}
