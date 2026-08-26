import type {
  AnswerLabel,
  PracticeSession,
  ProgressState,
  Question,
  QuestionProgress,
  SessionSummary,
  StorageLike,
} from './types'

export const APP_STATE_STORAGE_KEY = 'campus-aptitude-practice:v1'
export const MASTERED_CORRECT_STREAK = 2

export function createEmptyProgressState(now = Date.now()): ProgressState {
  return {
    version: 1,
    questionProgress: {},
    favoriteQuestionIds: [],
    activeSession: null,
    completedSessions: [],
    updatedAt: now,
  }
}

/** A frozen template for initial React state; prefer createEmptyProgressState for writes. */
export const EMPTY_PROGRESS_STATE: Readonly<ProgressState> = Object.freeze(
  createEmptyProgressState(0),
)

function browserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined
  return window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPersistedState(value: unknown): value is ProgressState {
  if (!isRecord(value)) return false
  return (
    value.version === 1 &&
    isRecord(value.questionProgress) &&
    Array.isArray(value.favoriteQuestionIds) &&
    (value.activeSession === null || isRecord(value.activeSession)) &&
    Array.isArray(value.completedSessions) &&
    typeof value.updatedAt === 'number'
  )
}

export function loadAppState(
  storage: StorageLike | undefined = browserStorage(),
): ProgressState {
  if (!storage) return createEmptyProgressState()

  try {
    const raw = storage.getItem(APP_STATE_STORAGE_KEY)
    if (!raw) return createEmptyProgressState()
    const parsed: unknown = JSON.parse(raw)
    return isPersistedState(parsed) ? parsed : createEmptyProgressState()
  } catch {
    return createEmptyProgressState()
  }
}

export function saveAppState(
  state: ProgressState,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return
  storage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state))
}

function emptyQuestionProgress(questionId: string): QuestionProgress {
  return {
    questionId,
    attemptCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    correctStreak: 0,
    mastered: false,
    lastSelected: null,
    lastWasCorrect: null,
    lastAnsweredAt: null,
    totalDurationMs: 0,
  }
}

export function recordAttempt(
  state: ProgressState,
  question: Question,
  selected: AnswerLabel,
  durationMs: number,
  answeredAt = Date.now(),
): ProgressState {
  const previous =
    state.questionProgress[question.id] ?? emptyQuestionProgress(question.id)
  const correct = selected === question.answer
  const correctStreak = correct ? previous.correctStreak + 1 : 0
  const next: QuestionProgress = {
    ...previous,
    attemptCount: previous.attemptCount + 1,
    correctCount: previous.correctCount + (correct ? 1 : 0),
    incorrectCount: previous.incorrectCount + (correct ? 0 : 1),
    correctStreak,
    mastered: correctStreak >= MASTERED_CORRECT_STREAK,
    lastSelected: selected,
    lastWasCorrect: correct,
    lastAnsweredAt: answeredAt,
    totalDurationMs: previous.totalDurationMs + Math.max(0, durationMs),
  }

  return {
    ...state,
    questionProgress: { ...state.questionProgress, [question.id]: next },
    updatedAt: answeredAt,
  }
}

export function isQuestionMastered(
  state: ProgressState,
  questionId: string,
): boolean {
  return state.questionProgress[questionId]?.mastered ?? false
}

export function toggleFavorite(
  state: ProgressState,
  questionId: string,
  updatedAt = Date.now(),
): ProgressState {
  const favorites = new Set(state.favoriteQuestionIds)
  if (favorites.has(questionId)) favorites.delete(questionId)
  else favorites.add(questionId)

  return {
    ...state,
    favoriteQuestionIds: [...favorites],
    updatedAt,
  }
}

export function setActiveSession(
  state: ProgressState,
  session: PracticeSession | null,
  updatedAt = Date.now(),
): ProgressState {
  return { ...state, activeSession: session, updatedAt }
}

export function archiveCompletedSession(
  state: ProgressState,
  session: PracticeSession,
): ProgressState {
  if (session.completedAt === null) return state
  const summary: SessionSummary = {
    sessionId: session.id,
    mode: session.mode,
    section: session.section,
    questionCount: session.questionIds.length,
    answeredCount: Object.keys(session.answers).length,
    correctCount: Object.values(session.answers).filter((answer) => answer.correct)
      .length,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
  }
  return {
    ...state,
    activeSession: state.activeSession?.id === session.id ? null : state.activeSession,
    completedSessions: [
      summary,
      ...state.completedSessions.filter((item) => item.sessionId !== session.id),
    ],
    updatedAt: session.completedAt,
  }
}
