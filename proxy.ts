import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
 * Next.js Middleware — required by @supabase/ssr to keep auth sessions alive.
 *
 * On every matched request this middleware:
 * 1. Creates a Supabase server client that reads/writes cookies on the
 *    incoming request and outgoing response.
 * 2. Calls `supabase.auth.getUser()` which silently refreshes the access token
 *    if it has expired, writing the updated session cookies to the response.
 *
 * Without this middleware, users would be logged out whenever their
 * short-lived access token expires (default: 1 hour).
 */
export async function proxy(request: NextRequest) {
  // Start with a passthrough response; may be replaced inside setAll
  let supabaseResponse = NextResponse.next({ request });

  // Guard: skip Supabase session refresh if credentials are not yet configured.
  // This prevents a hard crash during local development before .env.local is set up.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read all cookies from the incoming request
        getAll() {
          return request.cookies.getAll();
        },
        // Write updated session cookies to both the request and response
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          // 1. Propagate cookies onto the request so downstream server code
          //    sees the refreshed session immediately
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          // 2. Recreate the response so it inherits the mutated request cookies
          supabaseResponse = NextResponse.next({ request });

          // 3. Write cookies onto the response so the browser stores them
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Do NOT remove this call.
  // It refreshes the session token when it has expired and writes the new
  // token back via the setAll cookie handler above.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Route protection ────────────────────────────────────────────────────────
  // Protected routes: redirect to /login if the user is not authenticated
  const isProtectedRoute = pathname.startsWith('/tasks');
  if (isProtectedRoute && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname); // preserve intended destination
    return NextResponse.redirect(loginUrl);
  }

  // Auth routes: redirect to /tasks if the user is already authenticated
  const isAuthRoute = pathname === '/login';
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/tasks', request.url));
  }

  return supabaseResponse;
}

/**
 * Matcher config — run middleware on all routes EXCEPT:
 * - Next.js internals  (_next/static, _next/image)
 * - Static file extensions (svg, png, jpg, jpeg, gif, webp, ico, fonts)
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
