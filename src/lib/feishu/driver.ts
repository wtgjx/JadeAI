/**
 * Driver switch: `DB_DRIVER=feishu` routes all repositories to the Feishu Base
 * data source. Desktop builds always stay on SQLite (local single user).
 */
export function isFeishuDriver(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.JADE_RUNTIME === 'desktop') return false;
  return env.DB_DRIVER === 'feishu';
}
