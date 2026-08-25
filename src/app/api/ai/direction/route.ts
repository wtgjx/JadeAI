import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { extractJson } from '@/lib/ai/extract-json';
import { z } from 'zod/v4';

const inputSchema = z.object({
  experiences: z.string().min(3, '先随便写点什么，我才能猜方向'),
  skills: z.string().optional(),
});

const directionSchema = z.object({
  code: z.string(),
  name: z.string(),
  entryJobs: z.array(z.string()),
  rationale: z.string(),
  gap: z.string(),
});

const outputSchema = z.object({
  directions: z.array(directionSchema).min(2).max(3),
});

const PROMPT = `你是面向在校大学生、正在帮一个「不知道自己适合什么岗位」的同学找工作方向。
他会用大白话写自己做过的事（课程、比赛、社团、兼职、作品、用过的 AI 工具等），可能完全没实习、没数字。
请从这些经历里提取能力，推荐 2~3 个【适合应届生/大学生入门】的方向。
用简体中文输出一个 JSON 对象，字段：
- directions: array（2~3 项），每项：
  - code: string，简短英文代号
  - name: string，方向名称（如「新媒体运营」「内容创作」「产品/项目助理」「数据处理」「社群运营」「设计」「软件开发/测试」）
  - entryJobs: string[]，这个方向常见的入门岗位（如「新媒体运营实习生」「校园新媒体助理」），2~4 个
  - rationale: string，给这个同学推荐的理由（要点名他做过的事），2~3 句
  - gap: string，他目前还缺什么、最近 2~4 周能补什么,1~2 句

要求：只输出 JSON，不要用 markdown，不要用代码块，不要输出 JSON 之外的文字。推荐要基于他写的经历，不得无中生有给他编经历。`;

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues?.[0]?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }

    const { experiences, skills } = parsed.data;
    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const skillsContext = skills?.trim() ? `\n他自己列会的技能：${skills.trim()}` : '';

    const result = await generateText({
      model,
      maxOutputTokens: 4096,
      system: PROMPT,
      prompt: `他写了自己做过的事：\n${experiences}${skillsContext}\n\n只返回 JSON。`,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    const data = extractJson(result.text, outputSchema);

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/direction error:', error);
    return NextResponse.json({ error: '方向推荐失败，请稍后再试' }, { status: 500 });
  }
}