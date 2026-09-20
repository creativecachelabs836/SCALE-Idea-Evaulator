import 'server-only';
import { cookies } from 'next/headers';
import { createHash, randomUUID } from 'node:crypto';
import * as repo from '@/data/repositories';

/**
 * Identity and workspace resolution (spec section 7, Identity / Workspace).
 *
 * V1 ships a frictionless workspace: a signed-in identity provider is an open
 * architecture decision (section 13), so a visitor gets a durable workspace
 * bound to an httpOnly cookie minted by `src/middleware.ts`. What matters
 * architecturally is that every downstream query is already tenant-scoped and
 * role-aware, so swapping this module for an IdP is a contained change.
 *
 * Reads are separated from writes on purpose: `getSession` never mints a
 * cookie, because Next.js forbids cookie writes during a Server Component
 * render and a page that tried would fail for exactly the visitors it was
 * meant to onboard.
 */

export const SESSION_COOKIE = 'scale_session';

export interface Session {
  userId: string;
  organizationId: string;
  role: string;
}

function derive(token: string): Session {
  // Deterministic ids from the session token: the same visitor always resolves
  // to the same workspace without storing the raw token anywhere.
  const digest = createHash('sha256').update(token).digest('hex');
  return {
    userId: `usr_${digest.slice(0, 24)}`,
    organizationId: `org_${digest.slice(24, 48)}`,
    role: 'owner',
  };
}

function provision(session: Session): Session {
  repo.ensureOrganization(session.organizationId, 'My Workspace');
  repo.ensureUser({
    id: session.userId,
    organizationId: session.organizationId,
    role: session.role,
  });
  return session;
}

/**
 * Resolve the caller's workspace without mutating cookies. Safe in Server
 * Components. Returns null only when the session cookie is absent, which
 * middleware normally prevents.
 */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? provision(derive(token)) : null;
}

/**
 * Resolve the caller's workspace, minting one if needed. Only legal in Route
 * Handlers and Server Actions.
 */
export async function requireSession(): Promise<Session> {
  const jar = await cookies();
  let token = jar.get(SESSION_COOKIE)?.value;

  if (!token) {
    token = randomUUID();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return provision(derive(token));
}

const WRITE_ROLES = new Set(['owner', 'admin', 'member']);

/** RBAC hook. Centralized now so adding viewer/guest roles is one edit. */
export function canWrite(session: Session): boolean {
  return WRITE_ROLES.has(session.role);
}
