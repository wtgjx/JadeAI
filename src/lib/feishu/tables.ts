/**
 * Feishu Base (多维表格) coordinates for the JadeAI data store.
 *
 * One Base, 16 tables mirroring the SQLite/PG schema. Field names inside each
 * table match the DB column names (snake_case), so the mapping layer can
 * convert between Base records and drizzle-style entities mechanically.
 */
export const FEISHU_BASE_TOKEN = (process.env.FEISHU_BASE_TOKEN ?? '').trim();

export const FEISHU_TABLES = {
  users: 'tbldT6NE1uhH9y2g',
  authAccounts: 'tblQwINvLNkNzqRr',
  resumes: 'tbloqhC7Nvi4CwJD',
  resumeSections: 'tblCKQbmH9DWTT3D',
  chatSessions: 'tblGxvV8eyGfXHux',
  chatMessages: 'tblHKoObJ9ZheHYc',
  resumeShares: 'tbl69D1bqSnYhbhr',
  jdAnalyses: 'tbl6ofuxJlJi3RHO',
  grammarChecks: 'tblXvIakP1aEaTjW',
  interviewSessions: 'tblDaMNgiKI5KXYH',
  interviewRounds: 'tblZCDqxMrbprLrJ',
  interviewMessages: 'tbl3IevhJPerZ31V',
  interviewReports: 'tblPY7y1MENa27HK',
  recruitJobs: 'tblCmwqLdfVJ89cO',
  recruitCandidates: 'tblG6oIBj9remRnd',
  recruitEvaluations: 'tbl5EIs4MR4i3KVS',
} as const;

export type TableName = keyof typeof FEISHU_TABLES;

export function tableId(name: TableName): string {
  return FEISHU_TABLES[name];
}
