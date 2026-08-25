/**
 * Feishu Base implementation of the interview repository.
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchUpdateRecords, batchDeleteRecords, getRecord, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { interviewSessionsFields, interviewRoundsFields, interviewMessagesFields, interviewReportsFields } from './table-fields';
import type {
  InterviewerConfig,
  InterviewSessionStatus,
  InterviewRoundStatus,
  InterviewMessageRole,
  RoundSummary,
  DimensionScore,
  RoundEvaluation,
  ImprovementItem,
  InterviewMessageMetadata,
  InterviewSession,
  InterviewRound,
  InterviewMessage,
  InterviewReport,
} from '@/types/interview';

// recordToEntity<T> requires T extends Record<string, unknown>; the shared
// interfaces above don't carry an index signature, so intersect them.
type SessionEntity = Record<string, unknown> & InterviewSession;
type RoundEntity = Record<string, unknown> & InterviewRound;
type MessageEntity = Record<string, unknown> & InterviewMessage;
type ReportEntity = Record<string, unknown> & InterviewReport;

export const feishuInterviewRepository = {
  // ── Sessions ────────────────────────────────────────────────────────────────

  async createSession(data: {
    userId: string;
    resumeId?: string | null;
    jobDescription: string;
    jobTitle: string;
    selectedInterviewers: InterviewerConfig[];
  }): Promise<InterviewSession | null> {
    const id = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('interviewSessions'), [
      entityToFields(
        {
          id,
          userId: data.userId,
          resumeId: data.resumeId ?? null,
          jobDescription: data.jobDescription,
          jobTitle: data.jobTitle,
          selectedInterviewers: data.selectedInterviewers,
          currentRound: 0,
          status: 'preparing',
          createdAt: now,
          updatedAt: now,
        },
        interviewSessionsFields,
      ),
    ]);
    return this.findSession(id);
  },

  async findSession(sessionId: string): Promise<InterviewSession | null> {
    const page = await searchRecords(tableId('interviewSessions'), [{ field_name: 'id', operator: 'is', value: [sessionId] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<SessionEntity>(page.items[0], interviewSessionsFields) : null;
  },

  async findSessionsByUserId(userId: string): Promise<InterviewSession[]> {
    const records = await searchAllRecords(tableId('interviewSessions'), [{ field_name: 'user_id', operator: 'is', value: [userId] }], {
      sort: [{ field_name: 'created_at', desc: true }],
    });
    return records.map((r) => recordToEntity<SessionEntity>(r, interviewSessionsFields));
  },

  async updateSessionStatus(sessionId: string, status: InterviewSessionStatus) {
    const recordId = await findRecordIdByEntityId(tableId('interviewSessions'), sessionId);
    if (!recordId) return;
    await batchUpdateRecords(tableId('interviewSessions'), [
      { record_id: recordId, fields: entityToFields({ status, updatedAt: new Date() }, interviewSessionsFields) },
    ]);
  },

  async updateSessionRound(sessionId: string, currentRound: number) {
    const recordId = await findRecordIdByEntityId(tableId('interviewSessions'), sessionId);
    if (!recordId) return;
    await batchUpdateRecords(tableId('interviewSessions'), [
      { record_id: recordId, fields: entityToFields({ currentRound, updatedAt: new Date() }, interviewSessionsFields) },
    ]);
  },

  async deleteSession(sessionId: string) {
    // Rounds' messages → rounds → reports → session.
    const rounds = await searchAllRecords(tableId('interviewRounds'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }]);
    for (const roundRecord of rounds) {
      const round = recordToEntity<{ id: string }>(roundRecord, interviewRoundsFields);
      const msgs = await searchAllRecords(tableId('interviewMessages'), [{ field_name: 'round_id', operator: 'is', value: [round.id] }]);
      if (msgs.length > 0) await batchDeleteRecords(tableId('interviewMessages'), msgs.map((m) => m.record_id));
    }
    if (rounds.length > 0) await batchDeleteRecords(tableId('interviewRounds'), rounds.map((r) => r.record_id));

    const reports = await searchAllRecords(tableId('interviewReports'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }]);
    if (reports.length > 0) await batchDeleteRecords(tableId('interviewReports'), reports.map((r) => r.record_id));

    const recordId = await findRecordIdByEntityId(tableId('interviewSessions'), sessionId);
    if (recordId) await batchDeleteRecords(tableId('interviewSessions'), [recordId]);
  },

  // ── Rounds ───────────────────────────────────────────────────────────────────

  async createRound(data: {
    sessionId: string;
    interviewerType: string;
    interviewerConfig: InterviewerConfig;
    sortOrder: number;
    maxQuestions?: number;
  }): Promise<InterviewRound | null> {
    const id = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('interviewRounds'), [
      entityToFields(
        {
          id,
          sessionId: data.sessionId,
          interviewerType: data.interviewerType,
          interviewerConfig: data.interviewerConfig,
          sortOrder: data.sortOrder,
          status: 'pending',
          questionCount: 0,
          maxQuestions: data.maxQuestions ?? 10,
          createdAt: now,
          updatedAt: now,
        },
        interviewRoundsFields,
      ),
    ]);
    return this.findRound(id);
  },

  async findRound(roundId: string): Promise<InterviewRound | null> {
    const page = await searchRecords(tableId('interviewRounds'), [{ field_name: 'id', operator: 'is', value: [roundId] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<RoundEntity>(page.items[0], interviewRoundsFields) : null;
  },

  async findRoundsBySessionId(sessionId: string): Promise<InterviewRound[]> {
    const records = await searchAllRecords(tableId('interviewRounds'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }], {
      sort: [{ field_name: 'sort_order' }],
    });
    return records.map((r) => recordToEntity<RoundEntity>(r, interviewRoundsFields));
  },

  async updateRoundStatus(roundId: string, status: InterviewRoundStatus) {
    const recordId = await findRecordIdByEntityId(tableId('interviewRounds'), roundId);
    if (!recordId) return;
    await batchUpdateRecords(tableId('interviewRounds'), [
      { record_id: recordId, fields: entityToFields({ status, updatedAt: new Date() }, interviewRoundsFields) },
    ]);
  },

  async incrementQuestionCount(roundId: string) {
    const recordId = await findRecordIdByEntityId(tableId('interviewRounds'), roundId);
    if (!recordId) return;
    const record = await getRecord(tableId('interviewRounds'), recordId);
    if (!record) return;
    const current = recordToEntity<RoundEntity>(record, interviewRoundsFields).questionCount ?? 0;
    await batchUpdateRecords(tableId('interviewRounds'), [
      { record_id: recordId, fields: entityToFields({ questionCount: Number(current) + 1, updatedAt: new Date() }, interviewRoundsFields) },
    ]);
  },

  async setRoundSummary(roundId: string, summary: RoundSummary) {
    const recordId = await findRecordIdByEntityId(tableId('interviewRounds'), roundId);
    if (!recordId) return;
    await batchUpdateRecords(tableId('interviewRounds'), [
      { record_id: recordId, fields: entityToFields({ summary, updatedAt: new Date() }, interviewRoundsFields) },
    ]);
  },

  // ── Messages ─────────────────────────────────────────────────────────────────

  async addMessage(data: {
    roundId: string;
    role: InterviewMessageRole;
    content: string;
    metadata?: InterviewMessageMetadata;
  }): Promise<InterviewMessage | null> {
    const id = crypto.randomUUID();
    await batchCreateRecords(tableId('interviewMessages'), [
      entityToFields(
        {
          id,
          roundId: data.roundId,
          role: data.role,
          content: data.content,
          metadata: data.metadata ?? {},
          createdAt: new Date(),
        },
        interviewMessagesFields,
      ),
    ]);
    const recordId = await findRecordIdByEntityId(tableId('interviewMessages'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('interviewMessages'), recordId);
    return record ? recordToEntity<MessageEntity>(record, interviewMessagesFields) : null;
  },

  async findMessagesByRoundId(roundId: string): Promise<InterviewMessage[]> {
    const records = await searchAllRecords(tableId('interviewMessages'), [{ field_name: 'round_id', operator: 'is', value: [roundId] }], {
      sort: [{ field_name: 'created_at' }],
    });
    return records.map((r) => recordToEntity<MessageEntity>(r, interviewMessagesFields));
  },

  async findAllMessagesBySessionId(sessionId: string) {
    const rounds = await this.findRoundsBySessionId(sessionId);
    if (rounds.length === 0) return [];
    const result = await Promise.all(
      rounds.map(async (round) => {
        const messages = await this.findMessagesByRoundId(round.id);
        return { round, messages };
      })
    );
    return result;
  },

  async updateMessageMetadata(messageId: string, metadata: InterviewMessageMetadata) {
    const recordId = await findRecordIdByEntityId(tableId('interviewMessages'), messageId);
    if (!recordId) return;
    await batchUpdateRecords(tableId('interviewMessages'), [{ record_id: recordId, fields: entityToFields({ metadata }, interviewMessagesFields) }]);
  },

  // ── Reports ──────────────────────────────────────────────────────────────────

  async createReport(data: {
    sessionId: string;
    overallScore: number;
    dimensionScores: DimensionScore[];
    roundEvaluations: RoundEvaluation[];
    overallFeedback: string;
    improvementPlan: ImprovementItem[];
  }): Promise<InterviewReport | null> {
    const id = crypto.randomUUID();
    await batchCreateRecords(tableId('interviewReports'), [
      entityToFields(
        {
          id,
          sessionId: data.sessionId,
          overallScore: data.overallScore,
          dimensionScores: data.dimensionScores,
          roundEvaluations: data.roundEvaluations,
          overallFeedback: data.overallFeedback,
          improvementPlan: data.improvementPlan,
          createdAt: new Date(),
        },
        interviewReportsFields,
      ),
    ]);
    return this.findReportBySessionId(data.sessionId);
  },

  async findReportBySessionId(sessionId: string): Promise<InterviewReport | null> {
    const page = await searchRecords(tableId('interviewReports'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<ReportEntity>(page.items[0], interviewReportsFields) : null;
  },

  async findReportsByUserId(userId: string) {
    const sessions = await searchAllRecords(tableId('interviewSessions'), [
      { field_name: 'user_id', operator: 'is', value: [userId] },
      { field_name: 'status', operator: 'is', value: ['completed'] },
    ]);
    if (sessions.length === 0) return [];
    const results = await Promise.all(
      sessions.map(async (record) => {
        const session = recordToEntity<SessionEntity>(record, interviewSessionsFields);
        const report = await this.findReportBySessionId(session.id);
        if (!report) return null;
        return { report, session };
      })
    );
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },
};
