const fs = require('fs');

// ========== accounts.ts ==========
const accPath = 'src/routes/accounts.ts';
let acc = fs.readFileSync(accPath, 'utf8');
const nl = acc.includes('\r\n') ? '\r\n' : '\n';

// Insert helpers after safeAccount
const helperAnchor = 'function safeAccount(acc: AccountRow) {' + nl +
`  return {
    id: acc.id,
    email: acc.email,
    client_id: maskToken(acc.client_id),
    refresh_token: maskToken(acc.refresh_token),
    group_id: acc.group_id,
    remark: acc.remark,
    status: acc.status,
    created_at: acc.created_at,
    updated_at: acc.updated_at,
  };
}` + nl + nl + '// GET /api/accounts';

if (!acc.includes('function parsePositiveIds')) {
  const helpers = `function safeAccount(acc: AccountRow) {
  return {
    id: acc.id,
    email: acc.email,
    client_id: maskToken(acc.client_id),
    refresh_token: maskToken(acc.refresh_token),
    group_id: acc.group_id,
    remark: acc.remark,
    status: acc.status,
    created_at: acc.created_at,
    updated_at: acc.updated_at,
  };
}

/** Keep only unique positive integers (export / batch / batch-test). */
function parsePositiveIds(raw: unknown): number[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return [...new Set(
    list
      .map((v) => (typeof v === 'number' ? v : parseInt(String(v), 10)))
      .filter((n) => Number.isInteger(n) && n > 0)
  )];
}

/**
 * Apply a Graph token probe result to the account row:
 * success → active (+ rotated refresh_token), failure → error.
 */
async function persistTokenProbe(
  db: D1Database,
  acc: AccountRow,
  result: { token?: string; newRefreshToken?: string; error?: { message?: string } }
): Promise<{ connected: boolean; error?: string }> {
  if (result.token) {
    if (result.newRefreshToken && result.newRefreshToken !== acc.refresh_token) {
      await run(
        db,
        'UPDATE accounts SET refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [result.newRefreshToken, 'active', acc.id]
      );
    } else {
      await run(
        db,
        'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['active', acc.id]
      );
    }
    return { connected: true };
  }

  await run(
    db,
    'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['error', acc.id]
  );
  return { connected: false, error: result.error?.message ?? 'Unknown error' };
}

// GET /api/accounts`.replace(/\n/g, nl);

  if (!acc.includes(helperAnchor.replace(/\n/g, nl)) && !acc.includes(helperAnchor)) {
    // try flexible match
    const idx = acc.indexOf('function safeAccount(acc: AccountRow)');
    const getIdx = acc.indexOf('// GET /api/accounts');
    if (idx < 0 || getIdx < 0) throw new Error('helper anchor not found');
    acc = acc.slice(0, idx) + helpers + acc.slice(getIdx);
    console.log('helpers inserted');
  } else {
    acc = acc.replace(helperAnchor.replace(/\n/g, nl).includes('GET') ? helperAnchor : helperAnchor, helpers);
    // fallback
    if (!acc.includes('parsePositiveIds')) {
      const idx = acc.indexOf('function safeAccount(acc: AccountRow)');
      const getIdx = acc.indexOf('// GET /api/accounts');
      acc = acc.slice(0, idx) + helpers + acc.slice(getIdx);
      console.log('helpers inserted (fallback)');
    } else console.log('helpers ok');
  }
}

// Replace export endpoint with optimized version
const exportStart = acc.indexOf("// GET /api/accounts/export");
const exportEnd = acc.indexOf("// POST /api/accounts/batch");
if (exportStart < 0 || exportEnd < 0) throw new Error('export bounds');
const newExport = `// GET /api/accounts/export - export accounts as text (same format as import)
// MUST be before /:id to avoid being matched as id="export"
// ?emails_only=1 → one email per line (no secrets)
accounts.get('/export', async (c) => {
  const groupId = c.req.query('group_id');
  const idsParam = c.req.query('ids');
  const emailsOnly = c.req.query('emails_only') === '1' || c.req.query('emails_only') === 'true';
  type ExportRow = { email: string; password?: string; client_id?: string; refresh_token?: string; created_at?: string };

  const cols = emailsOnly
    ? 'email, created_at'
    : 'email, password, client_id, refresh_token, created_at';

  let rows: ExportRow[];
  if (idsParam) {
    const ids = parsePositiveIds(idsParam);
    if (!ids.length) return ok({ content: '', count: 0, emails_only: emailsOnly });
    const results = await batchRun<ExportRow>(
      c.env.DB,
      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({
        sql: \`SELECT \${cols} FROM accounts WHERE id IN (\${part.map(() => '?').join(',')})\`,
        params: part,
      }))
    );
    rows = results
      .flatMap((r) => r.results)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  } else {
    let sql = \`SELECT \${cols} FROM accounts\`;
    const params: unknown[] = [];
    if (groupId) {
      sql += ' WHERE group_id = ?';
      params.push(parseInt(groupId, 10));
    }
    sql += ' ORDER BY created_at DESC';
    rows = await query<ExportRow>(c.env.DB, sql, params);
  }

  const lines = emailsOnly
    ? rows.map((r) => r.email)
    : rows.map((r) => \`\${r.email}----\${r.password || ''}----\${r.client_id}----\${r.refresh_token}\`);
  return ok({ content: lines.join('\\n'), count: rows.length, emails_only: emailsOnly });
});

`.replace(/\n/g, nl);

// Fix template literals - I used escaped backticks wrongly in the string above.
// Rewrite newExport cleanly:
const newExport2 = [
  "// GET /api/accounts/export - export accounts as text (same format as import)",
  '// MUST be before /:id to avoid being matched as id="export"',
  '// ?emails_only=1 → one email per line (no secrets pulled from DB)',
  "accounts.get('/export', async (c) => {",
  "  const groupId = c.req.query('group_id');",
  "  const idsParam = c.req.query('ids');",
  "  const emailsOnly = c.req.query('emails_only') === '1' || c.req.query('emails_only') === 'true';",
  "  type ExportRow = { email: string; password?: string; client_id?: string; refresh_token?: string; created_at?: string };",
  "",
  "  const cols = emailsOnly",
  "    ? 'email, created_at'",
  "    : 'email, password, client_id, refresh_token, created_at';",
  "",
  "  let rows: ExportRow[];",
  "  if (idsParam) {",
  "    const ids = parsePositiveIds(idsParam);",
  "    if (!ids.length) return ok({ content: '', count: 0, emails_only: emailsOnly });",
  "    const results = await batchRun<ExportRow>(",
  "      c.env.DB,",
  "      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({",
  "        sql: `SELECT ${cols} FROM accounts WHERE id IN (${part.map(() => '?').join(',')})`,",
  "        params: part,",
  "      }))",
  "    );",
  "    rows = results",
  "      .flatMap((r) => r.results)",
  "      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));",
  "  } else {",
  "    let sql = `SELECT ${cols} FROM accounts`;",
  "    const params: unknown[] = [];",
  "    if (groupId) {",
  "      sql += ' WHERE group_id = ?';",
  "      params.push(parseInt(groupId, 10));",
  "    }",
  "    sql += ' ORDER BY created_at DESC';",
  "    rows = await query<ExportRow>(c.env.DB, sql, params);",
  "  }",
  "",
  "  const lines = emailsOnly",
  "    ? rows.map((r) => r.email)",
  "    : rows.map((r) => `${r.email}----${r.password || ''}----${r.client_id}----${r.refresh_token}`);",
  "  return ok({ content: lines.join('\\n'), count: rows.length, emails_only: emailsOnly });",
  "});",
  "",
  "",
].join(nl);

acc = acc.slice(0, exportStart) + newExport2 + acc.slice(exportEnd);
console.log('export replaced');

// Replace batch endpoint - add delete_error, normalize ids
const batchStart = acc.indexOf("// POST /api/accounts/batch -");
const batchEnd = acc.indexOf("// POST /api/accounts/batch-test");
if (batchStart < 0 || batchEnd < 0) throw new Error('batch bounds ' + batchStart + ' ' + batchEnd);

const newBatch = [
  "// POST /api/accounts/batch - batch operations (delete / move / enable / disable / delete_error)",
  "// MUST be before /:id",
  "accounts.post('/batch', async (c) => {",
  "  const body = (await c.req.json().catch(() => ({}))) as {",
  "    action?: string;",
  "    ids?: number[];",
  "    group_id?: number;",
  "  };",
  "",
  "  const inList = (part: number[]) => part.map(() => '?').join(',');",
  "",
  "  // delete_error: wipe all status=error rows (no id list required)",
  "  if (body.action === 'delete_error') {",
  "    const doomed = await query<{ id: number }>(",
  "      c.env.DB,",
  "      \"SELECT id FROM accounts WHERE status = 'error'\"",
  "    );",
  "    if (!doomed.length) return ok({ deleted: 0 }, '没有状态为异常的账号');",
  "    const ids = doomed.map((r) => r.id);",
  "    // CASCADE covers account_tags; still chunk for D1 param limits",
  "    await batchRun(",
  "      c.env.DB,",
  "      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({",
  "        sql: `DELETE FROM accounts WHERE id IN (${inList(part)})`,",
  "        params: part,",
  "      }))",
  "    );",
  "    return ok({ deleted: ids.length }, `已删除 ${ids.length} 个失效账号`);",
  "  }",
  "",
  "  const ids = parsePositiveIds(body.ids);",
  "  if (!ids.length) return badRequest('请选择账号');",
  "",
  "  if (body.action === 'delete') {",
  "    await batchRun(",
  "      c.env.DB,",
  "      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({",
  "        sql: `DELETE FROM accounts WHERE id IN (${inList(part)})`,",
  "        params: part,",
  "      }))",
  "    );",
  "    return ok({ deleted: ids.length }, `已删除 ${ids.length} 个账号`);",
  "  }",
  "",
  "  if (body.action === 'move' && body.group_id !== undefined) {",
  "    await batchRun(",
  "      c.env.DB,",
  "      chunk(ids, D1_MAX_BOUND_PARAMS - 1).map((part) => ({",
  "        sql: `UPDATE accounts SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${inList(part)})`,",
  "        params: [body.group_id, ...part],",
  "      }))",
  "    );",
  "    return ok(null, `已移动 ${ids.length} 个账号`);",
  "  }",
  "",
  "  if (body.action === 'enable') {",
  "    await batchRun(",
  "      c.env.DB,",
  "      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({",
  "        sql: `UPDATE accounts SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id IN (${inList(part)})`,",
  "        params: part,",
  "      }))",
  "    );",
  "    return ok(null, `已启用 ${ids.length} 个账号`);",
  "  }",
  "",
  "  if (body.action === 'disable') {",
  "    await batchRun(",
  "      c.env.DB,",
  "      chunk(ids, D1_MAX_BOUND_PARAMS).map((part) => ({",
  "        sql: `UPDATE accounts SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id IN (${inList(part)})`,",
  "        params: part,",
  "      }))",
  "    );",
  "    return ok(null, `已停用 ${ids.length} 个账号`);",
  "  }",
  "",
  "  return badRequest('未知操作');",
  "});",
  "",
  "",
].join(nl);

acc = acc.slice(0, batchStart) + newBatch + acc.slice(batchEnd);
console.log('batch replaced');

// Replace batch-test + single test to use persistTokenProbe
const btStart = acc.indexOf("// POST /api/accounts/batch-test");
const getIdStart = acc.indexOf("// GET /api/accounts/:id");
const singleTestStart = acc.indexOf("// POST /api/accounts/:id/test");
const exportDefault = acc.indexOf("export default accounts");
if (btStart < 0 || getIdStart < 0 || singleTestStart < 0 || exportDefault < 0) {
  throw new Error(`bounds bt=${btStart} get=${getIdStart} st=${singleTestStart} ed=${exportDefault}`);
}

const newBatchTest = [
  "// POST /api/accounts/batch-test - test Graph connection for many accounts",
  "// MUST be before /:id. Free-plan subrequest budget caps this at 40/request;",
  "// the UI chunks larger selections into multiple calls.",
  "accounts.post('/batch-test', async (c) => {",
  "  const body = (await c.req.json().catch(() => ({}))) as { ids?: number[] };",
  "  const ids = parsePositiveIds(body.ids);",
  "  if (!ids.length) return badRequest('请选择账号');",
  "",
  "  const MAX_BATCH_TEST = 40;",
  "  const capped = ids.slice(0, MAX_BATCH_TEST);",
  "  const skipped = ids.length - capped.length;",
  "",
  "  // Chunk SELECT in case caller sends exactly 40+; currently capped so one query is enough,",
  "  // but keep chunking for safety if MAX is raised later.",
  "  const accountRows: AccountRow[] = [];",
  "  for (const part of chunk(capped, D1_MAX_BOUND_PARAMS)) {",
  "    const rows = await query<AccountRow>(",
  "      c.env.DB,",
  "      `SELECT * FROM accounts WHERE id IN (${part.map(() => '?').join(',')})`,",
  "      part",
  "    );",
  "    accountRows.push(...rows);",
  "  }",
  "  const byId = new Map(accountRows.map((a) => [a.id, a]));",
  "",
  "  const results: { id: number; email: string; connected: boolean; error?: string }[] = [];",
  "  let success = 0;",
  "  let failed = 0;",
  "",
  "  for (const id of capped) {",
  "    const accRow = byId.get(id);",
  "    if (!accRow) {",
  "      results.push({ id, email: '', connected: false, error: '账号不存在' });",
  "      failed++;",
  "      continue;",
  "    }",
  "    const tokenResult = await getAccessToken(accRow.client_id, accRow.refresh_token);",
  "    const probe = await persistTokenProbe(c.env.DB, accRow, tokenResult);",
  "    if (probe.connected) {",
  "      results.push({ id, email: accRow.email, connected: true });",
  "      success++;",
  "    } else {",
  "      results.push({ id, email: accRow.email, connected: false, error: probe.error });",
  "      failed++;",
  "    }",
  "  }",
  "",
  "  const msg =",
  "    skipped > 0",
  "      ? `批量测试完成：成功 ${success}，失败 ${failed}，超出上限未测 ${skipped}`",
  "      : `批量测试完成：成功 ${success}，失败 ${failed}`;",
  "",
  "  return ok({ total: capped.length, success, failed, skipped, results }, msg);",
  "});",
  "",
  "",
].join(nl);

acc = acc.slice(0, btStart) + newBatchTest + acc.slice(getIdStart);

// Replace single test
const stStart2 = acc.indexOf("// POST /api/accounts/:id/test");
const ed2 = acc.indexOf("export default accounts");
const newSingleTest = [
  "// POST /api/accounts/:id/test - test Graph connection",
  "accounts.post('/:id/test', async (c) => {",
  "  const id = parseInt(c.req.param('id'), 10);",
  "  const accRow = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [id]);",
  "  if (!accRow) return notFound('账号不存在');",
  "",
  "  const tokenResult = await getAccessToken(accRow.client_id, accRow.refresh_token);",
  "  const probe = await persistTokenProbe(c.env.DB, accRow, tokenResult);",
  "",
  "  if (probe.connected) {",
  "    return ok({ connected: true }, 'Graph API 连接正常');",
  "  }",
  "  return ok({ connected: false, error: probe.error }, 'Graph API 连接失败');",
  "});",
  "",
  "export default accounts;",
  "",
].join(nl);

acc = acc.slice(0, stStart2) + newSingleTest;
fs.writeFileSync(accPath, acc, 'utf8');
console.log('accounts.ts written, has persistTokenProbe', acc.includes('persistTokenProbe'), 'delete_error', acc.includes("delete_error"));

// ========== app.js ==========
const appPath = 'public/assets/app.js';
let app = fs.readFileSync(appPath, 'utf8');
const anl = app.includes('\r\n') ? '\r\n' : '\n';

// Add withButtonBusy helper near api/toast if not present
if (!app.includes('async function withButtonBusy')) {
  const toastFn = app.indexOf('function toast(');
  if (toastFn < 0) throw new Error('toast not found');
  // insert before toast
  const helper = [
    '// Run an async action while a button shows a busy label; always restore on settle.',
    'async function withButtonBusy(btn, busyText, idleText, fn) {',
    '  if (btn) { btn.disabled = true; btn.textContent = busyText; }',
    '  try {',
    '    return await fn();',
    '  } finally {',
    '    if (btn) { btn.disabled = false; btn.textContent = idleText; }',
    '  }',
    '}',
    '',
    '',
  ].join(anl);
  app = app.slice(0, toastFn) + helper + app.slice(toastFn);
  console.log('withButtonBusy added');
}

// Replace exportAccounts empty check + selected helpers
const expStart = app.indexOf('async function exportAccounts(ids, opts)');
const expEnd = app.indexOf('function downloadExport', expStart);
if (expStart < 0 || expEnd < 0) throw new Error('export fn bounds');

const newExp = [
  'async function exportAccounts(ids, opts) {',
  '  const emailsOnly = !!(opts && opts.emailsOnly);',
  "  let url = '/accounts/export';",
  '  const params = [];',
  '  if (Array.isArray(ids) && ids.length) {',
  "    params.push('ids=' + ids.join(','));",
  '  } else {',
  "    const groupFilter = document.getElementById('accountGroupFilter')?.value;",
  "    if (groupFilter) params.push('group_id=' + groupFilter);",
  '  }',
  "  if (emailsOnly) params.push('emails_only=1');",
  "  if (params.length) url += '?' + params.join('&');",
  '  const res = await api(url);',
  '  if (!res?.success || !res.data || !res.data.count) {',
  "    toast(t('没有可导出的账号'), 'error');",
  '    return;',
  '  }',
  '',
  '  const title = emailsOnly',
  "    ? t('单导邮箱 ({n} 个)', { n: res.data.count })",
  "    : t('导出账号 ({n} 个)', { n: res.data.count });",
  '  const formatHint = emailsOnly',
  "    ? t('单导内容（每行一个邮箱）')",
  "    : t('导出内容（格式：邮箱----密码----client_id----refresh_token）');",
  "  const downloadName = emailsOnly ? 'emails' : 'accounts';",
  '  showModal(title, `',
  '    <div class="form-group">',
  '      <label class="form-label">${formatHint}</label>',
  "      <textarea class=\"form-textarea\" id=\"exportData\" rows=\"10\" readonly style=\"font-size:12px\">${esc(res.data.content || '')}</textarea>",
  '    </div>',
  '    <div style="display:flex;gap:8px">',
  "      <button class=\"btn btn-primary btn-sm\" type=\"button\" onclick=\"copyText(document.getElementById('exportData').value,this)\">${t('复制全部')}</button>",
  "      <button class=\"btn btn-sm\" type=\"button\" onclick=\"downloadExport('${downloadName}')\">${t('下载 TXT')}</button>",
  '    </div>',
  '  `, () => true);',
  '}',
  '',
  'function exportEmailsOnly() {',
  '  return exportAccounts(undefined, { emailsOnly: true });',
  '}',
  '',
  'function exportSelected(emailsOnly) {',
  '  const ids = [...selectedAccountIds];',
  "  if (!ids.length) { toast(t('请先选择账号'), 'error'); return; }",
  '  return exportAccounts(ids, emailsOnly ? { emailsOnly: true } : undefined);',
  '}',
  '',
  'function exportSelectedEmails() {',
  '  return exportSelected(true);',
  '}',
  '',
  '',
].join(anl);

app = app.slice(0, expStart) + newExp + app.slice(expEnd);
// Fix onclick exportSelected() still works - yes exportSelected() without args is full export of selection
console.log('export fns replaced');

// deleteErrorAccounts
const delStart = app.indexOf('async function deleteErrorAccounts');
const delEnd = app.indexOf('async function oneClickTestAccounts');
if (delStart < 0 || delEnd < 0) throw new Error('deleteError bounds');
const newDel = [
  'async function deleteErrorAccounts(btn) {',
  '  // Fresh list so counts match latest test results',
  '  await loadAccounts();',
  "  const errorCount = (state.accounts || []).filter(a => a.status === 'error').length;",
  "  if (!errorCount) { toast(t('没有状态为异常的账号')); return; }",
  '',
  "  if (!confirm(t('确认删除 {n} 个失效账号？此操作不可撤销。', { n: errorCount }))) return;",
  '',
  "  await withButtonBusy(btn, t('删除中...'), t('删除失效'), async () => {",
  "    const res = await api('/accounts/batch', {",
  "      method: 'POST',",
  "      body: JSON.stringify({ action: 'delete_error' }),",
  '    });',
  '    if (res?.success) {',
  "      toast(res.message || t('已删除 {n} 个失效账号', { n: res.data?.deleted ?? errorCount }));",
  '      clearSelection();',
  "      navigate('accounts');",
  '    } else {',
  "      toast(res?.error?.message || t('操作失败'), 'error');",
  '    }',
  '  });',
  '}',
  '',
  '',
].join(anl);
app = app.slice(0, delStart) + newDel + app.slice(delEnd);
console.log('deleteError replaced');

// batchTestAccounts + oneClick - with try/finally via withButtonBusy
const ocStart = app.indexOf('async function oneClickTestAccounts');
const filterMarker = app.indexOf('// Filter by status', ocStart);
if (ocStart < 0 || filterMarker < 0) throw new Error('test fns bounds');

const newTests = [
  'async function oneClickTestAccounts(btn) {',
  '  let ids = [...selectedAccountIds];',
  '  if (!ids.length) {',
  '    const list = (accountsView && accountsView.length) ? accountsView : (state.accounts || []);',
  '    ids = list.map(a => a.id).filter(id => Number.isInteger(id) && id > 0);',
  '  }',
  "  if (!ids.length) { toast(t('暂无账号可测试'), 'error'); return; }",
  '  await batchTestAccounts(btn, ids, true);',
  '}',
  '',
  '// Batch-test Graph connection. Server caps each request at 40 (CF free-tier',
  '// subrequest budget); larger selections are chunked client-side.',
  'async function batchTestAccounts(btn, explicitIds, isOneClick) {',
  '  const ids = explicitIds?.length ? [...explicitIds] : [...selectedAccountIds];',
  "  if (!ids.length) { toast(t('请先选择账号'), 'error'); return; }",
  '',
  "  const idleLabel = isOneClick ? t('一键测试') : t('批量测试');",
  "  await withButtonBusy(btn, t('测试中...'), idleLabel, async () => {",
  "    toast(t('正在批量测试 {n} 个账号...', { n: ids.length }));",
  '',
  '    const CHUNK = 40;',
  '    let success = 0, failed = 0;',
  '    const failedList = [];',
  '    const emailById = new Map((state.accounts || []).map(a => [a.id, a.email]));',
  '',
  '    for (let i = 0; i < ids.length; i += CHUNK) {',
  '      const part = ids.slice(i, i + CHUNK);',
  "      const res = await api('/accounts/batch-test', {",
  "        method: 'POST',",
  '        body: JSON.stringify({ ids: part }),',
  '      });',
  '      if (!res?.success) {',
  '        failed += part.length;',
  '        for (const id of part) {',
  "          failedList.push({ email: emailById.get(id) || ('#' + id), error: res?.error?.message || t('操作失败') });",
  '        }',
  '        continue;',
  '      }',
  '      success += res.data?.success || 0;',
  '      failed += res.data?.failed || 0;',
  '      for (const r of (res.data?.results || [])) {',
  "        if (!r.connected) failedList.push({ email: r.email || emailById.get(r.id) || ('#' + r.id), error: r.error || t('连接失败') });",
  '      }',
  '    }',
  '',
  "    const summary = t('批量测试完成：成功 {ok}，失败 {fail}', { ok: success, fail: failed });",
  '    if (failedList.length) {',
  '      const rows = failedList.slice(0, 30).map(f =>',
  "        `<tr><td style=\"padding:4px 8px;font-size:12.5px\">${esc(f.email)}</td>` +",
  "        `<td style=\"padding:4px 8px;font-size:12px;color:var(--danger);word-break:break-all\">${esc(f.error)}</td></tr>`",
  "      ).join('');",
  '      const more = failedList.length > 30',
  "        ? `<div style=\"font-size:12px;color:var(--text-dim);margin-top:8px\">${t('还有 {n} 个失败账号未列出', { n: failedList.length - 30 })}</div>`",
  "        : '';",
  '      showModal(summary, `',
  "        <div style=\"font-size:13px;margin-bottom:10px;color:var(--text-muted)\">${t('失败账号一览（状态已标为异常）')}</div>",
  '        <div class="table-wrap" style="max-height:320px;overflow:auto"><table>',
  "          <thead><tr><th>${t('邮箱')}</th><th>${t('错误')}</th></tr></thead>",
  '          <tbody>${rows}</tbody>',
  '        </table></div>${more}',
  '      `, async () => true);',
  '    } else {',
  '      toast(summary);',
  '    }',
  '',
  '    clearSelection();',
  "    navigate('accounts');",
  '  });',
  '}',
  '',
  '',
].join(anl);

app = app.slice(0, ocStart) + newTests + app.slice(filterMarker);
console.log('test fns replaced');

// testAccount try/finally
const taStart = app.indexOf('async function testAccount(id, btn)');
const taEnd = app.indexOf('async function toggleAccountStatus', taStart);
if (taStart >= 0 && taEnd > taStart) {
  const newTa = [
    'async function testAccount(id, btn) {',
    "  await withButtonBusy(btn, t('测试中...'), t('测试'), async () => {",
    "    const res = await api(`/accounts/${id}/test`, { method: 'POST' });",
    '    if (res?.success && res.data?.connected) {',
    "      toast(t('Graph API 连接正常'));",
    '    } else {',
    "      toast(res?.data?.error || res?.error?.message || t('连接失败'), 'error');",
    '    }',
    "    navigate('accounts');",
    '  });',
    '}',
    '',
    '',
  ].join(anl);
  app = app.slice(0, taStart) + newTa + app.slice(taEnd);
  console.log('testAccount replaced');
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('app.js written');

// i18n: ensure 没有状态为异常 already server-side message translated
const i18nPath = 'public/assets/i18n.js';
let i18n = fs.readFileSync(i18nPath, 'utf8');
if (!i18n.includes("'没有状态为异常的账号':") || true) {
  // add to SERVER_EN if missing
  if (!i18n.includes("'已删除") || true) {
    const se = i18n.indexOf('var SERVER_EN');
    // add pattern for 已删除 N 个失效账号 if missing
    if (!i18n.includes('个失效账号')) {
      const anchor = "[/^已停用 (\\d+) 个账号$/, 'Disabled $1 accounts'],";
      // try find in patterns
      const p = i18n.indexOf('[/^已停用');
      console.log('pattern 已停用 at', p);
    }
  }
}
// Add SERVER_EN exact + pattern for delete_error message
if (!i18n.includes('已删除 (\\d+) 个失效账号')) {
  const a = "  [/^已删除 (\\d+) 个账号$/, 'Deleted $1 accounts'],";
  if (i18n.includes(a)) {
    i18n = i18n.replace(a, a + '\n' + "  [/^已删除 (\\d+) 个失效账号$/, 'Deleted $1 invalid accounts'],");
    // fix newline
    i18n = i18n.replace(
      "  [/^已删除 (\\d+) 个账号$/, 'Deleted $1 accounts'],\n  [/^已删除 (\\d+) 个失效账号$/, 'Deleted $1 invalid accounts'],",
      "  [/^已删除 (\\d+) 个账号$/, 'Deleted $1 accounts']," + (i18n.includes('\r\n') ? '\r\n' : '\n') +
      "  [/^已删除 (\\d+) 个失效账号$/, 'Deleted $1 invalid accounts'],"
    );
    console.log('pattern invalid accounts added');
  } else {
    // find similar
    const i = i18n.indexOf('已删除');
    console.log('已删除 context', JSON.stringify(i18n.slice(i, i+120)));
  }
}
if (i18n.includes("'没有状态为异常的账号'") && !i18n.slice(i18n.indexOf('SERVER_EN')).includes("'没有状态为异常的账号': 'No accounts in error status'")) {
  // might only be in I18N_EN already
}
// Ensure SERVER_EN has the message for toast(res.message)
const serverBlock = i18n.indexOf('var SERVER_EN');
if (serverBlock >= 0 && !i18n.includes("'没有状态为异常的账号': 'No accounts in error status'")) {
  // already in I18N_EN from before - tServer uses SERVER_EN. Add there.
}
// Check I18N_EN has it
if (!i18n.includes("'没有状态为异常的账号'")) {
  console.log('WARN missing i18n key');
} else {
  console.log('i18n key present');
}

// Add to SERVER_EN near 账号不存在
if (!i18n.match(/SERVER_EN[\s\S]*没有状态为异常的账号/)) {
  const needle = "  '账号不存在': 'Account not found',";
  if (i18n.includes(needle)) {
    const inl = i18n.includes('\r\n') ? '\r\n' : '\n';
    i18n = i18n.replace(
      needle,
      needle + inl +
      "  '没有状态为异常的账号': 'No accounts in error status',"
    );
    console.log('SERVER_EN added 没有状态');
  }
}

fs.writeFileSync(i18nPath, i18n, 'utf8');

// Fix pattern add more carefully
{
  let i2 = fs.readFileSync(i18nPath, 'utf8');
  const inl = i2.includes('\r\n') ? '\r\n' : '\n';
  if (!i2.includes('[/^已删除 (\\d+) 个失效账号$/')) {
    const a = "[/^已删除 (\\d+) 个账号$/, 'Deleted $1 accounts'],";
    if (i2.includes(a)) {
      i2 = i2.replace(a, a + inl + "  [/^已删除 (\\d+) 个失效账号$/, 'Deleted $1 invalid accounts'],");
      fs.writeFileSync(i18nPath, i2, 'utf8');
      console.log('invalid delete pattern ok');
    }
  }
}

console.log('DONE');
