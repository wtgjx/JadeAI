import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import '@/components/aptitude/aptitude.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const appName = process.env.APP_NAME || '职爪';

export const metadata: Metadata = {
  title: `${appName} - 秋招，从投递到 Offer`,
  description: '职爪 ZHIZHUA — AI 简历助手，从投递到 Offer 的一站式秋招工具',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=localStorage.getItem('jadeai-brand');if(b==='boss'){b='mint';localStorage.setItem('jadeai-brand','mint');}else if(b==='jade'){b='blue';localStorage.setItem('jadeai-brand','blue');}if(b==='blue'||b==='pink'){document.documentElement.setAttribute('data-brand',b);}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var tourDone=localStorage.getItem('jade_tour_dashboard_completed');var splashDone=sessionStorage.getItem('jade_splash_done');if(!tourDone||splashDone){document.documentElement.setAttribute('data-splash-hidden','');}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
