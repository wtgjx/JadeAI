/**
 * Feishu Base implementation of the resume repository.
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchUpdateRecords, batchDeleteRecords, getRecord, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { resumesFields, resumeSectionsFields } from './table-fields';

type ResumeSectionEntity = {
  id: string;
  resumeId: string;
  type: string;
  title: string;
  sortOrder: number;
  visible?: boolean;
  content?: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type ResumeEntity = {
  id: string;
  userId: string;
  title: string;
  template: string;
  themeConfig?: unknown;
  isDefault?: boolean;
  language: string;
  shareToken?: string | null;
  isPublic?: boolean;
  sharePassword?: string | null;
  viewCount?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  sections?: ResumeSectionEntity[];
};

export const feishuResumeRepository = {
  async findAllByUserId(userId: string): Promise<ResumeEntity[]> {
    const records = await searchAllRecords(tableId('resumes'), [{ field_name: 'user_id', operator: 'is', value: [userId] }], {
      sort: [{ field_name: 'updated_at', desc: true }],
    });
    return records.map((r) => recordToEntity<ResumeEntity>(r, resumesFields));
  },

  async findSectionsByResumeId(resumeId: string): Promise<ResumeSectionEntity[]> {
    const records = await searchAllRecords(tableId('resumeSections'), [{ field_name: 'resume_id', operator: 'is', value: [resumeId] }], {
      sort: [{ field_name: 'sort_order' }],
    });
    return records.map((r) => recordToEntity<ResumeSectionEntity>(r, resumeSectionsFields));
  },

  async findById(id: string): Promise<(ResumeEntity & { sections: ResumeSectionEntity[] }) | null> {
    const recordId = await findRecordIdByEntityId(tableId('resumes'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('resumes'), recordId);
    if (!record) return null;
    const resume = recordToEntity<ResumeEntity>(record, resumesFields);
    const sections = await this.findSectionsByResumeId(id);
    return { ...resume, sections };
  },

  async create(data: { userId: string; title?: string; template?: string; language?: string }): Promise<(ResumeEntity & { sections: ResumeSectionEntity[] }) | null> {
    const id = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('resumes'), [
      entityToFields(
        {
          id,
          userId: data.userId,
          title: data.title || '未命名简历',
          template: data.template || 'classic',
          language: data.language || 'zh',
          createdAt: now,
          updatedAt: now,
        },
        resumesFields,
      ),
    ]);
    return this.findById(id);
  },

  async update(id: string, data: Partial<{ title: string; template: string; themeConfig: unknown; language: string }>): Promise<(ResumeEntity & { sections: ResumeSectionEntity[] }) | null> {
    const recordId = await findRecordIdByEntityId(tableId('resumes'), id);
    if (!recordId) return null;
    const fields: Record<string, unknown> = { ...data, updatedAt: new Date() };
    await batchUpdateRecords(tableId('resumes'), [{ record_id: recordId, fields: entityToFields(fields, resumesFields) }]);
    return this.findById(id);
  },

  async delete(id: string) {
    // Sections first (child rows), then the resume itself.
    const sections = await searchAllRecords(tableId('resumeSections'), [{ field_name: 'resume_id', operator: 'is', value: [id] }]);
    if (sections.length > 0) {
      await batchDeleteRecords(tableId('resumeSections'), sections.map((r) => r.record_id));
    }
    const recordId = await findRecordIdByEntityId(tableId('resumes'), id);
    if (recordId) await batchDeleteRecords(tableId('resumes'), [recordId]);
  },

  async duplicate(id: string, userId: string, titleOverride?: string): Promise<(ResumeEntity & { sections: ResumeSectionEntity[] }) | null> {
    const original = await this.findById(id);
    if (!original) return null;

    const newId = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('resumes'), [
      entityToFields(
        {
          id: newId,
          userId,
          title: titleOverride ?? `${original.title} (副本)`,
          template: original.template,
          themeConfig: original.themeConfig,
          language: original.language,
          createdAt: now,
          updatedAt: now,
        },
        resumesFields,
      ),
    ]);

    for (const section of original.sections) {
      await batchCreateRecords(tableId('resumeSections'), [
        entityToFields(
          {
            id: crypto.randomUUID(),
            resumeId: newId,
            type: section.type,
            title: section.title,
            sortOrder: section.sortOrder,
            visible: section.visible,
            content: section.content,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          resumeSectionsFields,
        ),
      ]);
    }

    return this.findById(newId);
  },

  // Share operations
  async findByShareToken(token: string): Promise<(ResumeEntity & { sections: ResumeSectionEntity[] }) | null> {
    const page = await searchRecords(tableId('resumes'), [{ field_name: 'share_token', operator: 'is', value: [token] }], { pageSize: 1 });
    if (!page.items[0]) return null;
    const resume = recordToEntity<ResumeEntity>(page.items[0], resumesFields);
    const sections = await this.findSectionsByResumeId(resume.id);
    return { ...resume, sections };
  },

  async incrementViewCount(id: string) {
    const recordId = await findRecordIdByEntityId(tableId('resumes'), id);
    if (!recordId) return;
    const record = await getRecord(tableId('resumes'), recordId);
    if (!record) return;
    const current = recordToEntity<ResumeEntity>(record, resumesFields).viewCount ?? 0;
    await batchUpdateRecords(tableId('resumes'), [{ record_id: recordId, fields: entityToFields({ viewCount: Number(current) + 1 }, resumesFields) }]);
  },

  async updateShareSettings(id: string, settings: { isPublic?: boolean; shareToken?: string | null; sharePassword?: string | null }) {
    const recordId = await findRecordIdByEntityId(tableId('resumes'), id);
    if (!recordId) return;
    const fields: Record<string, unknown> = { ...settings, updatedAt: new Date() };
    await batchUpdateRecords(tableId('resumes'), [{ record_id: recordId, fields: entityToFields(fields, resumesFields) }]);
  },

  // Section operations
  async createSection(data: { id?: string; resumeId: string; type: string; title: string; sortOrder: number; visible?: boolean; content?: unknown }): Promise<ResumeSectionEntity | null> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('resumeSections'), [
      entityToFields(
        {
          id,
          resumeId: data.resumeId,
          type: data.type,
          title: data.title,
          sortOrder: data.sortOrder,
          visible: data.visible ?? true,
          content: data.content || {},
          createdAt: now,
          updatedAt: now,
        },
        resumeSectionsFields,
      ),
    ]);
    const recordId = await findRecordIdByEntityId(tableId('resumeSections'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('resumeSections'), recordId);
    return record ? recordToEntity<ResumeSectionEntity>(record, resumeSectionsFields) : null;
  },

  async updateSection(id: string, data: Partial<{ title: string; sortOrder: number; visible: boolean; content: unknown }>) {
    const recordId = await findRecordIdByEntityId(tableId('resumeSections'), id);
    if (!recordId) return;
    const fields: Record<string, unknown> = { ...data, updatedAt: new Date() };
    await batchUpdateRecords(tableId('resumeSections'), [{ record_id: recordId, fields: entityToFields(fields, resumeSectionsFields) }]);
  },

  async deleteSection(id: string) {
    const recordId = await findRecordIdByEntityId(tableId('resumeSections'), id);
    if (recordId) await batchDeleteRecords(tableId('resumeSections'), [recordId]);
  },

  async updateSectionOrder(sections: { id: string; sortOrder: number }[]) {
    for (const s of sections) {
      const recordId = await findRecordIdByEntityId(tableId('resumeSections'), s.id);
      if (!recordId) continue;
      await batchUpdateRecords(tableId('resumeSections'), [
        { record_id: recordId, fields: entityToFields({ sortOrder: s.sortOrder, updatedAt: new Date() }, resumeSectionsFields) },
      ]);
    }
  },
};
