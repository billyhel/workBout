import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in Client Components ('use client').
 *
 * - Uses `createBrowserClient` from @supabase/ssr which handles cookie-based
 *   session management automatically in the browser.
 * - Call this function inside a component or hook — do NOT instantiate it at
 *   module level to avoid sharing state across requests.
 *
 * Usage in a Client Component:
 * ```tsx
 * 'use client';
 * import { createClient } from '@/utils/supabase/client';
 *
 * export default function MyComponent() {
 *   const supabase = createClient();
 *   // use supabase here...
 * }
 * ```
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
