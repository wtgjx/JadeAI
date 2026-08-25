// 应用预热：在用户无感知时（新手引导期间 / 加载页期间）后台拉起主要路由与数据，
// 让后续站内跳转无需等待编译与首次数据请求。
// 注意：dev 模式下 Next.js 禁用 Link/router prefetch，此优化在生产构建下完全生效。

// 需要预热的主要站内路由
export const WARM_ROUTES = [
  '/dashboard',
  '/templates',
  '/interview',
  '/recruit',
  '/linkedin-photo',
  '/start',
] as const;

/**
 * 后台预热应用。
 * @param prefetch 路由预取函数（来自 i18n useRouter().prefetch）
 */
export async function warmupApp(
  prefetch: (href: string) => Promise<unknown> | void
): Promise<void> {
  await Promise.allSettled([
    // 预取各页面路由 chunk
    ...WARM_ROUTES.map((route) => prefetch(route)),
    // 预热核心 API：触发服务端完成 SQLite 首次打开等一次性开销（结果丢弃）
    fetch('/api/resume').catch(() => {}),
  ]);
}
