/**
 * Per-table field specs describing which Base columns hold JSON / timestamps /
 * booleans so the mapping layer converts them into the entity shapes the rest
 * of the app expects (mirrors drizzle modes in src/lib/db/schema*.ts).
 */
import type { FieldMap } from './mapping';

export const usersFields: FieldMap = {
  id: {},
  email: {},
  name: {},
  avatar_url: {},
  fingerprint: {},
  auth_type: {},
  password_hash: {},
  settings: { json: true },
  created_at: { date: true },
  updated_at: { date: true },
};

export const authAccountsFields: FieldMap = {
  id: {},
  user_id: {},
  provider: {},
  provider_account_id: {},
  access_token: {},
  refresh_token: {},
  token_type: {},
  expires_at: { date: true },
  scope: {},
  created_at: { date: true },
};

export const resumesFields: FieldMap = {
  id: {},
  user_id: {},
  title: {},
  template: {},
  theme_config: { json: true },
  is_default: { bool: true },
  language: {},
  share_token: {},
  is_public: { bool: true },
  share_password: {},
  view_count: {},
  created_at: { date: true },
  updated_at: { date: true },
};

export const resumeSectionsFields: FieldMap = {
  id: {},
  resume_id: {},
  type: {},
  title: {},
  sort_order: {},
  visible: { bool: true },
  content: { json: true },
  created_at: { date: true },
  updated_at: { date: true },
};

export const chatSessionsFields: FieldMap = {
  id: {},
  resume_id: {},
  title: {},
  created_at: { date: true },
  updated_at: { date: true },
};

export const chatMessagesFields: FieldMap = {
  id: {},
  session_id: {},
  role: {},
  content: {},
  metadata: { json: true },
  created_at: { date: true },
};

export const resumeSharesFields: FieldMap = {
  id: {},
  resume_id: {},
  token: {},
  label: {},
  password: {},
  view_count: {},
  is_active: { bool: true },
  created_at: { date: true },
  updated_at: { date: true },
};

export const jdAnalysesFields: FieldMap = {
  id: {},
  resume_id: {},
  job_description: {},
  result: { json: true },
  overall_score: {},
  ats_score: {},
  created_at: { date: true },
};

export const grammarChecksFields: FieldMap = {
  id: {},
  resume_id: {},
  result: { json: true },
  score: {},
  issue_count: {},
  created_at: { date: true },
};

export const interviewSessionsFields: FieldMap = {
  id: {},
  user_id: {},
  resume_id: {},
  job_description: {},
  job_title: {},
  selected_interviewers: { json: true },
  current_round: {},
  status: {},
  created_at: { date: true },
  updated_at: { date: true },
};

export const interviewRoundsFields: FieldMap = {
  id: {},
  session_id: {},
  interviewer_type: {},
  interviewer_config: { json: true },
  sort_order: {},
  status: {},
  question_count: {},
  max_questions: {},
  summary: { json: true },
  created_at: { date: true },
  updated_at: { date: true },
};

export const interviewMessagesFields: FieldMap = {
  id: {},
  round_id: {},
  role: {},
  content: {},
  metadata: { json: true },
  created_at: { date: true },
};

export const interviewReportsFields: FieldMap = {
  id: {},
  session_id: {},
  overall_score: {},
  dimension_scores: { json: true },
  round_evaluations: { json: true },
  overall_feedback: {},
  improvement_plan: { json: true },
  created_at: { date: true },
};

export const recruitJobsFields: FieldMap = {
  id: {},
  user_id: {},
  title: {},
  job_description: {},
  dimensions: { json: true },
  question_count: {},
  created_at: { date: true },
  updated_at: { date: true },
};

export const recruitCandidatesFields: FieldMap = {
  id: {},
  job_id: {},
  name: {},
  status: {},
  resume_text: {},
  resume_data: { json: true },
  dimensions_override: { json: true },
  questions: { json: true },
  transcript: {},
  created_at: { date: true },
  updated_at: { date: true },
};

export const recruitEvaluationsFields: FieldMap = {
  id: {},
  candidate_id: {},
  overall_score: {},
  dimension_scores: { json: true },
  question_evaluations: { json: true },
  recommendation: {},
  recommendation_reason: {},
  strengths: { json: true },
  concerns: { json: true },
  overall_comment: {},
  created_at: { date: true },
};
