import { redirect } from 'next/navigation';

// 同学简历平台：打开即工作台，不再经过营销落地页。
// 「选路径」入口在工作台的「快速开始」按钮。
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}