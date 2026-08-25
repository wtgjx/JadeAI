import { db } from './index';
import { resumes, resumeSections, users } from './schema';
import { eq } from 'drizzle-orm';

/**
 * 为本地单用户（JADE_RUNTIME=desktop）预填候选人的真实简历数据。
 * 数据源：ai-job-search/.claude/skills/job-application-assistant/01-candidate-profile.md
 * 用法：pnpm exec tsx src/lib/db/seed-wu-minghao.ts
 */
async function seed() {
  console.log('Seeding 吴明皓 resume...');

  const userRows = await db.select().from(users).limit(1);
  const userId = userRows[0]?.id ?? 'local';
  console.log(`Using userId=${userId}`);

  // 清除该用户的既有简历（含自动生成的示例简历）及其分节
  const existing = await db.select().from(resumes).where(eq(resumes.userId, userId));
  for (const resume of existing) {
    await db.delete(resumeSections).where(eq(resumeSections.resumeId, resume.id));
  }
  await db.delete(resumes).where(eq(resumes.userId, userId));

  {
    const resumeId = crypto.randomUUID();
    await db.insert(resumes).values({
      id: resumeId,
      userId,
      title: '吴明皓 - 简历',
      template: 'modern',
      language: 'zh',
    });

    const sections = [
      {
        type: 'personal_info',
        title: '个人信息',
        sortOrder: 0,
        content: {
          fullName: '吴明皓',
          jobTitle: 'AIGC 内容创作与产品运营',
          email: 'wt1670935895@gmail.com',
          phone: '18570857589',
          location: '深圳',
        },
      },
      {
        type: 'summary',
        title: '个人简介',
        sortOrder: 1,
        content: {
          text: '2027 届包装工程专业本科在读（辅修游戏直播与短视频创作），GPA 3.23/4.0、专业排名 3/64。拥有 AIGC 内容生产、内容与社群运营、商家/分销 SOWO 全链路实操经验：曾作为 AI 分镜师参与 10+ 商业 AIGC 宣传片项目，并从 0 到 1 搭建闲鱼视频剪辑接单业务（4 个月 2000+ 单、交易额约 10 万元），同时独立落地抖音校园官方项目与校园冷启动项目。擅长把 AI 工具能力与运营方法结合，追求可核验的结果与可复制的流程。',
        },
      },
      {
        type: 'work_experience',
        title: '工作/项目经历',
        sortOrder: 2,
        content: {
          items: [
            {
              id: crypto.randomUUID(),
              company: '上海艾门南墙文化传媒有限公司',
              position: 'AI 分镜师（实习）',
              location: '上海',
              startDate: '2025-06',
              endDate: '2025-09',
              current: false,
              description: '在 4 人实习小组中参与 10+ 个商业 AIGC 宣传片项目（含河南卫视《二十四节气》、马可波罗等头部客户项目），负责出图与 PS 精修。',
              highlights: [
                '产出约占最终画面素材 1/4（按画面张数计）',
                '按画质、中文渲染、一致性与成本差异在 Midjourney、即梦、GPT 图像模型间选型，总结 5 类 Prompt 模板并在团队内共享',
                '固化「MJ 生成—PS 精修—交付」流程，平均生成轮次由约 10 轮降至 3–5 轮',
              ],
            },
            {
              id: crypto.randomUUID(),
              company: '闲鱼视频剪辑服务（123 包装设计工作室）',
              position: '业务负责人',
              location: '深圳',
              startDate: '2026-03',
              endDate: '2026-07',
              current: false,
              description: '从 0 到 1 搭建闲鱼剪辑接单业务，并兼任 123 包装设计工作室负责人（大二起，有效成员 20 人）。',
              highlights: [
                '采用「运营 30% / 剪辑师 70%」分账模式，4 个月成交 2000+ 单，累计交易额约 10 万元、运营端毛利约 3 万元',
                '搭建闲鱼店铺电商设计 SOP（店铺名称、封面、个人信息、商品介绍），沉淀「AI 提效设计」方法并培训团队',
                '主导创作者招募与筛选：跑通前 2 个账号全流程并复制给 3 名运营（共 6 个账号），组建约 10 名剪辑师供给网络',
                '建立内容审核与交付标准（报价-交付-售后-复盘全链路），准时交付率约 90%、退款率约 3%，飞书知识库使新运营约 1 周上手',
                '数据驱动运营，识别到 AI 视频订单量价更高后组织剪辑师向 AI 视频制作转型；为成员提供比赛 AI 技术支持，助力获中国好创意国赛、大广赛、大包赛等奖项',
              ],
            },
            {
              id: crypto.randomUUID(),
              company: '抖音校园 WOW Land（本校）',
              position: '本校发起人',
              location: '深圳',
              startDate: '2026-04',
              endDate: '2026-07',
              current: false,
              description: '独立落地抖音官方校园项目 3 期活动（官方给玩法框架，本校方案自主设计）。',
              highlights: [
                '累计 84 人报名、40 人参与，负责招募、执行与传播全流程',
                '针对校区偏远、周末在校人数不足问题，延长活动窗口、缩短参与链路、放宽拍摄场景，参与者视频产出率由第 1 期 4% 提升至第 3 期 57%',
                '个人 AI 宣传片获抖音官方一等奖；用 AI 辅助搭建活动管理平台、制作招募海报与场地物料并开发现场互动应用',
              ],
            },
          ],
        },
      },
      {
        type: 'education',
        title: '教育背景',
        sortOrder: 3,
        content: {
          items: [
            {
              id: crypto.randomUUID(),
              institution: '长沙师范学院',
              degree: '本科（在读）',
              field: '包装工程；辅修：游戏直播与短视频创作',
              location: '长沙',
              startDate: '2023-09',
              endDate: '2027-06',
              gpa: '3.23/4.0',
              highlights: ['专业排名 3/64', '求职目标城市：深圳，可快速到岗'],
            },
          ],
        },
      },
      {
        type: 'projects',
        title: '独立项目',
        sortOrder: 4,
        content: {
          items: [
            {
              id: crypto.randomUUID(),
              name: '三农产品校园分销（冰糖橙）— 冷启动',
              url: '',
              startDate: '',
              endDate: '',
              description: '以 AI 宣传视频在自有社群验证购买需求，组建并培训校园分销团队，直接对接果农协商定价与发货。',
              technologies: [],
              highlights: [
                '销售 400+ 箱、销售额约 2 万元',
                '设计农产品海报、KT 板与产品 KV，并为麻阳农产品协会「长河甄选」完成网页设计（宝贝图、封面、logo、产品 KV）',
              ],
            },
            {
              id: crypto.randomUUID(),
              name: '跨校信件交换工具「没有地址的信」',
              url: 'https://letters.wutongshuai.com',
              startDate: '',
              endDate: '',
              description: '开发线上跨校信件交换工具：盲写 + 漂流信箱机制，接入飞书多维表格与 QQ 邮箱 SMTP 实现自动匹配与延迟送达。',
              technologies: ['飞书多维表格', 'SMTP'],
              highlights: ['42 人使用'],
            },
          ],
        },
      },
      {
        type: 'skills',
        title: '技能特长',
        sortOrder: 5,
        content: {
          categories: [
            {
              id: crypto.randomUUID(),
              name: 'AIGC 内容生产',
              skills: ['Midjourney', '即梦', 'Comfy UI', 'GPT 图像', '无限画布创作', 'PS 精修'],
            },
            {
              id: crypto.randomUUID(),
              name: '运营与协作',
              skills: ['创作者招募与筛选', '内容审核与交付 SOP', '分账激励', '飞书多维表格', 'Codex'],
            },
            {
              id: crypto.randomUUID(),
              name: '设计软件',
              skills: ['ArtiosCAD', 'Adobe Illustrator', 'Adobe Photoshop'],
            },
          ],
        },
      },
      {
        type: 'certifications',
        title: '获奖经历',
        sortOrder: 6,
        content: {
          items: [
            { id: crypto.randomUUID(), name: '中国好创意国赛一等奖', issuer: '中国好创意大赛', date: '' },
            { id: crypto.randomUUID(), name: '2025 高校 AI 电竞锦标赛全国亚军', issuer: '高校 AI 电竞锦标赛', date: '2025' },
            { id: crypto.randomUUID(), name: '湖南省大学生电子商务大赛（三创赛湖南赛区）省级一等奖', issuer: '湖南省电子商务大赛', date: '2025' },
            { id: crypto.randomUUID(), name: '「挑战杯」湖南省赛省级二等奖', issuer: '挑战杯', date: '' },
            { id: crypto.randomUUID(), name: '「互联网+」湖南省赛高教主赛道创意组省级三等奖', issuer: '互联网+', date: '' },
            { id: crypto.randomUUID(), name: '即梦 AI 优质创作者', issuer: '即梦 AI', date: '' },
            { id: crypto.randomUUID(), name: '大阪世博会 AI 艺术展参展', issuer: '大阪世博会', date: '' },
          ],
        },
      },
      {
        type: 'languages',
        title: '语言',
        sortOrder: 7,
        content: {
          items: [{ id: crypto.randomUUID(), language: '中文', proficiency: '母语', description: '' }],
        },
      },
      {
        type: 'qr_codes',
        title: '二维码',
        sortOrder: 8,
        content: {
          items: [],
        },
      },
    ];

    for (const section of sections) {
      await db.insert(resumeSections).values({
        id: crypto.randomUUID(),
        resumeId,
        title: section.title,
        type: section.type,
        sortOrder: section.sortOrder,
        visible: true,
        content: section.content,
      } as never);
    }

    console.log('Seed complete! 吴明皓 resume created with resumeId=' + resumeId);
    return resumeId;
  }
}

seed()
  .then((id) => {
    console.log('Done, resumeId=' + id);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });