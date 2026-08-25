/**
 * Feishu Base implementation of the chat repository.
 *
 * Pagination: cursor is an ISO timestamp; created_at cells are Date entities.
 * The Feishu search API does not support a "less than cursor" filter in JS
 * reliably here, so we fetch pageSize=limit+1 sorted desc and filter by cursor
 * in JS (matching the SQLite behaviour of reading at most limit+1 rows).
 */
import { searchRecords, searchAllRecords, batchCreateRecords, batchUpdateRecords, batchDeleteRecords, getRecord, findRecordIdByEntityId } from '../client';
import { tableId } from '../tables';
import { recordToEntity, entityToFields } from './mapping';
import { chatSessionsFields, chatMessagesFields } from './table-fields';

type ChatMessageEntity = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: unknown;
  createdAt: Date | null;
};

type ChatSessionEntity = {
  id: string;
  resumeId: string;
  title: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  messages?: ChatMessageEntity[];
};

export const feishuChatRepository = {
  async findSessionsByResumeId(resumeId: string): Promise<ChatSessionEntity[]> {
    const records = await searchAllRecords(tableId('chatSessions'), [{ field_name: 'resume_id', operator: 'is', value: [resumeId] }], {
      sort: [{ field_name: 'updated_at', desc: true }],
    });
    return records.map((r) => recordToEntity<ChatSessionEntity>(r, chatSessionsFields));
  },

  async findSession(sessionId: string): Promise<ChatSessionEntity | null> {
    const page = await searchRecords(tableId('chatSessions'), [{ field_name: 'id', operator: 'is', value: [sessionId] }], { pageSize: 1 });
    return page.items[0] ? recordToEntity<ChatSessionEntity>(page.items[0], chatSessionsFields) : null;
  },

  async findPaginatedMessages(sessionId: string, opts: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const fetchCount = limit + 1;

    const page = await searchRecords(tableId('chatMessages'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }], {
      pageSize: fetchCount,
      sort: [{ field_name: 'created_at', desc: true }],
    });
    let rows = page.items.map((r) => recordToEntity<ChatMessageEntity>(r, chatMessagesFields));

    if (opts.cursor) {
      const cursorDate = new Date(opts.cursor).getTime();
      rows = rows.filter((r) => {
        const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt as unknown as number).getTime();
        return t < cursorDate;
      });
    }

    const hasMore = rows.length > limit;
    if (hasMore) rows = rows.slice(0, limit);

    // Reverse to ASC order for display
    rows.reverse();

    const nextCursor = hasMore && rows.length > 0
      ? (rows[0].createdAt instanceof Date ? rows[0].createdAt.toISOString() : new Date(rows[0].createdAt as unknown as number).toISOString())
      : undefined;

    return { messages: rows, hasMore, nextCursor };
  },

  async findSessionWithMessages(sessionId: string): Promise<(ChatSessionEntity & { messages: ChatMessageEntity[] }) | null> {
    const session = await this.findSession(sessionId);
    if (!session) return null;
    const records = await searchAllRecords(tableId('chatMessages'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }], {
      sort: [{ field_name: 'created_at' }],
    });
    return { ...session, messages: records.map((r) => recordToEntity<ChatMessageEntity>(r, chatMessagesFields)) };
  },

  async createSession(data: { resumeId: string; title?: string }): Promise<(ChatSessionEntity & { messages: ChatMessageEntity[] }) | null> {
    const id = crypto.randomUUID();
    const now = new Date();
    await batchCreateRecords(tableId('chatSessions'), [
      entityToFields(
        {
          id,
          resumeId: data.resumeId,
          title: data.title || '新对话',
          createdAt: now,
          updatedAt: now,
        },
        chatSessionsFields,
      ),
    ]);
    return this.findSessionWithMessages(id);
  },

  async addMessage(data: { sessionId: string; role: 'user' | 'assistant' | 'system'; content: string; metadata?: unknown }): Promise<ChatMessageEntity | null> {
    const id = crypto.randomUUID();
    await batchCreateRecords(tableId('chatMessages'), [
      entityToFields(
        {
          id,
          sessionId: data.sessionId,
          role: data.role,
          content: data.content,
          metadata: data.metadata || {},
          createdAt: new Date(),
        },
        chatMessagesFields,
      ),
    ]);

    const sessionRecordId = await findRecordIdByEntityId(tableId('chatSessions'), data.sessionId);
    if (sessionRecordId) {
      await batchUpdateRecords(tableId('chatSessions'), [{ record_id: sessionRecordId, fields: entityToFields({ updatedAt: new Date() }, chatSessionsFields) }]);
    }

    const recordId = await findRecordIdByEntityId(tableId('chatMessages'), id);
    if (!recordId) return null;
    const record = await getRecord(tableId('chatMessages'), recordId);
    return record ? recordToEntity<ChatMessageEntity>(record, chatMessagesFields) : null;
  },

  async updateSessionTitle(sessionId: string, title: string) {
    const recordId = await findRecordIdByEntityId(tableId('chatSessions'), sessionId);
    if (!recordId) return;
    await batchUpdateRecords(tableId('chatSessions'), [{ record_id: recordId, fields: entityToFields({ title }, chatSessionsFields) }]);
  },

  async deleteSession(sessionId: string) {
    // Messages first (child rows), then the session itself.
    const messages = await searchAllRecords(tableId('chatMessages'), [{ field_name: 'session_id', operator: 'is', value: [sessionId] }]);
    if (messages.length > 0) {
      await batchDeleteRecords(tableId('chatMessages'), messages.map((r) => r.record_id));
    }
    const recordId = await findRecordIdByEntityId(tableId('chatSessions'), sessionId);
    if (recordId) await batchDeleteRecords(tableId('chatSessions'), [recordId]);
  },
};
