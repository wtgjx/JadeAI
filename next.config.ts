import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'puppeteer-core', '@sparticuz/chromium-min'],
  // dev 模式持久缓存：重启 dev server 后复用上次编译产物，大幅减少页面首次访问的编译等待
  turbopack: {
    persistentCache: true,
  } as unknown as NonNullable<NextConfig['turbopack']>,
};

export default withNextIntl(nextConfig);
