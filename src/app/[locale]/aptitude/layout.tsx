import { Header } from '@/components/layout/header';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export default function AptitudeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background">
      <Header />
      {/* 宽度交给行测题库组件自控（内部是 min(1240px, ...) 的满宽布局） */}
      <main>{children}</main>
      <SettingsDialog />
    </div>
  );
}
