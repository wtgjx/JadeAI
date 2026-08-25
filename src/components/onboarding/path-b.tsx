'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, Sparkle, Wand2 } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAIHeaders } from '@/stores/settings-store';

interface Direction {
  code: string;
  name: string;
  entryJobs: string[];
  rationale: string;
  gap: string;
}

function fp(): string {
  return typeof window !== 'undefined' ? window.localStorage.getItem('jade_fingerprint') ?? '' : '';
}

function aiHeaders(): Record<string, string> {
  return { ...getAIHeaders(), ...(fp() ? { 'x-fingerprint': fp() } : {}) };
}

export function PathBWizard() {
  const router = useRouter();
  const [step, setStep] = useState<'write' | 'directions' | 'generating'>('write');
  const [experiences, setExperiences] = useState('');
  const [skills, setSkills] = useState('');
  const [directions, setDirections] = useState<Direction[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  async function analyze() {
    if (experiences.trim().length < 3) {
      setError('先说说你做过什么，哪怕一句「我帮同学剪过视频」也行');
      return;
    }
    setError('');
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiHeaders() },
        body: JSON.stringify({ experiences: experiences.trim(), skills: skills.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '推荐失败');
      setDirections(data.directions as Direction[]);
      setStep('directions');
    } catch (e: any) {
      setError(e.message || '找方向失败，请检查 LLM Key');
    } finally {
      setAnalyzing(false);
    }
  }

  async function generate(jobTitle: string) {
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
      setStep('directions');
    }
  }

  function stepText() {
    return step === 'write' ? '第 1 步 / 共 2 步' : '第 2 步 / 共 2 步';
  }

  return (
    <main className="min-h-dvh bg-zinc-50">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <button
          type="button"
          onClick={() => (step === 'write' ? router.push('/start') : setStep('write'))}
          className="mb-4 flex cursor-pointer items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">帮我找工作方向</h1>
            <p className="mt-1 text-sm text-zinc-500">{stepText()} · 不知道做什么？正好，我来帮你想想</p>
          </div>
          <span className="rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand">不知道版</span>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : null}

        {step === 'write' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-semibold text-zinc-800">用大白话写写你都做过什么</p>
              <p className="mt-1 text-xs text-zinc-500">课程、比赛、社团、兼职、作品、用过的 AI 工具都算，能想到多少写多少</p>
              <textarea
                value={experiences}
                onChange={(e) => setExperiences(e.target.value)}
                rows={8}
                placeholder={'例如：\n我帮老师做过公众号文章排过版，会用剪映剪视频、用 Midjourney 做海报。\n在社团负责过招新登记，一次登记了 20 个人。\n参加过学校短视频比赛，拿过三等奖……'}
                className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 outline-none focus:border-brand"
              />
              <p className="mt-4 text-sm font-semibold text-zinc-800">会什么技能？（可选）</p>
              <Input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="例如：剪映、Midjourney、PS、飞书表格"
                className="mt-2"
              />
              <Button
                onClick={analyze}
                disabled={analyzing}
                className="mt-4 w-full cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {analyzing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
                帮我看看我适合干什么
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'directions' ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              根据你说的这些，我猜你可能会适合下面 {directions.length} 个方向（选一个就开始做简历）：</p>
            <div className="space-y-3">
              {directions.map((d, i) => (
                <div key={d.code} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-zinc-900">{i + 1}. {d.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">入门可以做：{d.entryJobs.join(' / ')}</p>
                    </div>
                    <Button
                      onClick={() => generate(d.name)}
                      className="shrink-0 cursor-pointer bg-brand hover:bg-brand-hover"
                    >
                      就它了
                    </Button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700">{d.rationale}</p>
                  <p className="mt-2 text-xs text-zinc-500">还差一点：{d.gap}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => generate('通用求职简历')}
              className="w-full cursor-pointer rounded-xl py-3 text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-800"
            >
              先不选了，做个通用简历
            </button>
          </div>
        ) : null}

        {step === 'generating' ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white py-16">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="mt-4 text-sm text-zinc-600">正在按你选的岗位写简历，大约十几秒…</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}