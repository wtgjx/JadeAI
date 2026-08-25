// 秋招/校园视频内容配置（加载页展示 + 可跳转）
// 抖音视频：不支持 iframe 嵌入，加载页以视觉卡片形式展示，点击跳转抖音观看
export const RECRUIT_VIDEO = {
  // 视频标题（展示在卡片上）
  title: '校园 WowLand · 鲜花派送',
  // 点击卡片后跳转的完整视频页（新标签打开）
  linkUrl: 'https://www.douyin.com/video/7647567764781059347',
  // 抖音短链接（可在手机端唤起 App）
  shareUrl: 'https://v.douyin.com/f7R8onG-D0A/',
} as const;
