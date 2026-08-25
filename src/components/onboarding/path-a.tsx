'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, Sparkle, Wand2 } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAIHeaders } from '@/stores/settings-store';

const PRESETS: Array<{ label: string; role: string }> = [
  { label: '新媒体运营', role: '新媒体运营' },
  { label: '内容创作 / 自媒体', role: '内容创作与自媒体运营' },
  { label: '产品 / 项目助理', role: '产品助理 / 项目助理' },
  { label: '设计', role: '设计师' },
  { label: '电商 / 社群运营', role: '电商运营 / 社群运营' },
  { label: '数据处理 / 分析', role: '数据分析助理' },
];

interface AnalyzeResult {
  role: string;
  responsibilities: string[];
  requirements: string[];
  plusPoints: string[];
  keywords: string[];
  plainTalk: string;
}

function fp(): string {
  return typeof window !== 'undefined' ? window.localStorage.getItem('jade_fingerprint') ?? '' : '';
}

function aiHeaders(): Record<string, string> {
  return { ...getAIHeaders(), ...(fp() ? { 'x-fingerprint': fp() } : {}) };
}

export function PathAWizard() {
  const router = useRouter();
  const [step, setStep] = useState<'jd' | 'fill' | 'job' | 'understand' | 'generating'>('jd');
  const [jd, setJd] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [experiences, setExperiences] = useState('');
  const [skills, setSkills] = useState('');
  const [error, setError] = useState('');

  async function analyze() {
    if (jd.trim().length < 5) {
      setError('先粘贴一段岗位 JD 再拆哦');
      return;
    }
    setError('');
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiHeaders() },
        body: JSON.stringify({ jobDescription: jd.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '拆解失败');
      setResult(data as AnalyzeResult);
      setJobTitle((data as AnalyzeResult).role);
      setStep('understand');
    } catch (e: any) {
      setError(e.message || '拆解失败，请检查 LLM Key');
    } finally {
      setAnalyzing(false);
    }
  }

  async function generate() {
    if (experiences.trim().length < 3) {
      setError('先说说你做过什么，我才好帮你写');
      return;
    }
    setError('');
    setStep('generating');
    const skillList = skills.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/ai/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiHeaders() },
        body: JSON.stringify({
          jobTitle,
          yearsOfExperience: 0,
          skills: skillList,
          experience: experiences.trim(),
          language: 'zh',
          template: 'classic',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      router.push(`/editor/${data.resumeId}`);
    } catch (e: any) {
      setError(e.message || '生成失败，请检查 LLM Key');
      setStep('fill');
    }
  }

  const totalSteps = 3;
  const currentStep = step === 'jd' ? 1 : step === 'understand' ? 2 : 3;

  return (
    <main className="min-h-dvh bg-zinc-50">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <button
          type="button"
          onClick={() => (step === 'jd' ? router.push('/start') : setStep('jd'))}
          className="mb-4 flex cursor-pointer items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">我有想去的岗位</h1>
            <p className="mt-1 text-sm text-zinc-500">全程大白话</p>
          </div>
          <span className="rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand">按岗位版</span>
        </div>

        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
            <span>第 {currentStep} 步 / 共 {totalSteps} 步</span>
            <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : null}

        {step === 'jd' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-800">把你想投的岗位 JD 粘过来</p>
              <p className="mt-1 text-xs text-zinc-500">公众号/招聘页里一段岗位描述都行，粘过来我帮你拆</p>
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows={7}
                placeholder={'例如：\n负责公司新媒体账号的内容策划与发布，熟悉剪辑或海报制作，能根据热点产出内容……'}
                className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 outline-none focus:border-brand"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button
                  onClick={analyze}
                  disabled={analyzing}
                  className="cursor-pointer bg-brand hover:bg-brand-hover"
                >
                  {analyzing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
                  帮我拆一下这份 JD
                </Button>
                <button
                  type="button"
                  onClick={() => { setJobTitle('通用求职简历'); setStep('fill'); }}
                  className="cursor-pointer text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-800"
                >
                  懒得填，先做个通用简历
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-800">不想找 JD？点一下常用方向</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setJobTitle(p.role); setStep('fill'); }}
                    className="cursor-pointer rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:border-brand hover:text-brand"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 'understand' && result ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand bg-brand-muted/50 p-5">
              <p className="text-sm font-semibold text-brand">用大白话看懂这份 JD</p>
              <p className="mt-2 text-sm leading-6 text-zinc-800">{result.plainTalk}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-medium text-zinc-400">岗位</p>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-semibold text-zinc-800">主要做什么</p>
                <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                  {result.responsibilities.slice(0, 4).map((r) => <li key={r}>· {r}</li>)}
                </ul>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-semibold text-zinc-800">硬性要求 & 加分</p>
                <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                  {result.requirements.slice(0, 4).map((r) => <li key={r}>· {r}</li>)}
                  {result.plusPoints.slice(0, 3).map((r) => <li key={r} className="text-zinc-400">＋ {r}</li>)}
                </ul>
              </div>
            </div>
            <Button onClick={() => setStep('fill')} className="w-full cursor-pointer bg-brand hover:bg-brand-hover">
              <Sparkle className="mr-1.5 h-4 w-4" /> 就用这个岗位做简历
            </Button>
          </div>
        ) : null}

        {(step === 'fill' || step === 'generating') ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-800">告诉我你做过什么</p>
              <p className="mt-1 text-xs text-zinc-500">大白话就行，写「参加过什么 / 做了什么 / 用什么做的」，没有实习数字也没关系</p>
              <textarea
                value={experiences}
                onChange={(e) => setExperiences(e.target.value)}
                disabled={step === 'generating'}
                rows={8}
                placeholder={'例如：\n我在校园新媒体帮老师做过公众号推文，会剪视频，用过剪映和 Midjourney 做海报……\n社团分担过招新，帮 20 个新同学登记……'}
                className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 outline-none focus:border-brand"
              />
              <p className="mt-4 text-sm font-semibold text-zinc-800">会什么技能？（可选）</p>
              <Input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                disabled={step === 'generating'}
                placeholder="例如：剪映、Midjourney、PS、飞书表格"
                className="mt-2"
              />
              <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
                正在按岗位「{jobTitle || '通用简历'}」为你写简历
              </div>
              <Button
                onClick={generate}
                disabled={step === 'generating'}
                className="mt-4 w-full cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {step === 'generating' ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />正在生成，大约十几秒…</>
                ) : (
                  <><Sparkle className="mr-1.5 h-4 w-4" />生成我的简历</>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}