/**
 * Feishu Base implementation of the recruit repository.
 *
 * The Feishu Base API has no SQL joins: every aggregation below resolves the
 * relations record-by-record in JS (single-user scale, same as the SQLite
 * "aggregate in JS" approach).
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchUpdateRecords, batchDeleteRecords, getRecord, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { recruitJobsFields, recruitCandidatesFields, recruitEvaluationsFields } from './table-fields';
import type { CandidateStatRow } from '@/lib/recruit/job-stats';
import { countAnswered } from '@/lib/recruit/answers';
import { normalizeQuestions } from '@/lib/recruit/questions';
// 岗位和候选人 id 都进 URL，短 id 才念得出来；存量 UUID 继续可用
import { shortId } from '@/lib/recruit/short-id';
import type {
  CandidateStatus,
  CandidateSummary,
  DimensionConfig,
  DimensionScore,
  InterviewQuestion,
  QuestionEvaluation,
  Recommendation,
  RecruitJob,
  RecruitCandidate,
  RecruitEvaluation,
} from '@/types/recruit';

// recordToEntity<T> requires T extends Record<string, unknown>; the shared
// interfaces above don't carry an index signature, so intersect them.
type JobEntity = Record<string, unknown> & RecruitJob;
type CandidateEntity = Record<string, unknown> & RecruitCandidate;
type EvaluationEntity = Record<string, unknown> & RecruitEvaluation;

export const feishuRecruitRepository = {
  // ── Jobs ────────────────────────────────────────────────────────────────────

  async createJob(data: {
    userId: string;
    title: string;
    jobDescription: string;
    dimensions: DimensionConfig[];
    questionCount: number;
  }): Promise<RecruitJob | null> {
    const id = shortId();
    const now = new Date();
    await batchCreateRecords(tableId('recruitJobs'), [
      entityToFields(
        {
          id,
          userId: data.userId,
          title: data.title,
          jobDescription: data.jobDescription,
          dimensions: data.dimensions,
          questionCount: data.questionCount,
          createdAt: now,
          updatedAt: now,
        },
        recruitJobsFields,
      ),
    ]);
    return this.findJob(id);
  },

  async findJob(jobId: string): Promise<RecruitJob | null> {
    const page = await searchRecords(tableId('recruitJobs'), [{ field_name: 'id', operator: 'is', value: [jobId] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<JobEntity>(page.items[0], recruitJobsFields) : null;
  },

  async findJobsByUserId(userId: string): Promise<RecruitJob[]> {
    const records = await searchAllRecords(tableId('recruitJobs'), [{ field_name: 'user_id', operator: 'is', value: [userId] }], {
      sort: [{ field_name: 'created_at', desc: true }],
    });
    return records.map((r) => recordToEntity<JobEntity>(r, recruitJobsFields));
  },

  /**
   * 该用户名下所有候选人的「岗位 + 评价结论」明细，供岗位列表卡片统计用。
   * 飞书 Base 没有 join，逐个 job → candidate → evaluation 展开（单用户量级）。
   */
  async findCandidateStatsByUserId(userId: string): Promise<CandidateStatRow[]> {
    const jobs = await searchAllRecords(tableId('recruitJobs'), [{ field_name: 'user_id', operator: 'is', value: [userId] }]);
    const rows: CandidateStatRow[] = [];
    for (const jobRecord of jobs) {
      const job = recordToEntity<{ id: string }>(jobRecord, recruitJobsFields);
      const candidates = await searchAllRecords(tableId('recruitCandidates'), [{ field_name: 'job_id', operator: 'is', value: [job.id] }]);
      for (const candidateRecord of candidates) {
        const candidate = recordToEntity<{ id: string; status: CandidateStatus }>(candidateRecord, recruitCandidatesFields);
        const evalPage = await searchRecords(tableId('recruitEvaluations'), [{ field_name: 'candidate_id', operator: 'is', value: [candidate.id] }], { pageSize: 1 });
        const evaluation = evalPage.items[0]
          ? recordToEntity<{ recommendation: Recommendation }>(evalPage.items[0], recruitEvaluationsFields)
          : null;
        rows.push({
          jobId: job.id,
          status: candidate.status,
          recommendation: evaluation?.recommendation ?? null,
        });
      }
    }
    return rows;
  },

  async updateJob(
    jobId: string,
    data: Partial<{
      title: string;
      jobDescription: string;
      dimensions: DimensionConfig[];
      questionCount: number;
    }>,
  ): Promise<RecruitJob | null> {
    const recordId = await findRecordIdByEntityId(tableId('recruitJobs'), jobId);
    if (!recordId) return null;
    const fields: Record<string, unknown> = { ...data, updatedAt: new Date() };
    await batchUpdateRecords(tableId('recruitJobs'), [{ record_id: recordId, fields: entityToFields(fields, recruitJobsFields) }]);
    return this.findJob(jobId);
  },

  async deleteJob(jobId: string) {
    // Candidates' evaluations → candidates → job.
    const candidates = await searchAllRecords(tableId('recruitCandidates'), [{ field_name: 'job_id', operator: 'is', value: [jobId] }]);
    for (const candidateRecord of candidates) {
      const candidate = recordToEntity<{ id: string }>(candidateRecord, recruitCandidatesFields);
      const evaluations = await searchAllRecords(tableId('recruitEvaluations'), [{ field_name: 'candidate_id', operator: 'is', value: [candidate.id] }]);
      if (evaluations.length > 0) {
        await batchDeleteRecords(tableId('recruitEvaluations'), evaluations.map((r) => r.record_id));
      }
    }
    if (candidates.length > 0) {
      await batchDeleteRecords(tableId('recruitCandidates'), candidates.map((r) => r.record_id));
    }
    const recordId = await findRecordIdByEntityId(tableId('recruitJobs'), jobId);
    if (recordId) await batchDeleteRecords(tableId('recruitJobs'), [recordId]);
  },

  // ── Candidates ──────────────────────────────────────────────────────────────

  async createCandidate(data: { jobId: string; name: string }): Promise<RecruitCandidate | null> {
    const id = shortId();
    const now = new Date();
    await batchCreateRecords(tableId('recruitCandidates'), [
      entityToFields(
        {
          id,
          jobId: data.jobId,
          name: data.name,
          status: 'pending',
          resumeText: '',
          transcript: '',
          createdAt: now,
          updatedAt: now,
        },
        recruitCandidatesFields,
      ),
    ]);
    return this.findCandidate(id);
  },

  async findCandidate(candidateId: string): Promise<RecruitCandidate | null> {
    const page = await searchRecords(tableId('recruitCandidates'), [{ field_name: 'id', operator: 'is', value: [candidateId] }], { pageSize: 1 });
    const row = page.items[0];
    if (!row) return null;
    const candidate = recordToEntity<CandidateEntity>(row, recruitCandidatesFields);
    // 题目结构升级过（followUps 从字符串变成对象），库里还有老形状的数据。
    // 在这里统一兜一次，下游就不用各自防御。
    return { ...candidate, questions: normalizeQuestions(candidate.questions) } as unknown as RecruitCandidate;
  },

  async findCandidatesByJobId(jobId: string): Promise<RecruitCandidate[]> {
    const records = await searchAllRecords(tableId('recruitCandidates'), [{ field_name: 'job_id', operator: 'is', value: [jobId] }], {
      sort: [{ field_name: 'created_at', desc: true }],
    });
    return records.map((r) => recordToEntity<CandidateEntity>(r, recruitCandidatesFields));
  },

  /**
   * 岗位详情页的候选人列表：只取列表要显示的列，评价的大 JSON 不查出来。
   */
  async findCandidateSummaries(jobId: string): Promise<CandidateSummary[]> {
    const candidates = await searchAllRecords(tableId('recruitCandidates'), [{ field_name: 'job_id', operator: 'is', value: [jobId] }], {
      sort: [{ field_name: 'created_at', desc: true }],
    });
    const results: CandidateSummary[] = [];
    for (const record of candidates) {
      const candidate = recordToEntity<CandidateEntity>(record, recruitCandidatesFields);
      const evalPage = await searchRecords(tableId('recruitEvaluations'), [{ field_name: 'candidate_id', operator: 'is', value: [candidate.id] }], { pageSize: 1 });
      const evaluation = evalPage.items[0]
        ? recordToEntity<{ overallScore: number; recommendation: Recommendation }>(evalPage.items[0], recruitEvaluationsFields)
        : null;

      const questions = (candidate.questions ?? []) as InterviewQuestion[];
      results.push({
        id: candidate.id,
        name: candidate.name,
        status: candidate.status,
        createdAt: candidate.createdAt,
        // 只回传布尔和计数，简历正文和题目大 JSON 不进列表响应
        hasResume: Boolean((candidate.resumeText ?? '').trim()),
        questionCount: questions.length,
        answeredCount: countAnswered(questions),
        overallScore: evaluation?.overallScore ?? null,
        recommendation: evaluation?.recommendation ?? null,
      });
    }
    return results;
  },

  async updateCandidate(
    candidateId: string,
    data: Partial<{
      name: string;
      status: CandidateStatus;
      resumeText: string;
      resumeData: unknown;
      dimensionsOverride: DimensionConfig[] | null;
      questions: InterviewQuestion[] | null;
      transcript: string;
    }>,
  ): Promise<RecruitCandidate | null> {
    const recordId = await findRecordIdByEntityId(tableId('recruitCandidates'), candidateId);
    if (!recordId) return null;
    const fields: Record<string, unknown> = { ...data, updatedAt: new Date() };
    await batchUpdateRecords(tableId('recruitCandidates'), [{ record_id: recordId, fields: entityToFields(fields, recruitCandidatesFields) }]);
    return this.findCandidate(candidateId);
  },

  async deleteCandidate(candidateId: string) {
    const recordId = await findRecordIdByEntityId(tableId('recruitCandidates'), candidateId);
    if (recordId) await batchDeleteRecords(tableId('recruitCandidates'), [recordId]);
  },

  // ── Evaluations ─────────────────────────────────────────────────────────────

  async findEvaluation(candidateId: string): Promise<RecruitEvaluation | null> {
    const page = await searchRecords(tableId('recruitEvaluations'), [{ field_name: 'candidate_id', operator: 'is', value: [candidateId] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<EvaluationEntity>(page.items[0], recruitEvaluationsFields) : null;
  },

  /**
   * 一个候选人一份评价。重新生成时先删后插——candidate_id 上有 unique 约束，
   * 直接 insert 会撞约束。
   */
  async upsertEvaluation(data: {
    candidateId: string;
    overallScore: number;
    dimensionScores: DimensionScore[];
    questionEvaluations: QuestionEvaluation[];
    recommendation: Recommendation;
    recommendationReason: string;
    strengths: string[];
    concerns: string[];
    overallComment: string;
  }): Promise<RecruitEvaluation | null> {
    const oldRecords = await searchAllRecords(tableId('recruitEvaluations'), [{ field_name: 'candidate_id', operator: 'is', value: [data.candidateId] }]);
    if (oldRecords.length > 0) {
      await batchDeleteRecords(tableId('recruitEvaluations'), oldRecords.map((r) => r.record_id));
    }
    const id = shortId();
    await batchCreateRecords(tableId('recruitEvaluations'), [
      entityToFields(
        {
          id,
          candidateId: data.candidateId,
          overallScore: data.overallScore,
          dimensionScores: data.dimensionScores,
          questionEvaluations: data.questionEvaluations,
          recommendation: data.recommendation,
          recommendationReason: data.recommendationReason,
          strengths: data.strengths,
          concerns: data.concerns,
          overallComment: data.overallComment,
          createdAt: new Date(),
        },
        recruitEvaluationsFields,
      ),
    ]);
    return this.findEvaluation(data.candidateId);
  },
};
