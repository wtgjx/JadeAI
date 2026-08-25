'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, Music2, Play, X } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { hasCompletedTour } from '@/stores/tour-store';
import { warmupApp } from '@/lib/app-warmup';
import { RECRUIT_VIDEO } from '@/config/recruit-video';
import { cn } from '@/lib/utils';

const SPLASH_SESSION_KEY = 'jade_splash_done';
// 最短展示时长：预热可能瞬间完成，但加载页至少停留 5 秒，让用户看到秋招视频入口
const MIN_SPLASH_MS = 5000;
// 全屏 → 迷你卡片过渡时长（淡出 + 缩小），同时用于全屏容器的延迟卸载
const FULLSCREEN_EXIT_MS = 200;

// 模块级标记：同一标签页（JS 会话）内全屏加载页只展示一次。
// 即使 Next.js 客户端导航导致 layout 重新挂载，也不会重复弹出加载页。
let splashShown = false;

/**
 * 进站加载页（老用户）：后台预热全部主要路由的同时，向用户展示秋招视频入口。
 * - 仅对完成过新手引导的用户显示（新用户的预热由 TourOverlay 在引导期间完成）
 * - 预热完成后全屏加载页淡出缩小，变为左下角固定迷你视频卡片（不写 sessionStorage）
 * - 迷你卡片可点击跳转观看秋招视频；点击右上角 X 关闭并写 sessionStorage
 *   （本会话不再出现，站内切路由不重复弹出）
 */
export function BootSplash() {
  const t = useTranslations('bootSplash');
  const router = useRouter();
  const [phase, setPhase] = useState<'showing' | 'mini' | 'closed'>('showing');
  // 全屏容器延迟卸载：进入 mini 后先播放 FULLSCREEN_EXIT_MS 的淡出缩小过渡，再真正移除
  const [fullscreenExiting, setFullscreenExiting] = useState(false);

  useEffect(() => {
    // 本标签页已展示过全屏加载页（防止导航导致 layout 重挂载后重复弹出）
    if (splashShown) {
      setPhase('closed');
      return;
    }
    // 未完成新手引导（新用户）不显示加载页
    if (!hasCompletedTour('dashboard')) {
      setPhase('closed');
      return;
    }
    // 本会话已展示过
    if (sessionStorage.getItem(SPLASH_SESSION_KEY)) {
      setPhase('closed');
      return;
    }

    splashShown = true;
    setPhase('showing');
    let cancelled = false;

    // 后台预热与最短展示时长并行，完成后缩小为迷你卡片（不写 sessionStorage）
    Promise.all([
      warmupApp((href) => router.prefetch(href)),
      new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS)),
    ]).then(() => {
      if (cancelled) return;
      setPhase('mini');
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  // mini 阶段：延迟卸载全屏容器，让淡出缩小过渡播放完整
  useEffect(() => {
    if (phase !== 'mini') return;
    const timer = setTimeout(() => setFullscreenExiting(true), FULLSCREEN_EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // 关闭迷你卡片：记录本会话已展示并卸载
  const handleClose = () => {
    sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
    setPhase('closed');
  };

  if (phase === 'closed') return null;

  const fullscreenVisible =
    phase === 'showing' || (phase === 'mini' && !fullscreenExiting);

  return (
    <>
      {fullscreenVisible && (
        <div
          className={cn(
            'boot-splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6 transition-all duration-200 ease-out dark:bg-zinc-950',
            phase === 'mini' && 'pointer-events-none scale-95 opacity-0'
          )}
          aria-label={t('title')}
        >
          {/* 品牌标识 */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-wide text-zinc-900 dark:text-white">
              {t('title')}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {t('videoHint')}
            </p>
          </div>

          {/* 秋招视频卡片（抖音视觉卡片，点击跳转观看；加载时间短不真播放） */}
          <a
            href={RECRUIT_VIDEO.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            {/* 封面区：播放按钮 + 平台角标 */}
            <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-zinc-100/80 to-zinc-200 dark:from-zinc-800/80 dark:to-zinc-950">
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 30% 40%, rgba(254,44,85,.35), transparent 60%)',
                }}
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#FE2C55] text-white shadow-lg ring-4 ring-white/10 transition-transform group-hover:scale-110">
                <Play className="ml-0.5 h-7 w-7 fill-current" />
              </div>
              <span className="absolute left-3 top-3 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
                <Music2 className="h-3 w-3" />
                抖音
              </span>
            </div>
            {/* 底部信息：标题 + 前往观看 */}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 transition-colors group-hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:group-hover:bg-zinc-800">
              <span className="truncate">{RECRUIT_VIDEO.title}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-brand">
                {t('videoLink')}
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </div>
          </a>

          {/* 加载指示 */}
          <div className="mt-8 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        </div>
      )}

      {phase === 'mini' && (
        <div className="fixed bottom-4 left-4 z-[110] w-[208px] animate-in fade-in slide-in-from-bottom-2">
          {/* 迷你卡片：抖音播放按钮 + 角标 + 视频标题，点击跳转观看 */}
          <a
            href={RECRUIT_VIDEO.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white p-2.5 pr-9 shadow-xl transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FE2C55] text-white shadow-md transition-transform group-hover:scale-110">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <Music2 className="h-3 w-3" />
                抖音
              </span>
              <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                {RECRUIT_VIDEO.title}
              </span>
            </span>
          </a>
          {/* 右上角关闭按钮 */}
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('close')}
            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 shadow-md transition-colors hover:bg-zinc-200 hover:text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
