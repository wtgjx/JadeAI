/**
 * Feishu Base implementation of the analysis repository (JD analysis + grammar checks).
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchDeleteRecords, getRecord, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { jdAnalysesFields, grammarChecksFields } from './table-fields';

type JdAnalysisEntity = {
  id: string;
  resumeId: string;
  jobDescription: string;
  result: unknown;
  overallScore: number;
  atsScore: number;
  createdAt: Date | null;
};

type GrammarCheckEntity = {
  id: string;
  resumeId: string;
  result: unknown;
  score: number;
  issueCount: number;
  createdAt: Date | null;
};

export const feishuAnalysisRepository = {
  // ── JD Analysis ──────────────────────────────────────────

  async createJdAnalysis(data: {
    resumeId: string;
    jobDescription: string;
    result: unknown;
    overallScore: number;
    atsScore: number;
  }): Promise<JdAnalysisEntity | null> {
    const id = crypto.randomUUID();
    await batchCreateRecords(tableId('jdAnalyses'), [
      entityToFields(
        {
          id,
          resumeId: data.resumeId,
          jobDescription: data.jobDescription,
          result: data.result,
          overallScore: data.overallScore,
          atsScore: data.atsScore,
          createdAt: new Date(),
        },
        jdAnalysesFields,
      ),
    ]);
    const recordId = await findRecordIdByEntityId(tableId('jdAnalyses'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('jdAnalyses'), recordId);
    return record ? recordToEntity<JdAnalysisEntity>(record, jdAnalysesFields) : null;
  },

  async findJdAnalysesByResumeId(resumeId: string, limit = 20): Promise<JdAnalysisEntity[]> {
    const page = await searchRecords(tableId('jdAnalyses'), [{ field_name: 'resume_id', operator: 'is', value: [resumeId] }], {
      pageSize: limit,
      sort: [{ field_name: 'created_at', desc: true }],
    });
    return page.items.map((r) => recordToEntity<JdAnalysisEntity>(r, jdAnalysesFields));
  },

  async findJdAnalysisById(id: string): Promise<JdAnalysisEntity | null> {
    const page = await searchRecords(tableId('jdAnalyses'), [{ field_name: 'id', operator: 'is', value: [id] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<JdAnalysisEntity>(page.items[0], jdAnalysesFields) : null;
  },

  async deleteJdAnalysis(id: string) {
    const recordId = await findRecordIdByEntityId(tableId('jdAnalyses'), id);
    if (recordId) await batchDeleteRecords(tableId('jdAnalyses'), [recordId]);
  },

  // ── Grammar Check ────────────────────────────────────────

  async createGrammarCheck(data: {
    resumeId: string;
    result: unknown;
    score: number;
    issueCount: number;
  }): Promise<GrammarCheckEntity | null> {
    const id = crypto.randomUUID();
    await batchCreateRecords(tableId('grammarChecks'), [
      entityToFields(
        {
          id,
          resumeId: data.resumeId,
          result: data.result,
          score: data.score,
          issueCount: data.issueCount,
          createdAt: new Date(),
        },
        grammarChecksFields,
      ),
    ]);
    const recordId = await findRecordIdByEntityId(tableId('grammarChecks'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('grammarChecks'), recordId);
    return record ? recordToEntity<GrammarCheckEntity>(record, grammarChecksFields) : null;
  },

  async findGrammarChecksByResumeId(resumeId: string, limit = 20): Promise<GrammarCheckEntity[]> {
    const page = await searchRecords(tableId('grammarChecks'), [{ field_name: 'resume_id', operator: 'is', value: [resumeId] }], {
      pageSize: limit,
      sort: [{ field_name: 'created_at', desc: true }],
    });
    return page.items.map((r) => recordToEntity<GrammarCheckEntity>(r, grammarChecksFields));
  },

  async findGrammarCheckById(id: string): Promise<GrammarCheckEntity | null> {
    const page = await searchRecords(tableId('grammarChecks'), [{ field_name: 'id', operator: 'is', value: [id] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<GrammarCheckEntity>(page.items[0], grammarChecksFields) : null;
  },

  async deleteGrammarCheck(id: string) {
    const recordId = await findRecordIdByEntityId(tableId('grammarChecks'), id);
    if (recordId) await batchDeleteRecords(tableId('grammarChecks'), [recordId]);
  },
};
