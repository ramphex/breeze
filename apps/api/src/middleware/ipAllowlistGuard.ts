import type { Context, Next } from 'hono';
import { enforceIpAllowlist } from '../services/ipAllowlist';

/**
 * Enforces the partner IP allowlist for an already-authenticated request.
 * Assumes c.get('auth') is set. Returns a 403 on deny; otherwise calls next().
 */
export async function ipAllowlistGuard(c: Context, next: Next): Promise<void | Response> {
  const auth = c.get('auth');
  const decision = await enforceIpAllowlist(c, {
    partnerId: auth?.partnerId ?? null,
    isPlatformAdmin: auth?.user?.isPlatformAdmin === true,
    actorId: auth?.user?.id ?? null,
    actorEmail: auth?.user?.email ?? null,
  });
  if (decision.decision === 'deny') {
    return c.json({ code: 'ip_not_allowed', error: 'Access denied from this IP address' }, 403);
  }
  await next();
}
