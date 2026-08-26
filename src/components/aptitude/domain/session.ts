import type {
  AnswerLabel,
  CreateSessionOptions,
  PracticeSession,
  ProgressState,
  Question,
  QuestionBank,
  SectionId,
  SectionScore,
  SessionAnswer,
  SessionScore,
} from './types'

const DEFAULT_MOCK_COUNT = 60

function normalizeSeed(seed: string | number | undefined, startedAt: number): string {
  return seed === undefined ? String(startedAt) : String(seed)
}

/** FNV-1a followed by Mulberry32: small, stable and deterministic across browsers. */
function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffled<T>(items: readonly T[], seed: string): T[] {
  const result = [...items]
  const random = seededRandom(seed)
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const value = result[index]
    result[index] = result[target] as T
    result[target] = value as T
  }
  return result
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('count must be a positive finite number')
  }
  return Math.floor(value)
}

function eligibleQuestions(
  options: CreateSessionOptions,
  bank: QuestionBank,
  state: ProgressState,
): Question[] {
  switch (options.mode) {
    case 'full':
      return bank.questions
    case 'section':
      if (!options.section) {
        throw new Error('section mode requires a section')
      }
      return bank.questions.filter((question) => question.section === options.section)
    case 'mock':
      return options.section
        ? bank.questions.filter((question) => question.section === options.section)
        : bank.questions
    case 'wrong':
      return bank.questions.filter((question) => {
        const progress = state.questionProgress[question.id]
        return Boolean(progress && progress.incorrectCount > 0 && !progress.mastered)
      })
    case 'favorites': {
      const favoriteIds = new Set(state.favoriteQuestionIds)
      return bank.questions.filter((question) => favoriteIds.has(question.id))
    }
  }
}

function sessionId(
  mode: string,
  section: SectionId | undefined,
  seed: string,
  startedAt: number,
): string {
  return `${mode}:${section ?? 'all'}:${seed}:${startedAt}`
}

export function createSession(
  options: CreateSessionOptions,
  bank: QuestionBank,
  state: ProgressState,
): PracticeSession {
  const startedAt = options.startedAt ?? Date.now()
  const seed = normalizeSeed(options.seed, startedAt)
  const eligible = eligibleQuestions(options, bank, state)
  const fallbackCount =
    options.mode === 'mock'
      ? Math.min(DEFAULT_MOCK_COUNT, eligible.length)
      : eligible.length
  const count = Math.min(positiveInteger(options.count, fallbackCount), eligible.length)
  const timedMinutes =
    options.timedMinutes === undefined ? null : options.timedMinutes

  if (
    timedMinutes !== null &&
    (!Number.isFinite(timedMinutes) || timedMinutes <= 0)
  ) {
    throw new Error('timedMinutes must be a positive finite number')
  }

  return {
    id: sessionId(options.mode, options.section, seed, startedAt),
    mode: options.mode,
    section: options.section ?? null,
    seed,
    questionIds: shuffled(eligible, seed)
      .slice(0, count)
      .map((question) => question.id),
    currentIndex: 0,
    answers: {},
    startedAt,
    deadlineAt:
      timedMinutes === null ? null : startedAt + timedMinutes * 60_000,
    timedMinutes,
    completedAt: null,
  }
}

export function setSessionCurrentIndex(
  session: PracticeSession,
  currentIndex: number,
): PracticeSession {
  const lastIndex = Math.max(0, session.questionIds.length - 1)
  const safeIndex = Math.min(lastIndex, Math.max(0, Math.floor(currentIndex)))
  return { ...session, currentIndex: safeIndex }
}

export function recordSessionAnswer(
  session: PracticeSession,
  question: Question,
  selected: AnswerLabel,
  durationMs: number,
  answeredAt = Date.now(),
): PracticeSession {
  if (!session.questionIds.includes(question.id)) {
    throw new Error(`Question ${question.id} does not belong to session ${session.id}`)
  }
  const answer: SessionAnswer = {
    questionId: question.id,
    selected,
    correct: selected === question.answer,
    durationMs: Math.max(0, durationMs),
    answeredAt,
  }
  return {
    ...session,
    answers: { ...session.answers, [question.id]: answer },
  }
}

export function completeSession(
  session: PracticeSession,
  completedAt = Date.now(),
): PracticeSession {
  return { ...session, completedAt }
}

function ratio(correct: number, denominator: number): number {
  return denominator === 0 ? 0 : correct / denominator
}

export function scoreSession(
  session: PracticeSession,
  bank: QuestionBank,
): SessionScore {
  const byId = new Map(bank.questions.map((question) => [question.id, question]))
  const questionIds = session.questionIds.filter((id) => byId.has(id))
  const answers = questionIds
    .map((id) => session.answers[id])
    .filter((answer): answer is SessionAnswer => answer !== undefined)
  const correct = answers.filter((answer) => answer.correct).length
  const total = questionIds.length
  const answered = answers.length
  const grouped = new Map<SectionId, { total: number; answered: number; correct: number }>()

  for (const id of questionIds) {
    const question = byId.get(id)
    if (!question) continue
    const current = grouped.get(question.section) ?? {
      total: 0,
      answered: 0,
      correct: 0,
    }
    const answer = session.answers[id]
    current.total += 1
    current.answered += answer ? 1 : 0
    current.correct += answer?.correct ? 1 : 0
    grouped.set(question.section, current)
  }

  const sections: SectionScore[] = bank.sections
    .filter((section) => grouped.has(section.id))
    .map((section) => {
      const result = grouped.get(section.id) as {
        total: number
        answered: number
        correct: number
      }
      return {
        section: section.id,
        ...result,
        accuracy: ratio(result.correct, result.answered),
      }
    })

  return {
    total,
    answered,
    correct,
    incorrect: answered - correct,
    unanswered: total - answered,
    accuracy: ratio(correct, answered),
    score: Math.round(ratio(correct, total) * 100),
    durationMs: answers.reduce((sum, answer) => sum + answer.durationMs, 0),
    sections,
  }
}
