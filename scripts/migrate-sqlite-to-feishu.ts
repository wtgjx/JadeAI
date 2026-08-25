/**
 * 一次性数据迁移脚本：SQLite（data/jade.db）→ 飞书多维表格 Base。
 *
 * 运行（在项目根目录，Node ≥ 20.12）：
 *   pnpm tsx scripts/migrate-sqlite-to-feishu.ts
 *
 * 脚本启动时会自动加载项目根 .env（process.loadEnvFile，缺失/不支持时静默降级）。
 * 环境变量：
 *   FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BASE_TOKEN  飞书应用与多维表格凭据（必填）
 *   MIGRATE_EMAIL     迁移后账号邮箱（必填，兼作幂等键）
 *   MIGRATE_PASSWORD  迁移后账号登录密码（可选，默认 JadeAI@12345）
 *   MIGRATE_NAME      迁移后账号姓名（可选，默认沿用本地 '本机用户'，可写 吴明皓）
 *   SQLITE_PATH       本地 SQLite 路径（可选，默认 ./data/jade.db）
 *
 * 迁移范围：users / resumes / resume_sections / chat_sessions（本地有数据的表）；
 * 其余 12 张表本地为空，跳过。所有写入按 ≤200 条/批调用 batchCreateRecords。
 *
 * 幂等策略：
 *   - users：先按 MIGRATE_EMAIL 查飞书 users 表，已存在则沿用其 id 不重复创建；
 *     新用户 id 用 crypto.randomUUID()，且新 id 若在飞书已存在也沿用。
 *   - resumes / resume_sections / chat_sessions：先拉取飞书表内全部业务 id，
 *     已存在的行跳过（保留原业务 id）。
 *
 * 注意：本脚本对本地 SQLite 只读打开；示例简历通过 createSampleResume 生成
 * （与 ensureLocalUser 语义一致），该函数写入 src/lib/db 的单例连接
 * （默认即本地 SQLite），失败不阻断迁移。
 */
process.loadEnvFile?.('.env');

import Database from 'better-sqlite3';
import { hash as bcryptHash } from 'bcryptjs';
import path from 'node:path';
import type { FieldMap } from '../src/lib/feishu/repositories/mapping';
import type { batchCreateRecords, listRecords, searchRecords, findRecordIdByEntityId } from '../src/lib/feishu/client';
import type { tableId as tableIdFn, TableName } from '../src/lib/feishu/tables';

const BATCH_SIZE = 200;
const DEFAULT_PASSWORD = 'JadeAI@12345';

type Row = Record<string, any>;
type MigrateStats = { attempted: number; skipped: number; created: number; ms: number };

/** JSON 列值：可解析则交给 entityToFields 自动 stringify，否则保留原字符串。 */
function parseIfJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** camelCase → snake_case（与 feishu mapping 一致，用于推导 SQLite 表名）。 */
function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function logStats(label: string, s: MigrateStats) {
  console.log(`[${label}] attempted=${s.attempted} skipped=${s.skipped} created=${s.created} (${s.ms}ms)`);
}

/** 拉取飞书表内全部业务 id（id 单元格），用于幂等跳过。 */
async function listExistingEntityIds(
  listRecordsFn: typeof listRecords,
  feishuTableId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await listRecordsFn(feishuTableId, { pageSize: 200, pageToken });
    for (const rec of page.items ?? []) {
      const id = rec.fields?.id;
      if (id != null && id !== '') ids.add(String(id));
    }
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken);
  return ids;
}

/** 把实体列表按 ≤200 条/批写入飞书表，返回实际创建条数。 */
async function createEntitiesInBatches(
  entityToFieldsFn: (data: Record<string, unknown>, fieldMap: FieldMap) => Record<string, unknown>,
  batchCreate: typeof batchCreateRecords,
  feishuTableId: string,
  fieldMap: FieldMap,
  entities: Array<Record<string, unknown>>,
  label: string,
): Promise<number> {
  let created = 0;
  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const chunk = entities.slice(i, i + BATCH_SIZE);
    const fieldsList = chunk.map((e) => entityToFieldsFn(e, fieldMap));
    await batchCreate(feishuTableId, fieldsList);
    created += chunk.length;
    if (chunk.length > 1) {
      console.log(`    ${label}: batch ${Math.floor(i / BATCH_SIZE) + 1} +${chunk.length} 条`);
    }
  }
  return created;
}

type FeishuClient = {
  batchCreateRecords: typeof batchCreateRecords;
  searchRecords: typeof searchRecords;
  listRecords: typeof listRecords;
  findRecordIdByEntityId: typeof findRecordIdByEntityId;
};

/** 迁移 users：本地 'local' 用户 → 新账号（email/password/credentials）。 */
async function migrateUsers(
  sqlite: Database.Database,
  client: FeishuClient,
  tableId: typeof tableIdFn,
  usersFields: FieldMap,
  entityToFieldsFn: (data: Record<string, unknown>, fieldMap: FieldMap) => Record<string, unknown>,
  userIdMap: Map<string, string>,
): Promise<MigrateStats> {
  const rows = sqlite.prepare('SELECT * FROM users').all() as Row[];
  if (rows.length === 0) return { attempted: 0, skipped: 0, created: 0, ms: 0 };

  const email = process.env.MIGRATE_EMAIL!;
  const nameOverride = process.env.MIGRATE_NAME;
  const password = process.env.MIGRATE_PASSWORD || DEFAULT_PASSWORD;
  const start = Date.now();
  let created = 0;

  for (const row of rows) {
    // 幂等 1：飞书 users 表已存在相同 email → 沿用其 id，跳过创建
    const byEmail = await client.searchRecords(tableId('users'), [{ field_name: 'email', operator: 'is', value: [email] }], { pageSize: 1 });
    let targetId = byEmail.items[0]?.fields?.id as string | undefined;

    if (!targetId) {
      const candidateId = crypto.randomUUID();
      // 幂等 2：相同新 id 已存在 → 沿用该 id
      const existingRecordId = await client.findRecordIdByEntityId(tableId('users'), candidateId);
      targetId = candidateId;
      if (!existingRecordId) {
        const passwordHash = await bcryptHash(password, 10);
        await client.batchCreateRecords(tableId('users'), [
          entityToFieldsFn(
            {
              id: targetId,
              email,
              name: nameOverride || row.name || '本机用户',
              authType: 'credentials',
              passwordHash,
              settings: parseIfJson(row.settings),
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
            usersFields,
          ),
        ]);
        created += 1;
        console.log(`    [users] 新账号已创建 (email=${email}, id=${targetId})`);

        // 仅新创建时生成示例简历（与 ensureLocalUser 语义一致，失败不阻断）
        try {
          const { createSampleResume } = await import('../src/lib/db/sample-resume');
          await createSampleResume(targetId);
          console.log(`    [users] 已为新账号生成示例简历 (id=${targetId})`);
        } catch (e) {
          console.warn(`    [users] 示例简历生成失败（忽略）: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        console.log(`    [users] 新 id 已存在，沿用 (id=${targetId})`);
      }
    } else {
      console.log(`    [users] 飞书已存在相同 email，沿用 (id=${targetId})`);
    }

    userIdMap.set(String(row.id), targetId);
  }

  return { attempted: rows.length, skipped: rows.length - created, created, ms: Date.now() - start };
}

/** 通用表迁移：幂等（已存在的业务 id 跳过）＋ ≤200 条/批写入。 */
async function migrateTable(
  sqlite: Database.Database,
  client: FeishuClient,
  tableId: typeof tableIdFn,
  entityToFieldsFn: (data: Record<string, unknown>, fieldMap: FieldMap) => Record<string, unknown>,
  sourceTable: string,
  feishuTableName: TableName,
  fieldMap: FieldMap,
  buildEntity: (row: Row) => Record<string, unknown>,
  label: string,
): Promise<MigrateStats> {
  const rows = sqlite.prepare(`SELECT * FROM ${sourceTable}`).all() as Row[];
  if (rows.length === 0) return { attempted: 0, skipped: 0, created: 0, ms: 0 };

  const start = Date.now();
  const existingIds = await listExistingEntityIds(client.listRecords, tableId(feishuTableName));
  const entities: Array<Record<string, unknown>> = [];
  let skipped = 0;
  for (const row of rows) {
    if (existingIds.has(String(row.id))) {
      skipped += 1;
      continue;
    }
    entities.push(buildEntity(row));
  }
  const created =
    entities.length > 0
      ? await createEntitiesInBatches(entityToFieldsFn, client.batchCreateRecords, tableId(feishuTableName), fieldMap, entities, label)
      : 0;
  return { attempted: rows.length, skipped, created, ms: Date.now() - start };
}

async function main() {
  const overallStart = Date.now();
  console.log('=== JadeAI: SQLite → 飞书多维表格 迁移 ===');

  // ── 环境校验 ────────────────────────────────────────────────
  const migrateEmail = process.env.MIGRATE_EMAIL;
  if (!migrateEmail) {
    console.error('错误：缺少 MIGRATE_EMAIL（请在 .env 或 shell 中设置迁移目标账号邮箱）');
    process.exit(1);
  }
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET || !process.env.FEISHU_BASE_TOKEN) {
    console.error('错误：缺少飞书凭据（.env 需设置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BASE_TOKEN）');
    process.exit(1);
  }
  if (process.env.MIGRATE_PASSWORD) console.log('MIGRATE_PASSWORD: 使用自定义密码');
  if (process.env.MIGRATE_NAME) console.log(`MIGRATE_NAME: ${process.env.MIGRATE_NAME}`);

  // ── 打开本地 SQLite（只读） ─────────────────────────────────
  const sqlitePath = path.resolve(process.cwd(), process.env.SQLITE_PATH || './data/jade.db');
  console.log(`SQLite: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  // 动态 import：确保 .env 已加载后再读取模块级 FEISHU_BASE_TOKEN（tables.ts 在加载时捕获 env）
  const { tableId, FEISHU_TABLES } = await import('../src/lib/feishu/tables');
  const client = (await import('../src/lib/feishu/client')) as FeishuClient;
  const { usersFields, resumesFields, resumeSectionsFields, chatSessionsFields } = await import(
    '../src/lib/feishu/repositories/table-fields'
  );
  const { entityToFields } = await import('../src/lib/feishu/repositories/mapping');

  const userIdMap = new Map<string, string>();

  // ── 1. users ────────────────────────────────────────────────
  console.log('\n[users] 迁移中…');
  const usersStats = await migrateUsers(sqlite, client, tableId, usersFields, entityToFields, userIdMap);
  for (const [from, to] of userIdMap) console.log(`  userIdMap: ${from} -> ${to}`);
  logStats('users', usersStats);

  // ── 2. resumes（user_id 经 userIdMap 映射，保留原 id） ──────
  console.log('\n[resumes] 迁移中…');
  const resumesStats = await migrateTable(
    sqlite,
    client,
    tableId,
    entityToFields,
    'resumes',
    'resumes',
    resumesFields,
    (row) => ({
      id: row.id,
      userId: userIdMap.get(String(row.user_id)) ?? row.user_id,
      title: row.title,
      template: row.template,
      themeConfig: parseIfJson(row.theme_config),
      isDefault: row.is_default,
      language: row.language,
      shareToken: row.share_token,
      isPublic: row.is_public,
      sharePassword: row.share_password,
      viewCount: row.view_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    'resumes',
  );
  logStats('resumes', resumesStats);

  // ── 3. resume_sections（resume_id 保留原 uuid；content 可解析则 parse） ──
  console.log('\n[resume_sections] 迁移中…');
  const sectionsStats = await migrateTable(
    sqlite,
    client,
    tableId,
    entityToFields,
    'resume_sections',
    'resumeSections',
    resumeSectionsFields,
    (row) => ({
      id: row.id,
      resumeId: row.resume_id,
      type: row.type,
      title: row.title,
      sortOrder: row.sort_order,
      visible: row.visible,
      content: parseIfJson(row.content),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    'resume_sections',
  );
  logStats('resume_sections', sectionsStats);

  // ── 4. chat_sessions（resume_id 保留原 uuid） ───────────────
  console.log('\n[chat_sessions] 迁移中…');
  const sessionsStats = await migrateTable(
    sqlite,
    client,
    tableId,
    entityToFields,
    'chat_sessions',
    'chatSessions',
    chatSessionsFields,
    (row) => ({
      id: row.id,
      resumeId: row.resume_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    'chat_sessions',
  );
  logStats('chat_sessions', sessionsStats);

  // ── 其余表：本地为空则跳过 ───────────────────────────────────
  const migrated = new Set(['users', 'resumes', 'resumeSections', 'chatSessions']);
  const emptyTables: string[] = [];
  const hasDataNotMigrated: string[] = [];
  for (const key of Object.keys(FEISHU_TABLES)) {
    if (migrated.has(key)) continue;
    const source = toSnake(key);
    try {
      const n = (sqlite.prepare(`SELECT count(*) AS n FROM ${source}`).get() as { n: number }).n;
      if (n > 0) hasDataNotMigrated.push(`${key}(${source}:${n})`);
      else emptyTables.push(key);
    } catch {
      emptyTables.push(key);
    }
  }
  console.log('\n[其他表]');
  if (hasDataNotMigrated.length > 0) {
    console.warn(`  警告：以下表有数据但未定义迁移逻辑：${hasDataNotMigrated.join(', ')}`);
  }
  if (emptyTables.length > 0) {
    console.log(`  空表跳过（无数据不迁移）：${emptyTables.join(', ')}`);
  }

  sqlite.close();
  console.log(`\n=== 迁移完成，总耗时 ${Date.now() - overallStart}ms ===`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('迁移失败：', err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
