/**
 * Minimal Feishu OpenAPI client for Base (多维表格) record CRUD.
 *
 * - tenant_access_token: fetched from the custom app credentials, cached for
 *   ~2h (refreshed 60s before expiry).
 * - Record operations mirror the bitable v1 OpenAPI:
 *   batch_create / batch_update / batch_delete / list / search.
 * - Rate-limit / concurrent-conflict responses are retried with backoff.
 */
import { FEISHU_BASE_TOKEN } from './tables';

const API_BASE = 'https://open.feishu.cn/open-apis';

/** Retryable codes: concurrency conflict / request throttled. */
const RETRYABLE_CODES = new Set([1254291, 1254292, 99991668, 111004, 99991400]);

interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

export class FeishuApiError extends Error {
  constructor(
    public code: number,
    public msg: string,
  ) {
    super(`Feishu API error ${code}: ${msg}`);
    this.name = 'FeishuApiError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTenantAccessToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET are required when DB_DRIVER=feishu');
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const res = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await res.json().catch(() => null)) as { code?: number; msg?: string; tenant_access_token?: string; expire?: number } | null;
  if (!data || data.code !== 0 || !data.tenant_access_token) {
    throw new FeishuApiError(data?.code ?? -1, data?.msg ?? 'tenant_access_token request failed');
  }
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire || 7200) * 1000,
  };
  return tokenCache.token;
}

async function request(
  path: string,
  init: RequestInit = {},
  env: NodeJS.ProcessEnv = process.env,
  retries = 3,
): Promise<any> {
  const token = await getTenantAccessToken(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new FeishuApiError(-1, 'request timeout');
    }
    throw new FeishuApiError(-1, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  clearTimeout(timer);
  const data = (await res.json().catch(() => null)) as { code?: number; msg?: string; data?: any } | null;
  if (!data) {
    throw new FeishuApiError(-1, `non-JSON response (HTTP ${res.status}) for ${path}`);
  }
  if (data.code !== 0) {
    const code = data.code ?? -1;
    if (RETRYABLE_CODES.has(code) && retries > 0) {
      await sleep(1500);
      return request(path, init, env, retries - 1);
    }
    throw new FeishuApiError(code, data.msg ?? 'unknown');
  }
  return data.data ?? {};
}

export function getBaseToken(env: NodeJS.ProcessEnv = process.env): string {
  if (!FEISHU_BASE_TOKEN) {
    throw new Error('FEISHU_BASE_TOKEN is required when DB_DRIVER=feishu');
  }
  return FEISHU_BASE_TOKEN;
}

// ── Record types ───────────────────────────────────────────────────────────────

export interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

export interface SearchCondition {
  field_name: string;
  operator: 'is' | 'isNot' | 'contains' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty' | 'isGreater' | 'isLess' | 'isGreaterEqual' | 'isLessEqual';
  value?: unknown[];
}

export interface SearchOptions {
  pageSize?: number;
  pageToken?: string;
  sort?: Array<{ field_name: string; desc?: boolean }>;
  fieldNames?: string[];
}

export interface PageResult {
  items: FeishuRecord[];
  hasMore: boolean;
  pageToken?: string;
  total?: number;
}

// ── List records (GET, supports simple filter formula) ─────────────────────────

export async function listRecords(
  tableId: string,
  opts: { pageSize?: number; pageToken?: string; filter?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<PageResult> {
  const params = new URLSearchParams();
  if (opts.pageSize) params.set('page_size', String(opts.pageSize));
  if (opts.pageToken) params.set('page_token', opts.pageToken);
  if (opts.filter) params.set('filter', opts.filter);
  const qs = params.toString();
  const data = await request(
    `/bitable/v1/apps/${getBaseToken(env)}/tables/${tableId}/records${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
    env,
  );
  return {
    items: (data.items ?? []) as FeishuRecord[],
    hasMore: Boolean(data.has_more),
    pageToken: data.page_token,
    total: data.total,
  };
}

// ── Search records (POST, JSON filter DSL, supports sort) ──────────────────────

export async function searchRecords(
  tableId: string,
  conditions: SearchCondition[],
  opts: SearchOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<PageResult> {
  const body: Record<string, unknown> = {
    filter: {
      conjunction: 'and',
      conditions,
    },
    page_size: opts.pageSize ?? 100,
  };
  if (opts.pageToken) body.page_token = opts.pageToken;
  if (opts.sort && opts.sort.length > 0) body.sort = opts.sort;
  if (opts.fieldNames && opts.fieldNames.length > 0) body.field_names = opts.fieldNames;

  const data = await request(
    `/bitable/v1/apps/${getBaseToken(env)}/tables/${tableId}/records/search`,
    { method: 'POST', body: JSON.stringify(body) },
    env,
  );
  return {
    items: (data.items ?? []) as FeishuRecord[],
    hasMore: Boolean(data.has_more),
    pageToken: data.page_token,
    total: data.total,
  };
}

/** Fetch every matching record, following page tokens. */
export async function searchAllRecords(
  tableId: string,
  conditions: SearchCondition[],
  opts: SearchOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<FeishuRecord[]> {
  const records: FeishuRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await searchRecords(tableId, conditions, { ...opts, pageToken, pageSize: 200 }, env);
    records.push(...page.items);
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken);
  return records;
}

// ── Record CRUD ────────────────────────────────────────────────────────────────

export async function batchCreateRecords(
  tableId: string,
  fieldsList: Array<Record<string, unknown>>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const data = await request(
    `/bitable/v1/apps/${getBaseToken(env)}/tables/${tableId}/records/batch_create`,
    { method: 'POST', body: JSON.stringify({ records: fieldsList.map((fields) => ({ fields })) }) },
    env,
  );
  return (data.records ?? []).map((r: any) => r.record_id);
}

export async function batchUpdateRecords(
  tableId: string,
  updates: Array<{ record_id: string; fields: Record<string, unknown> }>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await request(
    `/bitable/v1/apps/${getBaseToken(env)}/tables/${tableId}/records/batch_update`,
    { method: 'POST', body: JSON.stringify({ records: updates }) },
    env,
  );
}

export async function batchDeleteRecords(
  tableId: string,
  recordIds: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // 注意：飞书个人版/部分代理会丢弃 DELETE 请求体，导致记录 id 收不到而报
  // 1254043 RecordIdNotFound。batch_delete 端点同时接受 POST，故用 POST 保证兼容。
  await request(
    `/bitable/v1/apps/${getBaseToken(env)}/tables/${tableId}/records/batch_delete`,
    { method: 'POST', body: JSON.stringify({ records: recordIds }) },
    env,
  );
}

export async function getRecord(
  tableId: string,
  recordId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FeishuRecord | null> {
  const data = await request(
    `/bitable/v1/apps/${getBaseToken(env)}/tables/${tableId}/records/${recordId}`,
    { method: 'GET' },
    env,
  );
  return (data.record as FeishuRecord) ?? null;
}

/**
 * Resolve a record_id by the entity `id` field (our UUID lives in the `id`
 * cell, distinct from Base's internal record_id).
 */
export async function findRecordIdByEntityId(
  tableId: string,
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const page = await searchRecords(
    tableId,
    [{ field_name: 'id', operator: 'is', value: [id] }],
    { pageSize: 1 },
    env,
  );
  return page.items[0]?.record_id ?? null;
}
