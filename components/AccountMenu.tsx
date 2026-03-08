'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

type UserSummary = {
  email: string | null;
};

export default function AccountMenu() {
  const router = useRouter();
  const supabase = createClient();
  const menuRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [user, setUser] = useState<UserSummary | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data.user ? { email: data.user.email ?? null } : null);
      setLoading(false);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email ?? null } : null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const handleLogout = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setOpen(false);
    setSigningOut(false);
    router.push('/login');
    router.refresh();
  };

  const initials = user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
      >
        <span className="text-white text-sm font-medium">{initials}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-xl p-3 z-50"
        >
          <div className="px-2 py-2 border-b border-slate-700 mb-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Account</p>
            {loading ? (
              <p className="text-sm text-slate-500 mt-1">Loading...</p>
            ) : user ? (
              <>
                <p className="text-sm text-slate-100 mt-1 truncate">{user.email}</p>
                <p className="text-xs text-emerald-400 mt-0.5">Signed in</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-300 mt-1">Guest</p>
                <p className="text-xs text-slate-500 mt-0.5">Not signed in</p>
              </>
            )}
          </div>

          <div className="space-y-1">
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={signingOut}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                role="menuitem"
              >
                {signingOut ? 'Logging out…' : 'Log out'}
              </button>
            ) : (
              <Link
                href="/login"
                className="block px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-slate-800"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
