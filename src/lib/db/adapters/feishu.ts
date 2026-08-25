import type { DatabaseAdapter } from '../adapter';

/**
 * Feishu Base adapter. Repositories do not touch `db` in feishu mode (they
 * delegate to src/lib/feishu/repositories), so this is a thin placeholder that
 * satisfies the DatabaseAdapter contract: initialize() has no migrations and
 * close() has nothing to release.
 */
export class FeishuAdapter implements DatabaseAdapter {
  db: any = null;

  async initialize(): Promise<void> {
    // No schema migration needed; the Base tables are provisioned out-of-band.
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}
