import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session establishment.
 *
 * The workspace cookie is minted here rather than during a page render,
 * because Next.js only permits cookie writes in middleware, Route Handlers and
 * Server Actions. Doing it at the edge means every Server Component can treat
 * the session as read-only, and a first-time visitor landing directly on a deep
 * link gets a working workspace instead of an error.
 *
 * Note: this is deliberately not where authorization happens. Every data read
 * is tenant-scoped in the repository layer, so a forged or swapped cookie
 * resolves to a different empty workspace rather than to someone else's data.
 */

const COOKIE = 'scale_session';
const MAX_AGE = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
  if (request.cookies.has(COOKIE)) return NextResponse.next();

  const token = crypto.randomUUID();

  // Set it on the forwarded request too, so the very first render already
  // resolves the same workspace the response is about to persist.
  const headers = new Headers(request.headers);
  const existing = headers.get('cookie');
  headers.set('cookie', existing ? `${existing}; ${COOKIE}=${token}` : `${COOKIE}=${token}`);

  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
