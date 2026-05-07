import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import * as dbModule from '../../db';
import {
  accountDeletionRequests,
  partners,
  partnerUsers,
  roles,
  users,
} from '../../db/schema';
import {
  rateLimiter,
  getRedis,
  verifyPassword,
} from '../../services';
import { authMiddleware, requireMfa } from '../../middleware/auth';
import { getEmailService } from '../../services/email';
import {
  getClientRateLimitKey,
  resolveUserAuditOrgId,
  writeAuthAudit,
} from './helpers';

const { db } = dbModule;
const runWithSystemDbAccess = async <T>(fn: () => Promise<T>): Promise<T> => {
  const withSystem = dbModule.withSystemDbAccessContext;
  return typeof withSystem === 'function' ? withSystem(fn) : fn();
};

export const accountDeletionRoutes = new Hono();

export const accountDeletionRequestSchema = z.object({
  password: z.string().min(1).max(256),
  reason: z.string().trim().max(2000).optional(),
});

const PROCESS_WINDOW_DAYS = 30;

function processByDate(from: Date = new Date()): Date {
  const out = new Date(from.getTime());
  out.setUTCDate(out.getUTCDate() + PROCESS_WINDOW_DAYS);
  return out;
}

interface AdminRecipient {
  email: string;
  name: string | null;
}

async function findOrgAdminRecipients(opts: {
  partnerId: string | null;
  excludeUserId: string;
}): Promise<AdminRecipient[]> {
  const partnerId = opts.partnerId;
  if (!partnerId) return [];

  // Anyone with a `Partner Admin` role under the same partner — these are
  // the staff with full admin access for this tenant. System scope so the
  // org-user-scoped auth context that triggered this notification can still
  // reach partner-axis tables.
  const rows = await runWithSystemDbAccess(async () =>
    db
      .select({
        email: users.email,
        name: users.name,
      })
      .from(partnerUsers)
      .innerJoin(users, eq(users.id, partnerUsers.userId))
      .innerJoin(roles, eq(roles.id, partnerUsers.roleId))
      .where(
        and(
          eq(partnerUsers.partnerId, partnerId),
          eq(roles.name, 'Partner Admin'),
          ne(users.id, opts.excludeUserId),
          eq(users.status, 'active'),
        )
      )
  );

  return rows.map((r) => ({ email: r.email, name: r.name ?? null }));
}

async function findPartnerBillingEmail(partnerId: string | null): Promise<string | null> {
  if (!partnerId) return null;
  const [row] = await runWithSystemDbAccess(async () =>
    db
      .select({ billingEmail: partners.billingEmail })
      .from(partners)
      .where(eq(partners.id, partnerId))
      .limit(1)
  );
  return row?.billingEmail ?? null;
}

async function notifyAdminsOfDeletionRequest(opts: {
  requestId: string;
  user: { id: string; email: string; name: string };
  partnerId: string | null;
  orgId: string | null;
  reason: string | null;
  processBy: Date;
}): Promise<void> {
  const emailService = getEmailService();
  if (!emailService) {
    console.warn('[account-deletion] Email service not configured; admin notification skipped');
    return;
  }

  const admins = await findOrgAdminRecipients({
    partnerId: opts.partnerId,
    excludeUserId: opts.user.id,
  });

  let recipientEmails = admins.map((a) => a.email);
  if (recipientEmails.length === 0) {
    const billing = await findPartnerBillingEmail(opts.partnerId);
    if (billing) recipientEmails = [billing];
  }

  if (recipientEmails.length === 0) {
    console.warn(
      `[account-deletion] No admin recipients resolved for request ${opts.requestId} (partnerId=${opts.partnerId ?? 'null'})`
    );
    return;
  }

  const dashboardBase = (process.env.DASHBOARD_URL || process.env.PUBLIC_APP_URL || 'http://localhost:4321').replace(/\/$/, '');
  // Stub admin review URL — admin-side review UI is future work.
  const reviewUrl = `${dashboardBase}/admin/account-deletion-requests/${opts.requestId}`;

  const subject = `Account deletion request: ${opts.user.email}`;
  const reasonBlock = opts.reason
    ? `<p><strong>Reason given:</strong></p><blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #d1d5db;color:#374151;">${escapeHtml(opts.reason)}</blockquote>`
    : '';
  const html = `
    <p>${escapeHtml(opts.user.name)} (<a href="mailto:${escapeHtml(opts.user.email)}">${escapeHtml(opts.user.email)}</a>) has requested deletion of their Breeze account.</p>
    <p>The request will be processed automatically on or before <strong>${opts.processBy.toUTCString()}</strong>. You can review or cancel it from the admin console.</p>
    ${reasonBlock}
    <p><a href="${reviewUrl}">Review deletion request</a></p>
    <p style="font-size:12px;color:#6b7280;">Request ID: ${opts.requestId}</p>
  `.trim();

  const text = [
    `${opts.user.name} (${opts.user.email}) has requested deletion of their Breeze account.`,
    `The request will be processed on or before ${opts.processBy.toUTCString()}.`,
    opts.reason ? `Reason: ${opts.reason}` : null,
    `Review: ${reviewUrl}`,
    `Request ID: ${opts.requestId}`,
  ].filter(Boolean).join('\n');

  try {
    await emailService.sendEmail({
      to: recipientEmails,
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error('[account-deletion] Failed to send admin notification email:', error);
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeRequest(row: typeof accountDeletionRequests.$inferSelect) {
  return {
    requestId: row.id,
    status: row.status,
    requestedAt: row.requestedAt instanceof Date ? row.requestedAt.toISOString() : row.requestedAt,
    processBy: row.processBy instanceof Date ? row.processBy.toISOString() : row.processBy,
    reason: row.reason,
  };
}

// GET /auth/account-deletion-request — returns the user's current pending request, if any.
accountDeletionRoutes.get('/account-deletion-request', authMiddleware, async (c) => {
  const auth = c.get('auth');

  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, auth.user.id),
        eq(accountDeletionRequests.status, 'pending')
      )
    )
    .limit(1);

  if (!row) {
    return c.json({ pending: null });
  }
  return c.json({ pending: serializeRequest(row) });
});

// POST /auth/account-deletion-request — submit a new deletion request.
accountDeletionRoutes.post(
  '/account-deletion-request',
  authMiddleware,
  requireMfa(),
  zValidator('json', accountDeletionRequestSchema),
  async (c) => {
    const auth = c.get('auth');
    const { password, reason } = c.req.valid('json');

    // Rate limit password reverify attempts: 5 per 5 min per client.
    const redis = getRedis();
    if (!redis) {
      return c.json({ error: 'Service temporarily unavailable' }, 503);
    }

    const rateKey = `account-deletion:${getClientRateLimitKey(c)}:${auth.user.id}`;
    const rateCheck = await rateLimiter(redis, rateKey, 5, 5 * 60);
    if (!rateCheck.allowed) {
      return c.json({
        error: 'Too many attempts. Please try again later.',
        retryAfter: Math.ceil((rateCheck.resetAt.getTime() - Date.now()) / 1000),
      }, 429);
    }

    // Reverify password against the stored hash.
    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        partnerId: users.partnerId,
        orgId: users.orgId,
      })
      .from(users)
      .where(eq(users.id, auth.user.id))
      .limit(1);

    if (!userRow?.passwordHash) {
      writeAuthAudit(c, {
        action: 'user.account_deletion.requested',
        result: 'denied',
        reason: 'no_password',
        userId: auth.user.id,
        email: auth.user.email,
      });
      return c.json({ error: 'Invalid password' }, 401);
    }

    const passwordOk = await verifyPassword(userRow.passwordHash, password);
    if (!passwordOk) {
      writeAuthAudit(c, {
        action: 'user.account_deletion.requested',
        result: 'failure',
        reason: 'invalid_password',
        userId: auth.user.id,
        email: auth.user.email,
      });
      return c.json({ error: 'Invalid password' }, 401);
    }

    // Idempotency: return the existing pending request if one exists.
    const [existing] = await db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.userId, auth.user.id),
          eq(accountDeletionRequests.status, 'pending')
        )
      )
      .limit(1);

    if (existing) {
      return c.json(serializeRequest(existing), 200);
    }

    const processBy = processByDate();

    const [inserted] = await db
      .insert(accountDeletionRequests)
      .values({
        userId: auth.user.id,
        orgId: userRow.orgId ?? null,
        reason: reason && reason.length > 0 ? reason : null,
        status: 'pending',
        processBy,
      })
      .returning();

    if (!inserted) {
      return c.json({ error: 'Failed to record deletion request' }, 500);
    }

    // Audit + notify admins. Notification failures must not block the request.
    const auditOrgId = await resolveUserAuditOrgId(auth.user.id);
    writeAuthAudit(c, {
      orgId: auditOrgId ?? undefined,
      action: 'user.account_deletion.requested',
      result: 'success',
      userId: auth.user.id,
      email: userRow.email,
      name: userRow.name,
      details: { requestId: inserted.id, processBy: processBy.toISOString() },
    });

    void notifyAdminsOfDeletionRequest({
      requestId: inserted.id,
      user: { id: userRow.id, email: userRow.email, name: userRow.name },
      partnerId: userRow.partnerId ?? null,
      orgId: userRow.orgId ?? null,
      reason: inserted.reason,
      processBy,
    }).catch((error) => {
      console.error('[account-deletion] notifyAdminsOfDeletionRequest threw:', error);
    });

    return c.json(serializeRequest(inserted), 201);
  }
);

// PATCH /auth/account-deletion-request/:id — cancel a pending request.
accountDeletionRoutes.patch(
  '/account-deletion-request/:id',
  authMiddleware,
  zValidator('json', z.object({ status: z.literal('cancelled') })),
  async (c) => {
    const auth = c.get('auth');
    const id = c.req.param('id');

    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return c.json({ error: 'Invalid request id' }, 400);
    }

    const [row] = await db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.id, id),
          eq(accountDeletionRequests.userId, auth.user.id)
        )
      )
      .limit(1);

    if (!row) {
      return c.json({ error: 'Request not found' }, 404);
    }

    if (row.status !== 'pending') {
      return c.json({ error: `Cannot cancel a request in status "${row.status}"` }, 409);
    }

    const [updated] = await db
      .update(accountDeletionRequests)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequests.id, id))
      .returning();

    const auditOrgId = await resolveUserAuditOrgId(auth.user.id);
    writeAuthAudit(c, {
      orgId: auditOrgId ?? undefined,
      action: 'user.account_deletion.cancelled',
      result: 'success',
      userId: auth.user.id,
      email: auth.user.email,
      details: { requestId: id },
    });

    if (!updated) {
      return c.json({ error: 'Failed to cancel request' }, 500);
    }
    return c.json(serializeRequest(updated));
  }
);

