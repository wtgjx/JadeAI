/**
 * Feishu Base implementation of the resume-share repository.
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchUpdateRecords, batchDeleteRecords, getRecord, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { resumeSharesFields } from './table-fields';

type ResumeShareEntity = {
  id: string;
  resumeId: string;
  token: string;
  label: string;
  password?: string | null;
  viewCount?: number;
  isActive?: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export const feishuShareRepository = {
  async findByResumeId(resumeId: string): Promise<ResumeShareEntity[]> {
    const records = await searchAllRecords(tableId('resumeShares'), [{ field_name: 'resume_id', operator: 'is', value: [resumeId] }], {
      sort: [{ field_name: 'created_at', desc: true }],
    });
    return records.map((r) => recordToEntity<ResumeShareEntity>(r, resumeSharesFields));
  },

  async findByToken(token: string): Promise<ResumeShareEntity | null> {
    const page = await searchRecords(tableId('resumeShares'), [{ field_name: 'token', operator: 'is', value: [token] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<ResumeShareEntity>(page.items[0], resumeSharesFields) : null;
  },

  async findById(id: string): Promise<ResumeShareEntity | null> {
    const page = await searchRecords(tableId('resumeShares'), [{ field_name: 'id', operator: 'is', value: [id] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<ResumeShareEntity>(page.items[0], resumeSharesFields) : null;
  },

  async create(data: {
    resumeId: string;
    token: string;
    label?: string;
    password?: string | null;
  }): Promise<ResumeShareEntity | null> {
    const id = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('resumeShares'), [
      entityToFields(
        {
          id,
          resumeId: data.resumeId,
          token: data.token,
          label: data.label || '',
          password: data.password ?? null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        resumeSharesFields,
      ),
    ]);
    const recordId = await findRecordIdByEntityId(tableId('resumeShares'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('resumeShares'), recordId);
    return record ? recordToEntity<ResumeShareEntity>(record, resumeSharesFields) : null;
  },

  async update(id: string, data: {
    label?: string;
    password?: string | null;
    isActive?: boolean;
  }): Promise<ResumeShareEntity | null> {
    const recordId = await findRecordIdByEntityId(tableId('resumeShares'), id);
    if (!recordId) return null;

    const setClause: Record<string, unknown> = { updatedAt: new Date() };
    if (data.label !== undefined) setClause.label = data.label;
    if (data.password !== undefined) setClause.password = data.password;
    if (data.isActive !== undefined) setClause.isActive = data.isActive;

    await batchUpdateRecords(tableId('resumeShares'), [{ record_id: recordId, fields: entityToFields(setClause, resumeSharesFields) }]);
    return this.findById(id);
  },

  async delete(id: string) {
    const recordId = await findRecordIdByEntityId(tableId('resumeShares'), id);
    if (recordId) await batchDeleteRecords(tableId('resumeShares'), [recordId]);
  },

  async incrementViewCount(id: string) {
    const share = await this.findById(id);
    if (!share) return;
    const recordId = await findRecordIdByEntityId(tableId('resumeShares'), id);
    if (!recordId) return;
    await batchUpdateRecords(tableId('resumeShares'), [
      { record_id: recordId, fields: entityToFields({ viewCount: Number(share.viewCount ?? 0) + 1 }, resumeSharesFields) },
    ]);
  },
};
