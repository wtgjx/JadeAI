/**
 * Feishu Base implementation of the user repository.
 *
 * Entity ids (business UUIDs) live in the `id` cell and differ from Base's
 * internal record_id, so every update must first resolve the record_id via
 * findRecordIdByEntityId().
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchUpdateRecords, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { usersFields, resumesFields } from './table-fields';
import { resumeRepository } from '../../db/repositories/resume.repository';
import { createSampleResume } from '../../db/sample-resume';
import { LOCAL_USER_ID, LOCAL_USER_NAME } from '../../auth/local-user';

type UserEntity = {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  fingerprint: string | null;
  authType: 'oauth' | 'fingerprint' | 'local' | 'credentials';
  passwordHash: string | null;
  settings?: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * 单实例内存缓存：resolveUser() 每个 API 请求都会 findById，跨区 RTT ~400ms。
 * 多实例/多 lambda 间不共享，TTL 过期兜底，可接受短暂陈旧。
 */
const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, { entity: UserEntity; expiresAt: number }>();

export const feishuUserRepository = {
  async findById(id: string): Promise<UserEntity | null> {
    const cached = userCache.get(id);
    if (cached && cached.expiresAt > Date.now()) return cached.entity;
    const page = await searchRecords(tableId('users'), [{ field_name: 'id', operator: 'is', value: [id] }], { pageSize: 1 });
    const entity = page.items[0] ? recordToEntity<UserEntity>(page.items[0], usersFields) : null;
    if (entity) userCache.set(id, { entity, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    else userCache.delete(id);
    return entity;
  },

  async findByEmail(email: string): Promise<UserEntity | null> {
    const page = await searchRecords(tableId('users'), [{ field_name: 'email', operator: 'is', value: [email] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<UserEntity>(page.items[0], usersFields) : null;
  },

  async findByFingerprint(fingerprint: string): Promise<UserEntity | null> {
    const page = await searchRecords(tableId('users'), [{ field_name: 'fingerprint', operator: 'is', value: [fingerprint] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<UserEntity>(page.items[0], usersFields) : null;
  },

  async upsertByFingerprint(fingerprint: string): Promise<UserEntity | null> {
    const existing = await this.findByFingerprint(fingerprint);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('users'), [
      entityToFields(
        {
          id,
          fingerprint,
          authType: 'fingerprint',
          name: 'Anonymous User',
          createdAt: now,
          updatedAt: now,
        },
        usersFields,
      ),
    ]);

    // Clone demo user's resumes, or create a sample if seed hasn't run
    const demoUser = await this.findByFingerprint('demo-fingerprint');
    if (demoUser) {
      const demoResumes = await searchAllRecords(tableId('resumes'), [{ field_name: 'user_id', operator: 'is', value: [demoUser.id] }]);
      for (const r of demoResumes) {
        const resume = recordToEntity<{ id: string; title: string }>(r, resumesFields);
        await resumeRepository.duplicate(resume.id, id, resume.title);
      }
    } else {
      await createSampleResume(id);
    }

    return this.findById(id);
  },

  async ensureLocalUser(): Promise<UserEntity | null> {
    const existing = await this.findById(LOCAL_USER_ID);
    if (existing) return existing;

    // Simple "lookup then insert" — on a race the second insert would create a
    // duplicate row, so only seed the starter resume here when we actually
    // created the user.
    const now = new Date();
    await batchCreateRecords(tableId('users'), [
      entityToFields(
        {
          id: LOCAL_USER_ID,
          authType: 'local',
          name: LOCAL_USER_NAME,
          createdAt: now,
          updatedAt: now,
        },
        usersFields,
      ),
    ]);

    const created = await this.findById(LOCAL_USER_ID);
    if (!created) {
      throw new Error(`Failed to create the local user (id=${LOCAL_USER_ID})`);
    }

    // First run: give the user something to look at instead of an empty
    // dashboard. Deliberately non-fatal.
    try {
      await createSampleResume(LOCAL_USER_ID);
    } catch (e) {
      console.error('[db] failed to create the starter resume for the local user:', e);
    }

    return created;
  },

  async create(data: {
    id?: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
    authType: 'oauth' | 'fingerprint' | 'local' | 'credentials';
    fingerprint?: string;
    passwordHash?: string;
  }): Promise<UserEntity | null> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('users'), [
      entityToFields(
        {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        },
        usersFields,
      ),
    ]);
    const entity: UserEntity = {
      id,
      email: data.email ?? null,
      name: data.name ?? '',
      avatarUrl: data.avatarUrl ?? null,
      fingerprint: data.fingerprint ?? null,
      authType: data.authType,
      passwordHash: data.passwordHash ?? null,
      createdAt: now,
      updatedAt: now,
    };
    userCache.set(id, { entity, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    return entity;
  },

  async update(id: string, data: Partial<{ name: string; avatarUrl: string }>): Promise<UserEntity | null> {
    const recordId = await findRecordIdByEntityId(tableId('users'), id);
    if (!recordId) return null;
    const fields: Record<string, unknown> = { ...data, updatedAt: new Date() };
    await batchUpdateRecords(tableId('users'), [{ record_id: recordId, fields: entityToFields(fields, usersFields) }]);
    userCache.delete(id);
    return this.findById(id);
  },

  async getSettings(id: string): Promise<Record<string, unknown>> {
    const user = await this.findById(id);
    return (user?.settings || {}) as Record<string, unknown>;
  },

  async updateSettings(id: string, settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await this.getSettings(id);
    const merged = { ...current, ...settings };
    const recordId = await findRecordIdByEntityId(tableId('users'), id);
    if (!recordId) return merged;
    await batchUpdateRecords(tableId('users'), [
      { record_id: recordId, fields: entityToFields({ settings: merged, updatedAt: new Date() }, usersFields) },
    ]);
    userCache.delete(id);
    return merged;
  },
};
