import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Mirrors @supabase/ssr's CookieOptions type exactly.
 * Defined locally so TypeScript is happy before `npm install`,
 * and remains fully compatible with the package's type after install.
 */
type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  secure?: boolean;
};

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers.
 *
 * - Uses `createServerClient` from @supabase/ssr which reads/writes cookies
 *   via Next.js `next/headers` to persist the user session server-side.
 * - Must be called inside an async function since `cookies()` from
 *   `next/headers` is async in Next.js 15/16.
 *
 * Usage in a Server Component:
 * ```tsx
 * import { createClient } from '@/utils/supabase/server';
 *
 * export default async function Page() {
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 * }
 * ```
 *
 * Usage in a Server Action:
 * ```tsx
 * 'use server';
 * import { createClient } from '@/utils/supabase/server';
 *
 * export async function myAction() {
 *   const supabase = await createClient();
 *   // use supabase here...
 * }
 * ```
 */
export async function createClient() {
  // `cookies()` must be awaited in Next.js 15/16 App Router
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Return all cookies from the incoming request
        getAll() {
          return cookieStore.getAll();
        },
        // Write updated session cookies back to the response
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // `setAll` is called from a Server Component where cookies cannot
            // be mutated. Safe to ignore — the middleware handles session
            // refresh on every request instead.
          }
        },
      },
    }
  );
}
