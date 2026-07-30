import type { AccountRow } from './types';
import { run } from './db';
import { getAccessToken } from './graph';

type AccTokenFields = Pick<AccountRow, 'id' | 'client_id' | 'refresh_token' | 'status'>;

export interface EnsureTokenOptions {
  /**
   * When true, bump updated_at even if nothing else changed.
   * Used by cron so least-recently-touched accounts rotate fairly.
   */
  touch?: boolean;
}

/**
 * Resolve a Graph access token for an account and keep DB status/token in sync:
 * - failure → status=error
 * - success + rotated refresh_token → save new token, status=active
 * - success after error → status=active
 * - success + touch → bump updated_at (cron rotation)
 * Never auto-enables a deliberately disabled account.
 */
export async function ensureAccessToken(
  db: D1Database,
  acc: AccTokenFields,
  opts: EnsureTokenOptions = {}
): Promise<{ token?: string; error?: string }> {
  const result = await getAccessToken(acc.client_id, acc.refresh_token);

  if (!result.token) {
    await run(
      db,
      "UPDATE accounts SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [acc.id]
    );
    return { error: result.error?.message ?? 'Token acquisition failed' };
  }

  // Disabled accounts may still obtain a token but we never flip them to active.
  if (acc.status === 'disabled') {
    if (result.newRefreshToken && result.newRefreshToken !== acc.refresh_token) {
      await run(
        db,
        'UPDATE accounts SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [result.newRefreshToken, acc.id]
      );
    }
    return { token: result.token };
  }

  const rotated =
    result.newRefreshToken && result.newRefreshToken !== acc.refresh_token
      ? result.newRefreshToken
      : null;

  if (rotated) {
    await run(
      db,
      "UPDATE accounts SET refresh_token = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [rotated, acc.id]
    );
  } else if (acc.status === 'error') {
    await run(
      db,
      "UPDATE accounts SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [acc.id]
    );
  } else if (opts.touch) {
    await run(db, 'UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [acc.id]);
  }

  return { token: result.token };
}
