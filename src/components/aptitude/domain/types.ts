export type SectionId = 'verbal' | 'data-analysis' | 'figural'

export type AnswerLabel = 'A' | 'B' | 'C' | 'D' | 'E'

export type KnownQualityFlag =
  | 'empty_explanation'
  | 'source_has_three_options'
  | 'duplicate_prompt'
  | 'source_answer_analysis_conflict'
  | 'empty_prompt'
  | 'missing_options'
  | 'answer_option_missing'
  | 'missing_figure'
  | 'possible_explanation_leak'

export interface QuestionOption {
  label: AnswerLabel
  text: string
}

export interface QuestionAsset {
  src: string
  alt: string
  sourcePage: number
  bbox: [number, number, number, number]
}

export interface Question {
  id: string
  section: SectionId
  sectionIndex: number
  originalNumber: number | null
  sourcePageStart: number | null
  sourcePageEnd: number | null
  prompt: string
  options: QuestionOption[]
  answer: AnswerLabel
  explanation: string
  assets: QuestionAsset[]
  visualOptions: boolean
  /** Flags are source-audit evidence. Consumers must display, not rewrite, them. */
  qualityFlags: KnownQualityFlag[]
  reviewStatus: 'source-preserved' | 'needs-review'
  /** Present only when the extraction audit found an identical source prompt. */
  duplicateOf?: string
}

export interface QuestionBankSection {
  id: SectionId
  name: string
  count: number
}

export interface QuestionBankMeta {
  title: string
  sourceLabel: string
  sourceFile: string
  sourceSha256: string
  sourcePages: number
  generatedBy: string
  questionCount: number
  assetPlacementsFound: number
  assetReferences: number
  sectionCounts: Record<SectionId, number>
  qualityFlagCounts: Partial<Record<KnownQualityFlag, number>>
  needsReviewCount: number
  orphanFragmentCount: number
  sourceNote: string
}

export interface QuestionBankAuditFragment {
  page: number | null
  text: string
}

export interface QuestionBankAudit {
  orphanFragments: QuestionBankAuditFragment[]
  encounteredImagePlacements: number
  attachedUniqueImageReferences: number
}

export interface QuestionBank {
  meta: QuestionBankMeta
  sections: QuestionBankSection[]
  questions: Question[]
  audit: QuestionBankAudit
}

export type PracticeMode =
  | 'full'
  | 'section'
  | 'mock'
  | 'wrong'
  | 'favorites'

export interface SessionAnswer {
  questionId: string
  selected: AnswerLabel
  correct: boolean
  durationMs: number
  answeredAt: number
}

export interface PracticeSession {
  id: string
  mode: PracticeMode
  section: SectionId | null
  seed: string
  questionIds: string[]
  currentIndex: number
  answers: Record<string, SessionAnswer>
  startedAt: number
  deadlineAt: number | null
  timedMinutes: number | null
  completedAt: number | null
}

export interface CreateSessionOptions {
  mode: PracticeMode
  section?: SectionId
  count?: number
  timedMinutes?: number
  seed?: string | number
  /** Primarily useful for restoring/testing deadline-based sessions. */
  startedAt?: number
}

export interface QuestionProgress {
  questionId: string
  attemptCount: number
  correctCount: number
  incorrectCount: number
  correctStreak: number
  mastered: boolean
  lastSelected: AnswerLabel | null
  lastWasCorrect: boolean | null
  lastAnsweredAt: number | null
  totalDurationMs: number
}

export interface SessionSummary {
  sessionId: string
  mode: PracticeMode
  section: SectionId | null
  questionCount: number
  answeredCount: number
  correctCount: number
  startedAt: number
  completedAt: number
}

export interface ProgressState {
  version: 1
  questionProgress: Record<string, QuestionProgress>
  favoriteQuestionIds: string[]
  activeSession: PracticeSession | null
  completedSessions: SessionSummary[]
  updatedAt: number
}

export interface SectionScore {
  section: SectionId
  total: number
  answered: number
  correct: number
  accuracy: number
}

export interface SessionScore {
  total: number
  answered: number
  correct: number
  incorrect: number
  unanswered: number
  accuracy: number
  score: number
  durationMs: number
  sections: SectionScore[]
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
