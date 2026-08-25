/**
 * Convert between Feishu Base records (fields keyed by snake_case column names)
 * and the camelCase entities the repositories expose.
 *
 * Base cell values: text -> string, number -> number, null -> null.
 * SQLite/PG modes that need conversion:
 *   - JSON columns (settings, content, result, metadata, ...)  stringify/parse
 *   - timestamp columns (createdAt, updatedAt, expiresAt)      epoch seconds -> Date
 *   - boolean columns (isDefault, isPublic, visible, isActive) 0/1 -> boolean
 */
export interface FieldSpec {
  json?: boolean;
  date?: boolean;
  bool?: boolean;
}

export type FieldMap = Record<string, FieldSpec>;

function toCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null || v === '') return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as unknown as T;
    }
  }
  return v as T;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v * 1000);
  if (typeof v === 'string') {
    const n = Number(v);
    return new Date(Number.isFinite(n) ? n * 1000 : v);
  }
  return null;
}

function toBool(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  return Number(v) !== 0;
}

function toCell(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * 飞书 records/search 接口对「文本」字段返回富文本段数组而非纯字符串：
 *   [{ text: '...', type: 'text' }]  （list 接口返回纯字符串）
 * 这里统一归一化为拼接后的纯字符串，保证与 entity 类型（string）一致。
 * 仅当数组元素全部是含 text 字符串的对象时才归一化，避免误伤真正的多值字段。
 */
function normalizeFeishuCell(v: unknown): unknown {
  if (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((seg) => seg !== null && typeof seg === 'object' && typeof (seg as { text?: unknown }).text === 'string')
  ) {
    return v.map((seg) => (seg as { text: string }).text).join('');
  }
  return v;
}

/** Convert a Base record into an entity (camelCase keys). */
export function recordToEntity<T extends Record<string, unknown>>(
  record: { record_id: string; fields: Record<string, unknown> },
  fieldMap: FieldMap,
): T {
  const entity: Record<string, unknown> = {};
  for (const [column, rawValue] of Object.entries(record.fields)) {
    const spec = fieldMap[column];
    const key = toCamel(column);
    const value = normalizeFeishuCell(rawValue);
    if (spec?.json) entity[key] = parseJson(value, undefined);
    else if (spec?.date) entity[key] = toDate(value);
    else if (spec?.bool) entity[key] = toBool(value);
    else entity[key] = value;
  }
  return entity as T;
}

/** Convert a partial entity (camelCase keys) into Base cell values (snake_case). */
export function entityToFields(
  data: Record<string, unknown>,
  fieldMap: FieldMap,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const column = toSnake(key);
    const spec = fieldMap[column];
    fields[column] = toCell(value);
  }
  return fields;
}
