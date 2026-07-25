import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, AccountRow } from '../types';
import { first, run } from '../db';
import { ok, fail } from '../response';
import { getAccessToken, fetchEmails, fetchEmailDetail } from '../graph';

// External API: fetch emails by API key, no login required.
// Mounted BEFORE the cookie auth middleware so it is not gated by sessions.
const external = new Hono<{ Bindings: Env }>();

type AppContext = Context<{ Bindings: Env }>;

// API-key auth: accept `X-API-Key` header or `?key=` query param
external.use('*', async (c, next) => {
  const row = await first<{ value: string }>(
    c.env.DB,
    "SELECT value FROM settings WHERE key = 'external_api_key'",
    []
  );
  const configured = row?.value;
  if (!configured) {
    return fail('API_DISABLED', '对外 API 未启用：请在「系统设置」生成 API Key', 403);
  }
  const provided = c.req.header('X-API-Key') || c.req.query('key') || '';
  if (provided !== configured) {
    return fail('UNAUTHORIZED', 'API Key 无效', 401);
  }
  await next();
});

/** Resolve mailbox account + Graph access token for external callers. */
async function resolveAccountToken(
  c: AppContext,
  email: string
): Promise<{ token: string } | { response: Response }> {
  const acc = await first<AccountRow>(
    c.env.DB,
    'SELECT * FROM accounts WHERE lower(email) = ?',
    [email]
  );
  if (!acc) return { response: fail('NOT_FOUND', '账号不存在', 404) };
  if (acc.status === 'disabled') return { response: fail('DISABLED', '该账号已停用', 400) };

  const tok = await getAccessToken(acc.client_id, acc.refresh_token);
  if (!tok.token) {
    await run(
      c.env.DB,
      "UPDATE accounts SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [acc.id]
    );
    return { response: fail('TOKEN_FAILED', tok.error?.message || 'Token 获取失败', 502) };
  }

  // Persist a rotated refresh_token if Microsoft issued one
  if (tok.newRefreshToken && tok.newRefreshToken !== acc.refresh_token) {
    await run(
      c.env.DB,
      "UPDATE accounts SET refresh_token = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [tok.newRefreshToken, acc.id]
    );
  } else if (acc.status === 'error') {
    // Token works without rotation: clear the stale error flag
    await run(
      c.env.DB,
      "UPDATE accounts SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [acc.id]
    );
  }

  return { token: tok.token };
}

// GET /api/external/emails?email=<addr>&folder=inbox|junkemail|deleteditems|all&top=10&keyword=
external.get('/emails', async (c) => {
  const email = (c.req.query('email') || '').trim().toLowerCase();
  if (!email) return fail('BAD_REQUEST', '缺少 email 参数', 400);

  const folder = c.req.query('folder') || 'inbox';
  const top = Math.min(parseInt(c.req.query('top') || '10', 10) || 10, 50);
  const keyword = c.req.query('keyword') || undefined;

  const resolved = await resolveAccountToken(c, email);
  if ('response' in resolved) return resolved.response;

  const result = await fetchEmails(resolved.token, { folder, top, skip: 0, keyword });
  if (result.error) return fail('GRAPH_ERROR', result.error.message, 502);

  const items = (result.items ?? []).map((e) => ({
    id: e.id,
    subject: e.subject ?? '(无主题)',
    from: {
      name: e.from?.emailAddress?.name ?? '',
      address: e.from?.emailAddress?.address ?? '',
    },
    receivedDateTime: e.receivedDateTime,
    bodyPreview: e.bodyPreview ?? '',
    isRead: e.isRead,
  }));

  return ok({ email, folder, count: items.length, items });
});

// GET /api/external/emails/detail?email=<addr>&id=<messageId>
// Full HTML/text body for invite links, OTP extraction, etc.
external.get('/emails/detail', async (c) => {
  const email = (c.req.query('email') || '').trim().toLowerCase();
  const id = (c.req.query('id') || c.req.query('messageId') || '').trim();
  if (!email) return fail('BAD_REQUEST', '缺少 email 参数', 400);
  if (!id) return fail('BAD_REQUEST', '缺少 id 参数', 400);

  const resolved = await resolveAccountToken(c, email);
  if ('response' in resolved) return resolved.response;

  const result = await fetchEmailDetail(resolved.token, id);
  if (result.error) {
    if (result.error.code === 'NOT_FOUND') return fail('NOT_FOUND', '邮件不存在', 404);
    return fail(result.error.code || 'GRAPH_ERROR', result.error.message, 502);
  }

  const e = result.item!;
  const bodyContent = e.body?.content ?? '';
  const bodyType = e.body?.contentType ?? 'html';

  return ok({
    email,
    id: e.id,
    subject: e.subject ?? '(无主题)',
    from: {
      name: e.from?.emailAddress?.name ?? '',
      address: e.from?.emailAddress?.address ?? '',
    },
    receivedDateTime: e.receivedDateTime,
    bodyPreview: e.bodyPreview ?? '',
    body: bodyContent,
    bodyType,
    isRead: e.isRead,
    hasAttachments: e.hasAttachments ?? false,
  });
});

export default external;
