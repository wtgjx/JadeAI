'use client';

import {
  ArrowCounterClockwise,
  ArrowRight,
  BookOpen,
  Brain,
  CaretLeft,
  CaretRight,
  ChartBar,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  Heart,
  House,
  ImageSquare,
  Info,
  ListNumbers,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Moon,
  Star,
  Sun,
  Target,
  Timer,
  UploadSimple,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import questionBankJson from './question-bank.json'
import {
  archiveCompletedSession,
  completeSession,
  createSession,
  loadAppState,
  recordAttempt,
  recordSessionAnswer,
  saveAppState,
  scoreSession,
  setActiveSession,
  setSessionCurrentIndex,
  toggleFavorite,
} from './domain'
import type {
  AnswerLabel,
  CreateSessionOptions,
  PracticeSession,
  ProgressState,
  Question,
  QuestionBank,
  SectionId,
} from './domain'

const BANK = questionBankJson as unknown as QuestionBank
const QUESTION_BY_ID = new Map(
  BANK.questions.map((question) => [question.id, question]),
)

const SECTION_META: Record<
  SectionId,
  { label: string; description: string; icon: typeof BookOpen }
> = {
  verbal: {
    label: '言语理解',
    description: '主旨、细节、推断与词语辨析，训练快速定位表达重点。',
    icon: BookOpen,
  },
  'data-analysis': {
    label: '资料分析',
    description: '表格、图表与材料计算，兼顾读取速度和运算准确率。',
    icon: ChartBar,
  },
  figural: {
    label: '图形推理',
    description: '在旋转、叠加、数量和空间关系中建立识别直觉。',
    icon: ImageSquare,
  },
}

const MODE_LABELS: Record<PracticeSession['mode'], string> = {
  full: '题库通关',
  section: '分区练习',
  mock: '计时模拟',
  wrong: '错题强化',
  favorites: '收藏练习',
}

type View = 'home' | 'quiz' | 'result' | 'library'
type Theme = 'light' | 'dark'
type LibraryStatus = 'all' | 'unseen' | 'wrong' | 'mastered' | 'favorite'

interface SetupState {
  mode: 'section' | 'mock'
  section: SectionId | 'all'
  count: number
  timedMinutes: number
  order: 'sequential' | 'random'
}

interface ProgressBackup {
  kind: 'campus-aptitude-practice-backup'
  version: 1
  exportedAt: string
  sourceSha256: string
  state: ProgressState
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function isProgressState(value: unknown): value is ProgressState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ProgressState>
  return (
    candidate.version === 1 &&
    Boolean(candidate.questionProgress) &&
    Array.isArray(candidate.favoriteQuestionIds) &&
    Array.isArray(candidate.completedSessions) &&
    typeof candidate.updatedAt === 'number'
  )
}

function qualityMessage(question: Question): string | null {
  if (question.qualityFlags.includes('source_answer_analysis_conflict')) {
    return '题库原答案与解析表述疑似冲突，已保留原文，请结合源 PDF 复核。'
  }
  if (question.qualityFlags.includes('empty_prompt')) {
    return '这道题的文字题干在源文件中为空，请根据题图作答。'
  }
  if (question.qualityFlags.includes('duplicate_prompt')) {
    return '抽取审计发现相同题干记录，本题仍按源文件独立保留。'
  }
  if (question.reviewStatus === 'needs-review') {
    return '这道题存在源文件质量标记，答案用于练习参考，不代表人工校准结论。'
  }
  return null
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('campus-aptitude-practice:theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  })
  const [state, setState] = useState<ProgressState>(() => loadAppState())
  const [view, setView] = useState<View>('home')
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [resultSession, setResultSession] = useState<PracticeSession | null>(null)
  const [draftSelection, setDraftSelection] = useState<AnswerLabel | null>(null)
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())
  const [lightboxAsset, setLightboxAsset] = useState<Question['assets'][number] | null>(null)
  const [lightboxScale, setLightboxScale] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [librarySection, setLibrarySection] = useState<SectionId | 'all'>('all')
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>('all')
  const [libraryPage, setLibraryPage] = useState(1)
  const importInputRef = useRef<HTMLInputElement>(null)

  const session = state.activeSession
  const currentQuestion = session
    ? QUESTION_BY_ID.get(session.questionIds[session.currentIndex]) ?? null
    : null

  useEffect(() => {
    saveAppState(state)
  }, [state])

  useEffect(() => {
    window.localStorage.setItem('campus-aptitude-practice:theme', theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (view !== 'quiz') return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [view])

  useEffect(() => {
    if (!session || !currentQuestion) return
    setDraftSelection(session.answers[currentQuestion.id]?.selected ?? null)
    setQuestionStartedAt(Date.now())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [session?.id, session?.currentIndex, currentQuestion])

  const finishSession = useCallback((rawSession: PracticeSession) => {
    if (rawSession.completedAt !== null) return
    const completed = completeSession(rawSession)
    setState((previous) => {
      let next = previous
      if (rawSession.mode === 'mock') {
        for (const answer of Object.values(rawSession.answers)) {
          const question = QUESTION_BY_ID.get(answer.questionId)
          if (question) {
            next = recordAttempt(
              next,
              question,
              answer.selected,
              answer.durationMs,
              answer.answeredAt,
            )
          }
        }
      }
      return archiveCompletedSession(next, completed)
    })
    setResultSession(completed)
    setView('result')
    setAnnouncement('本轮训练已完成，已进入结果页。')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (
      view === 'quiz' &&
      session?.deadlineAt !== null &&
      session?.deadlineAt !== undefined &&
      now >= session.deadlineAt
    ) {
      finishSession(session)
    }
  }, [finishSession, now, session, view])

  const sectionStats = useMemo(() => {
    return BANK.sections.map((section) => {
      const questions = BANK.questions.filter(
        (question) => question.section === section.id,
      )
      const progress = questions
        .map((question) => state.questionProgress[question.id])
        .filter((item) => item !== undefined)
      const completed = progress.filter((item) => item.attemptCount > 0).length
      const attempts = progress.reduce((sum, item) => sum + item.attemptCount, 0)
      const correct = progress.reduce((sum, item) => sum + item.correctCount, 0)
      return {
        ...section,
        completed,
        completion: completed / section.count,
        accuracy: attempts === 0 ? 0 : correct / attempts,
      }
    })
  }, [state.questionProgress])

  const wrongCount = useMemo(
    () =>
      Object.values(state.questionProgress).filter(
        (item) => item.incorrectCount > 0 && !item.mastered,
      ).length,
    [state.questionProgress],
  )

  const masteredCount = useMemo(
    () =>
      Object.values(state.questionProgress).filter((item) => item.mastered).length,
    [state.questionProgress],
  )

  const startSession = useCallback(
    (
      options: CreateSessionOptions,
      order: 'sequential' | 'random' = 'random',
      forcedQuestionIds?: string[],
    ) => {
      let nextSession = createSession(options, BANK, state)
      if (forcedQuestionIds) {
        nextSession = { ...nextSession, questionIds: forcedQuestionIds }
      } else if (order === 'sequential') {
        const eligible = BANK.questions.filter((question) => {
          if (options.mode === 'full') return true
          if (options.mode === 'section') return question.section === options.section
          return nextSession.questionIds.includes(question.id)
        })
        const limit = options.count ?? eligible.length
        nextSession = {
          ...nextSession,
          questionIds: eligible.slice(0, limit).map((question) => question.id),
        }
      }

      if (nextSession.questionIds.length === 0) {
        setToast(
          options.mode === 'wrong'
            ? '目前没有未掌握错题，先完成几组练习吧。'
            : '目前没有可练习的收藏题。',
        )
        return
      }

      setState((previous) => setActiveSession(previous, nextSession))
      setResultSession(null)
      setView('quiz')
      setNow(Date.now())
      setAnnouncement(`已开始${MODE_LABELS[nextSession.mode]}。`)
      window.scrollTo({ top: 0 })
    },
    [state],
  )

  const startFull = () => {
    startSession({ mode: 'full', count: BANK.questions.length }, 'sequential')
  }

  const resumeSession = () => {
    if (!session) return
    setResultSession(null)
    setView('quiz')
  }

  const startFromSetup = () => {
    if (!setup) return
    const section = setup.section === 'all' ? undefined : setup.section
    startSession(
      {
        mode: setup.mode,
        section,
        count: setup.count,
        timedMinutes: setup.mode === 'mock' ? setup.timedMinutes : undefined,
      },
      setup.mode === 'mock' ? 'random' : setup.order,
    )
    setSetup(null)
  }

  const startSingleQuestion = (questionId: string) => {
    const question = QUESTION_BY_ID.get(questionId)
    if (!question) return
    startSession(
      { mode: 'section', section: question.section, count: 1 },
      'sequential',
      [questionId],
    )
  }

  const changeQuestion = (targetIndex: number) => {
    if (!session) return
    const nextSession = setSessionCurrentIndex(session, targetIndex)
    setState((previous) => setActiveSession(previous, nextSession))
  }

  const handleOption = useCallback(
    (label: AnswerLabel) => {
      if (!session || !currentQuestion) return
      const existing = session.answers[currentQuestion.id]
      if (session.mode !== 'mock' && existing) return
      setDraftSelection(label)

      if (session.mode === 'mock') {
        const answeredAt = Date.now()
        const nextSession = recordSessionAnswer(
          session,
          currentQuestion,
          label,
          answeredAt - questionStartedAt,
          answeredAt,
        )
        setState((previous) => setActiveSession(previous, nextSession, answeredAt))
        setAnnouncement(`已选择 ${label}。`)
      }
    },
    [currentQuestion, questionStartedAt, session],
  )

  const submitPracticeAnswer = useCallback(() => {
    if (!session || !currentQuestion) return
    if (session.answers[currentQuestion.id]) {
      if (session.currentIndex === session.questionIds.length - 1) {
        finishSession(session)
      } else {
        changeQuestion(session.currentIndex + 1)
      }
      return
    }
    if (!draftSelection) {
      setToast('先选择一个答案，再提交。')
      return
    }

    const answeredAt = Date.now()
    const durationMs = answeredAt - questionStartedAt
    const nextSession = recordSessionAnswer(
      session,
      currentQuestion,
      draftSelection,
      durationMs,
      answeredAt,
    )
    setState((previous) => {
      const withAttempt = recordAttempt(
        previous,
        currentQuestion,
        draftSelection,
        durationMs,
        answeredAt,
      )
      return setActiveSession(withAttempt, nextSession, answeredAt)
    })
    setAnnouncement(
      draftSelection === currentQuestion.answer
        ? '回答正确。'
        : `回答错误，正确答案是 ${currentQuestion.answer}。`,
    )
  }, [currentQuestion, draftSelection, finishSession, questionStartedAt, session])

  const handlePrimaryQuizAction = useCallback(() => {
    if (!session) return
    if (session.mode !== 'mock') {
      submitPracticeAnswer()
      return
    }
    if (session.currentIndex === session.questionIds.length - 1) {
      finishSession(session)
    } else {
      changeQuestion(session.currentIndex + 1)
    }
  }, [finishSession, session, submitPracticeAnswer])

  const handleFavorite = useCallback(() => {
    if (!currentQuestion) return
    const wasFavorite = state.favoriteQuestionIds.includes(currentQuestion.id)
    setState((previous) => toggleFavorite(previous, currentQuestion.id))
    setToast(wasFavorite ? '已取消收藏。' : '已加入收藏。')
  }, [currentQuestion, state.favoriteQuestionIds])

  useEffect(() => {
    if (view !== 'quiz' || !currentQuestion) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const normalized = event.key.toUpperCase()
      const numericLabels: Record<string, AnswerLabel> = {
        '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
      }
      const label = normalized in numericLabels
        ? numericLabels[normalized]
        : (normalized as AnswerLabel)
      if (
        ['A', 'B', 'C', 'D', 'E'].includes(label) &&
        currentQuestion.options.some((option) => option.label === label)
      ) {
        event.preventDefault()
        handleOption(label)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        handlePrimaryQuizAction()
      } else if (normalized === 'F') {
        event.preventDefault()
        handleFavorite()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentQuestion, handleFavorite, handleOption, handlePrimaryQuizAction, view])

  const exportProgress = () => {
    const backup: ProgressBackup = {
      kind: 'campus-aptitude-practice-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceSha256: BANK.meta.sourceSha256,
      state,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `行测训练进度-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setToast('进度备份已导出。')
  }

  const importProgress = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const backup = parsed as Partial<ProgressBackup>
      if (
        backup.kind !== 'campus-aptitude-practice-backup' ||
        backup.version !== 1 ||
        !isProgressState(backup.state)
      ) throw new Error('invalid backup')
      const validQuestionIds = new Set(BANK.questions.map((question) => question.id))
      if (
        backup.state.activeSession?.questionIds.some(
          (questionId) => !validQuestionIds.has(questionId),
        )
      ) throw new Error('question bank mismatch')
      setState(backup.state)
      setResultSession(null)
      setView('home')
      setToast(
        backup.sourceSha256 === BANK.meta.sourceSha256
          ? '进度备份已恢复。'
          : '进度已恢复，但备份来自另一个题库版本。',
      )
    } catch {
      setToast('无法导入：文件不是有效的训练进度备份。')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const libraryQuestions = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase('zh-CN')
    return BANK.questions.filter((question) => {
      if (librarySection !== 'all' && question.section !== librarySection) return false
      const progress = state.questionProgress[question.id]
      const favorite = state.favoriteQuestionIds.includes(question.id)
      const statusMatches =
        libraryStatus === 'all' ||
        (libraryStatus === 'unseen' && !progress) ||
        (libraryStatus === 'wrong' && Boolean(progress && progress.incorrectCount > 0 && !progress.mastered)) ||
        (libraryStatus === 'mastered' && Boolean(progress?.mastered)) ||
        (libraryStatus === 'favorite' && favorite)
      if (!statusMatches) return false
      if (!query) return true
      return `${question.id} ${question.prompt} ${question.options.map((option) => option.text).join(' ')}`
        .toLocaleLowerCase('zh-CN')
        .includes(query)
    })
  }, [librarySearch, librarySection, libraryStatus, state.favoriteQuestionIds, state.questionProgress])

  useEffect(() => {
    setLibraryPage(1)
  }, [librarySearch, librarySection, libraryStatus])

  const renderHeader = () => (
    <header className="app-header">
      <div className="app-header__inner">
        <button className="brand" type="button" onClick={() => setView('home')} aria-label="返回首页">
          <span className="brand-mark" aria-hidden="true"><CheckCircle size={21} weight="fill" /></span>
          <span className="brand-copy"><strong>秋招行测训练场</strong><small>本地题库 · 进度自动保存</small></span>
        </button>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={() => setView('library')}>
            <ListNumbers size={18} /><span>全部题库</span>
          </button>
          <button className="icon-button" type="button" onClick={exportProgress} aria-label="导出进度备份" title="导出进度备份"><DownloadSimple size={19} /></button>
          <button className="icon-button" type="button" onClick={() => importInputRef.current?.click()} aria-label="导入进度备份" title="导入进度备份"><UploadSimple size={19} /></button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importProgress(file)
            }}
          />
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
            title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
          >{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
        </div>
      </div>
    </header>
  )

  const renderHome = () => {
    const totalAttempted = Object.keys(state.questionProgress).length
    const activeProgress = session ? `${session.currentIndex + 1}/${session.questionIds.length}` : null
    return (
      <>
        {renderHeader()}
        <main className="main-shell">
          <section className="home-hero" aria-labelledby="home-title">
            <div>
              <p className="eyebrow"><Target size={16} weight="fill" />2026 届秋招 · 个人训练版</p>
              <h1 className="hero-title" id="home-title">把 <span>727</span> 道题，<br />练成反应。</h1>
              <p className="hero-subtitle">完整通关、分区强化和限时模拟放在同一套训练闭环里。答案、错题、收藏与进度都保存在你的浏览器中。</p>
              <div className="button-row hero-actions">
                {session ? (
                  <button className="primary-button primary-button--large" type="button" onClick={resumeSession}>
                    继续上次训练 {activeProgress}<ArrowRight size={18} weight="bold" />
                  </button>
                ) : (
                  <button className="primary-button primary-button--large" type="button" onClick={startFull}>
                    开始题库通关<ArrowRight size={18} weight="bold" />
                  </button>
                )}
                <button
                  className="secondary-button secondary-button--large"
                  type="button"
                  onClick={() => setSetup({ mode: 'mock', section: 'all', count: 60, timedMinutes: 60, order: 'random' })}
                ><Timer size={18} />配置计时模拟</button>
                {session && <button className="text-button" type="button" onClick={startFull}>重新开始完整通关</button>}
              </div>
              <p className="hero-note"><Info size={17} />训练用于提升熟悉度、正确率和速度，不代表真实公司的官方题型、评分规则，也不承诺通过测评。</p>
            </div>
            <aside className="hero-proof" aria-label="题库信息">
              <div className="hero-proof__top">
                <div><p className="proof-number">727</p><p className="proof-label">已结构化题目</p></div>
                <span className="proof-badge"><CheckCircle size={14} weight="fill" />数据已对账</span>
              </div>
              <div className="proof-grid">
                <div><span>训练区域</span><strong>3 个</strong></div>
                <div><span>题图引用</span><strong>525 次</strong></div>
                <div><span>已练题目</span><strong>{totalAttempted} 道</strong></div>
                <div><span>已掌握</span><strong>{masteredCount} 道</strong></div>
              </div>
            </aside>
          </section>

          <section className="content-section" aria-labelledby="sections-title">
            <div className="section-heading"><h2 id="sections-title">按能力区域逐个击破</h2><p>选择区域后可配置 10、20、50 或任意题量，并切换顺序或随机练习。</p></div>
            <div className="section-grid">
              {sectionStats.map((section) => {
                const meta = SECTION_META[section.id]
                const Icon = meta.icon
                return (
                  <button
                    className="section-card"
                    type="button"
                    key={section.id}
                    onClick={() => setSetup({ mode: 'section', section: section.id, count: 20, timedMinutes: 30, order: 'sequential' })}
                  >
                    <span>
                      <span className="section-card__header"><span className="section-icon" aria-hidden="true"><Icon size={24} weight="duotone" /></span><span className="section-count">{section.count} 题</span></span>
                      <h3>{meta.label}</h3><p>{meta.description}</p>
                    </span>
                    <span className="section-card__footer">
                      <span className="section-stat"><strong>{section.completed}</strong><span>已练 · 正确率 {percent(section.accuracy)}</span></span>
                      <span className="progress-rail" aria-label={`完成 ${percent(section.completion)}`}><span style={{ width: percent(section.completion) }} /></span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="content-section" aria-labelledby="tools-title">
            <div className="section-heading"><h2 id="tools-title">从练题走到模拟</h2><p>模拟模式交卷前隐藏答案；错题连续两次答对后标记为已掌握。</p></div>
            <div className="tool-grid">
              <article className="tool-panel tool-panel--accent">
                <Timer className="tool-panel__icon" size={32} weight="duotone" />
                <h2>限时模拟</h2><p>自由设置区域、题量和时限。刷新页面后仍按原截止时间继续计时。</p>
                <div className="button-row"><button className="secondary-button" type="button" onClick={() => setSetup({ mode: 'mock', section: 'all', count: 60, timedMinutes: 60, order: 'random' })}>设置一套模拟<ArrowRight size={17} /></button></div>
              </article>
              <article className="tool-panel">
                <Brain className="tool-panel__icon" size={32} weight="duotone" />
                <h2>针对性复习</h2><p>把注意力放回真正需要重练的题目。</p>
                <div className="mini-tool-list">
                  <button className="mini-tool" type="button" onClick={() => startSession({ mode: 'wrong' })}>
                    <span className="mini-tool__label"><ArrowCounterClockwise size={19} />未掌握错题</span><span className="mini-tool__count">{wrongCount}</span>
                  </button>
                  <button className="mini-tool" type="button" onClick={() => startSession({ mode: 'favorites' })}>
                    <span className="mini-tool__label"><Heart size={19} />我的收藏</span><span className="mini-tool__count">{state.favoriteQuestionIds.length}</span>
                  </button>
                </div>
              </article>
            </div>
            <div className="source-note"><WarningCircle size={20} /><div><strong>关于题库来源与质量</strong>题目来自你提供的 352 页整理 PDF，本网页与北森及任何招聘公司无官方关系。源文件中有 202 题未提供解析、4 题答案与解析疑似冲突，页面会如实标记，不会自动编造解析。题库来源授权不明，建议仅作个人本地练习。</div></div>
          </section>
          <footer className="app-footer"><span>题库版本 · SHA256 {BANK.meta.sourceSha256.slice(0, 12)}</span><span>无账号 · 无广告 · 进度仅存当前浏览器</span></footer>
        </main>
      </>
    )
  }

  const renderQuiz = () => {
    if (!session || !currentQuestion) return renderHome()
    const answer = session.answers[currentQuestion.id]
    const isMock = session.mode === 'mock'
    const revealed = !isMock && Boolean(answer)
    const isFavorite = state.favoriteQuestionIds.includes(currentQuestion.id)
    const elapsedOrRemaining = session.deadlineAt ? Math.max(0, session.deadlineAt - now) : now - session.startedAt
    const urgent = Boolean(session.deadlineAt && elapsedOrRemaining <= 60_000)
    const progress = (session.currentIndex + 1) / session.questionIds.length
    const warning = qualityMessage(currentQuestion)
    const pageLabel = currentQuestion.sourcePageStart === null
      ? '源页待核'
      : currentQuestion.sourcePageEnd && currentQuestion.sourcePageEnd !== currentQuestion.sourcePageStart
        ? `PDF P${currentQuestion.sourcePageStart}-${currentQuestion.sourcePageEnd}`
        : `PDF P${currentQuestion.sourcePageStart}`

    return (
      <div className="quiz-page">
        <header className="quiz-topbar">
          <div className="quiz-topbar__inner">
            <div className="quiz-title"><strong>{MODE_LABELS[session.mode]}</strong><span>{SECTION_META[currentQuestion.section].label} · 第 {session.currentIndex + 1} / {session.questionIds.length} 题</span></div>
            <div className={`timer-chip${urgent ? ' is-urgent' : ''}`} aria-live={urgent ? 'polite' : 'off'}>
              <Clock size={17} /><span className="timer-value">{formatDuration(elapsedOrRemaining)}</span><span className="visually-hidden">{session.deadlineAt ? '剩余时间' : '已用时间'}</span>
            </div>
            <div className="quiz-topbar__actions">
              <button className="ghost-button" type="button" onClick={() => setView('home')}><House size={17} />暂存退出</button>
              <button className="primary-button" type="button" onClick={() => finishSession(session)}>{isMock ? '交卷' : '结束本轮'}</button>
            </div>
          </div>
          <div className="quiz-progress" aria-hidden="true"><span style={{ width: percent(progress) }} /></div>
        </header>

        <main className="quiz-layout">
          <article className="question-panel">
            <div className="question-panel__inner">
              <div className="question-meta">
                <div className="question-meta__left">
                  <span className="mode-badge">{SECTION_META[currentQuestion.section].label}</span><span className="source-badge">{pageLabel}</span>
                  {currentQuestion.reviewStatus === 'needs-review' && <span className="status-badge">待人工复核</span>}
                </div>
                <div className="question-meta__right">
                  <span className="question-number">{currentQuestion.id}</span>
                  <button className={`icon-button favorite-button${isFavorite ? ' is-active' : ''}`} type="button" onClick={handleFavorite} aria-label={isFavorite ? '取消收藏' : '收藏本题'} title="收藏本题，快捷键 F"><Star size={18} weight={isFavorite ? 'fill' : 'regular'} /></button>
                </div>
              </div>

              <h1 className={`question-prompt${currentQuestion.prompt ? '' : ' is-placeholder'}`}>{currentQuestion.prompt || '题干见图，请按图中顺序选择。'}</h1>
              {currentQuestion.assets.length > 0 && (
                <div className="question-assets">
                  {currentQuestion.assets.map((asset) => (
                    <button className="question-asset-button" type="button" key={`${asset.src}-${asset.bbox.join('-')}`} onClick={() => { setLightboxAsset(asset); setLightboxScale(1) }}>
                      <img src={asset.src} alt={asset.alt} loading="eager" /><span className="asset-hint"><MagnifyingGlassPlus size={14} />点击放大题图</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="options-list" role="radiogroup" aria-label="答案选项">
                {currentQuestion.options.map((option) => {
                  const selected = draftSelection === option.label
                  const correct = revealed && option.label === currentQuestion.answer
                  const wrong = revealed && selected && option.label !== currentQuestion.answer
                  const classes = ['option-button', selected ? 'is-selected' : '', correct ? 'is-correct' : '', wrong ? 'is-wrong' : ''].filter(Boolean).join(' ')
                  return (
                    <button className={classes} type="button" role="radio" aria-checked={selected} disabled={revealed} key={option.label} onClick={() => handleOption(option.label)}>
                      <span className="option-key">{option.label}</span>
                      <span className={`option-copy${currentQuestion.visualOptions ? ' is-visual' : ''}`}>{option.text || `图中第 ${option.label} 个选项`}</span>
                      {correct && <CheckCircle size={20} weight="fill" aria-label="正确答案" />}{wrong && <X size={20} weight="bold" aria-label="你的错误答案" />}
                    </button>
                  )
                })}
              </div>

              {revealed && answer && (
                <>
                  <div className={`answer-feedback${answer.correct ? '' : ' is-wrong'}`}>
                    {answer.correct ? <CheckCircle size={24} weight="fill" /> : <X size={24} weight="bold" />}
                    <div><strong>{answer.correct ? '回答正确' : '这题答错了'}</strong><p>你的答案 {answer.selected} · 题库原答案 {currentQuestion.answer} · 本题用时 {formatDuration(answer.durationMs)}</p></div>
                  </div>
                  <div className="explanation-panel"><h3><FileText size={18} />题库原解析</h3><p>{currentQuestion.explanation || '原题库未提供解析。'}</p></div>
                </>
              )}
              {warning && <div className="quality-warning"><WarningCircle size={18} /><span>{warning}</span></div>}
              {isMock && <div className="quality-warning"><Info size={18} /><span>模拟模式在交卷前不显示正确答案和解析，你可以随时返回修改选项。</span></div>}

              <div className="question-footer">
                <span className="shortcut-hint"><kbd>A</kbd>-<kbd>E</kbd> 选项　<kbd>Enter</kbd> 提交/下一题　<kbd>F</kbd> 收藏</span>
                <div className="question-actions">
                  <button className="secondary-button" type="button" disabled={session.currentIndex === 0} onClick={() => changeQuestion(session.currentIndex - 1)}><CaretLeft size={17} />上一题</button>
                  <button className="primary-button" type="button" onClick={handlePrimaryQuizAction}>
                    {isMock ? (session.currentIndex === session.questionIds.length - 1 ? '完成并交卷' : '下一题') : answer ? (session.currentIndex === session.questionIds.length - 1 ? '完成本轮' : '下一题') : '提交答案'}<CaretRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          </article>

          <aside className="quiz-sidebar" aria-label="答题卡">
            <div className="sidebar-heading"><strong>答题卡</strong><span>{Object.keys(session.answers).length} / {session.questionIds.length} 已答</span></div>
            <div className="question-nav-grid">
              {session.questionIds.map((questionId, index) => (
                <button
                  className={['question-nav-item', index === session.currentIndex ? 'is-current' : '', session.answers[questionId] ? 'is-answered' : ''].filter(Boolean).join(' ')}
                  type="button"
                  key={questionId}
                  onClick={() => changeQuestion(index)}
                  aria-label={`第 ${index + 1} 题${session.answers[questionId] ? '，已作答' : ''}`}
                >{index + 1}</button>
              ))}
            </div>
            <div className="sidebar-legend"><span><i className="legend-swatch is-answered" />已答</span><span><i className="legend-swatch" />未答</span></div>
          </aside>
        </main>
      </div>
    )
  }

  const renderResult = () => {
    if (!resultSession) return null
    const score = scoreSession(resultSession, BANK)
    const reviewQuestions = resultSession.questionIds
      .map((questionId) => QUESTION_BY_ID.get(questionId))
      .filter((question): question is Question => Boolean(question))
      .sort((a, b) => {
        const answerA = resultSession.answers[a.id]
        const answerB = resultSession.answers[b.id]
        const rank = (answer: typeof answerA) => (answer?.correct ? 2 : answer ? 0 : 1)
        return rank(answerA) - rank(answerB)
      })
      .slice(0, 100)
    return (
      <>
        {renderHeader()}
        <main className="result-page">
          <section className="result-hero">
            <div className="result-copy">
              <p className="eyebrow"><CheckCircle size={16} weight="fill" />本轮训练完成</p>
              <h1>先看数据，再决定下一轮练什么。</h1>
              <p>分数按正确题数除以本轮总题数计算，未答题计 0 分并单独列出。正确率仅统计已作答题目。</p>
              <div className="result-actions">
                <button className="primary-button" type="button" onClick={() => setView('home')}><House size={17} />返回训练首页</button>
                <button className="secondary-button" type="button" onClick={() => startSession({ mode: 'wrong' })}><ArrowCounterClockwise size={17} />练未掌握错题</button>
              </div>
            </div>
            <aside className="result-score-card">
              <div className="result-score">{score.score}<small>分</small></div><p>已答正确率 {percent(score.accuracy)}</p>
              <div className="result-metrics"><div><span className="metric-value">{score.correct}</span><span className="metric-label">答对</span></div><div><span className="metric-value">{score.incorrect}</span><span className="metric-label">答错</span></div><div><span className="metric-value">{score.unanswered}</span><span className="metric-label">未答</span></div></div>
            </aside>
          </section>
          <section aria-labelledby="breakdown-title">
            <div className="section-heading"><h2 id="breakdown-title">区域表现</h2><p>本轮总用时 {formatDuration(score.durationMs)}，用来观察准确率与节奏，不对应任何公司官方评分。</p></div>
            <div className="breakdown-grid">
              {score.sections.map((section) => <article className="breakdown-card" key={section.section}><div className="breakdown-card__top"><strong>{SECTION_META[section.section].label}</strong><span>{section.correct}/{section.total}</span></div><div className="progress-rail"><span style={{ width: percent(section.accuracy) }} /></div></article>)}
            </div>
          </section>
          <section aria-labelledby="review-title">
            <div className="section-heading"><h2 id="review-title">逐题复盘</h2><p>错题与未答优先排列。点击任意题可单独重练{resultSession.questionIds.length > 100 ? '，当前展示前 100 题' : ''}。</p></div>
            <div className="review-list">
              {reviewQuestions.map((question, index) => {
                const answer = resultSession.answers[question.id]
                return (
                  <button className={`review-item${answer?.correct ? ' is-correct' : answer ? ' is-wrong' : ''}`} type="button" key={question.id} onClick={() => startSingleQuestion(question.id)}>
                    <span className="review-index">{index + 1}</span><span className="review-copy"><strong>{question.prompt || '视觉题，题干见图'}</strong><span>{SECTION_META[question.section].label} · {answer ? `你的答案 ${answer.selected} / 正确答案 ${question.answer}` : `未作答 / 正确答案 ${question.answer}`}</span></span><ArrowRight size={18} />
                  </button>
                )
              })}
            </div>
          </section>
        </main>
      </>
    )
  }

  const renderLibrary = () => {
    const pageSize = 20
    const pageCount = Math.max(1, Math.ceil(libraryQuestions.length / pageSize))
    const safePage = Math.min(libraryPage, pageCount)
    const questions = libraryQuestions.slice((safePage - 1) * pageSize, safePage * pageSize)
    return (
      <>
        {renderHeader()}
        <main className="library-page">
          <div className="library-header">
            <div><p className="eyebrow"><ListNumbers size={16} />完整题库</p><h1>727 题一处检索</h1><p>按区域、学习状态或题干关键词筛选，点击题目即可单题练习。</p></div>
            <button className="secondary-button" type="button" onClick={() => setView('home')}><CaretLeft size={17} />返回首页</button>
          </div>
          <div className="library-controls">
            <label><span className="visually-hidden">搜索题干</span><span style={{ position: 'relative', display: 'block' }}><MagnifyingGlass size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }} /><input className="search-input" style={{ paddingLeft: 42 }} type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="搜索题干或题号" /></span></label>
            <label><span className="visually-hidden">能力区域</span><select className="field-select" value={librarySection} onChange={(event) => setLibrarySection(event.target.value as SectionId | 'all')}><option value="all">全部区域</option>{BANK.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label>
            <label><span className="visually-hidden">学习状态</span><select className="field-select" value={libraryStatus} onChange={(event) => setLibraryStatus(event.target.value as LibraryStatus)}><option value="all">全部状态</option><option value="unseen">未练习</option><option value="wrong">未掌握错题</option><option value="mastered">已掌握</option><option value="favorite">已收藏</option></select></label>
          </div>
          <div className="source-note"><Info size={20} /><div><strong>找到 {libraryQuestions.length} 道题</strong>搜索结果保留题库原题干与原答案。对标记为待复核的题目，请结合源 PDF 判断。</div></div>
          <div className="library-list" style={{ marginTop: 18 }}>
            {questions.map((question) => {
              const progress = state.questionProgress[question.id]
              const favorite = state.favoriteQuestionIds.includes(question.id)
              return (
                <button className="library-item" type="button" key={question.id} onClick={() => startSingleQuestion(question.id)}>
                  <span className="review-index">{question.sectionIndex}</span><span className="library-item__copy"><strong>{question.prompt || '视觉题，题干见图'}</strong><span>{SECTION_META[question.section].label} · {question.id} · {progress ? `已练 ${progress.attemptCount} 次` : '未练习'}{favorite ? ' · 已收藏' : ''}</span></span><ArrowRight size={18} />
                </button>
              )
            })}
            {questions.length === 0 && <div className="source-note"><MagnifyingGlass size={20} /><div><strong>没有匹配题目</strong>尝试更换关键词、区域或学习状态。</div></div>}
          </div>
          <div className="pagination">
            <button className="icon-button" type="button" disabled={safePage === 1} onClick={() => setLibraryPage((page) => Math.max(1, page - 1))} aria-label="上一页"><CaretLeft size={17} /></button><span>第 {safePage} / {pageCount} 页</span><button className="icon-button" type="button" disabled={safePage === pageCount} onClick={() => setLibraryPage((page) => Math.min(pageCount, page + 1))} aria-label="下一页"><CaretRight size={17} /></button>
          </div>
        </main>
      </>
    )
  }

  return (
    <div className="app" data-theme={theme}>
      {view === 'home' && renderHome()}
      {view === 'quiz' && renderQuiz()}
      {view === 'result' && renderResult()}
      {view === 'library' && renderLibrary()}

      {setup && (
        <div className="setup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSetup(null) }}>
          <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <header className="setup-dialog__header">
              <div><h2 id="setup-title">{setup.mode === 'mock' ? '配置计时模拟' : '配置分区练习'}</h2><p>{setup.mode === 'mock' ? '交卷前隐藏答案，截止时间到自动交卷。' : '选择题量和出题顺序，提交后立即看解析。'}</p></div>
              <button className="icon-button" type="button" onClick={() => setSetup(null)} aria-label="关闭"><X size={18} /></button>
            </header>
            <div className="setup-form">
              <fieldset className="field-group">
                <legend className="field-legend">练习区域</legend>
                <div className="segmented segmented--four">
                  {setup.mode === 'mock' && <button className={`segment${setup.section === 'all' ? ' is-active' : ''}`} type="button" onClick={() => setSetup({ ...setup, section: 'all' })}>全部</button>}
                  {BANK.sections.map((section) => <button className={`segment${setup.section === section.id ? ' is-active' : ''}`} type="button" key={section.id} onClick={() => setSetup({ ...setup, section: section.id })}>{section.name}</button>)}
                </div>
              </fieldset>
              <div className="field-row">
                <label className="field-group">
                  <span className="field-legend">题量</span><input className="field-input" type="number" min="1" max={setup.section === 'all' ? BANK.meta.questionCount : BANK.meta.sectionCounts[setup.section]} value={setup.count} onChange={(event) => setSetup({ ...setup, count: Math.max(1, Number(event.target.value)) })} /><span className="field-hint">常用：10 / 20 / 50 题</span>
                </label>
                {setup.mode === 'mock' ? (
                  <label className="field-group"><span className="field-legend">倒计时分钟</span><input className="field-input" type="number" min="1" max="300" value={setup.timedMinutes} onChange={(event) => setSetup({ ...setup, timedMinutes: Math.max(1, Number(event.target.value)) })} /><span className="field-hint">这是自定义配置，不是官方时限</span></label>
                ) : (
                  <fieldset className="field-group"><legend className="field-legend">出题顺序</legend><div className="segmented"><button className={`segment${setup.order === 'sequential' ? ' is-active' : ''}`} type="button" onClick={() => setSetup({ ...setup, order: 'sequential' })}>顺序</button><button className={`segment${setup.order === 'random' ? ' is-active' : ''}`} type="button" onClick={() => setSetup({ ...setup, order: 'random' })}>随机</button></div></fieldset>
                )}
              </div>
              <div className="setup-actions"><button className="secondary-button" type="button" onClick={() => setSetup(null)}>取消</button><button className="primary-button" type="button" onClick={startFromSetup}>开始训练<ArrowRight size={17} /></button></div>
            </div>
          </section>
        </div>
      )}

      {lightboxAsset && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="题图放大预览">
          <div className="lightbox__toolbar"><button className="icon-button" type="button" onClick={() => setLightboxScale((scale) => Math.max(0.5, scale - 0.25))} aria-label="缩小"><MagnifyingGlassMinus size={19} /></button><button className="icon-button" type="button" onClick={() => setLightboxScale((scale) => Math.min(3, scale + 0.25))} aria-label="放大"><MagnifyingGlassPlus size={19} /></button><button className="icon-button" type="button" onClick={() => setLightboxAsset(null)} aria-label="关闭预览"><X size={19} /></button></div>
          <div className="lightbox__stage" onClick={() => setLightboxAsset(null)}><img src={lightboxAsset.src} alt={lightboxAsset.alt} style={{ transform: `scale(${lightboxScale})` }} onClick={(event) => event.stopPropagation()} /></div>
        </div>
      )}
      {toast && <div className="toast" role="status"><Info size={18} />{toast}</div>}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  )
}

export default App
