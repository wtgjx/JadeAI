'use client';

import { Camera, ChevronRight, FileText, Sparkle, Target } from 'lucide-react';
import { useRouter } from '@/i18n/routing';

export function StartStart() {
  const router = useRouter();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
            <span className="text-lg font-bold">简</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">同学简历</h1>
          <p className="mt-2 text-sm text-zinc-500">一步步带你做出能投的简历</p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => router.push('/linkedin-photo')}
            className="cursor-pointer rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-brand hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand-muted text-brand">
                <Camera className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-zinc-900">证件照</p>
                <p className="mt-0.5 text-sm text-zinc-500">AI 生成专业证件照，免费 2 次</p>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-400" />
            </div>
          </button>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-brand-muted text-brand">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-zinc-900">简历制作</p>
                <p className="mt-0.5 text-sm text-zinc-500">有岗位 / 没方向，都能一步步做出来</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => router.push('/start/path-a')}
                className="w-full cursor-pointer rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left transition-colors hover:border-brand hover:bg-brand-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
                    <Target className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-900">有岗位，按岗位做简历</p>
                    <p className="mt-0.5 text-xs text-zinc-500">粘一段 JD，AI 拆解后照着写</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => router.push('/start/path-b')}
                className="w-full cursor-pointer rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left transition-colors hover:border-brand hover:bg-brand-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
                    <Sparkle className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-900">还没想好，帮我找方向</p>
                    <p className="mt-0.5 text-xs text-zinc-500">说说做过什么，AI 告诉你适合哪些岗位</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                </div>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="w-full cursor-pointer pt-2 text-center text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-600"
          >
            先不选，随便看看工作台
          </button>

          <p className="pt-2 text-center text-xs text-zinc-400">
            两条路最后都会给你一版能改、能导出 PDF 的简历
          </p>
        </div>
      </div>
    </main>
  );
}
