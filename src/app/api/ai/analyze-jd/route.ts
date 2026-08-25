import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { extractJson } from '@/lib/ai/extract-json';
import { z } from 'zod/v4';

const inputSchema = z.object({
  jobDescription: z.string().min(5, '还没看到岗位描述，请粘贴或输入一段 JD'),
});

const outputSchema = z.object({
  role: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  plusPoints: z.array(z.string()),
  keywords: z.array(z.string()),
  plainTalk: z.string(),
});

const PROMPT = `你是面向在校大学生的求职助手。用户贴了一段岗位 JD，他要用自己的经历去投这个岗位。
请用简体中文输出一个 JSON 对象，字段：
- role: string，用一句话概括这是什么岗位（例如「新媒体运营实习生」）
- responsibilities: string[]，这个岗位日常主要做什么
- requirements: string[]，硬性要求（通常必须满足的）
- plusPoints: string[]，加分项（没有也不影响投）
- keywords: string[]，JD 里的高频关键词，用于简历里对齐
- plainTalk: string，用给大一到大四同学都能听懂的【大白话】，解释这个岗位到底在找什么样的人，2~4 句话

要求：只输出 JSON，不要用 markdown，不要用代码块，不要输出 JSON 之外的任何文字。`;

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

    const { jobDescription } = parsed.data;
    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 4096,
      system: PROMPT,
      prompt: `岗位 JD：\n${jobDescription}\n\n只返回 JSON。`,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    const data = extractJson(result.text, outputSchema);

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/analyze-jd error:', error);
    return NextResponse.json({ error: '岗位拆解失败，请稍后再试' }, { status: 500 });
  }
}