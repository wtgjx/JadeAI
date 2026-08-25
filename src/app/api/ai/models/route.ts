import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // 平台统一配置优先（服务端 .env），前端无需携带 Key
  const provider = process.env.AI_PROVIDER || request.headers.get('x-provider') || 'openai';
  const apiKey = process.env.AI_API_KEY || request.headers.get('x-api-key') || '';
  const baseURL = process.env.AI_BASE_URL || request.headers.get('x-base-url') || '';

  if (!apiKey) {
    return Response.json({ models: [] });
  }

  try {
    let models: { id: string }[] = [];

    switch (provider) {
      case 'anthropic': {
        const url = baseURL
          ? `${baseURL.replace(/\/$/, '')}/v1/models`
          : 'https://api.anthropic.com/v1/models';
        const res = await fetch(url, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (!res.ok) return Response.json({ models: [] });
        const data = await res.json();
        models = (data.data ?? []).map((m: { id: string }) => ({ id: m.id }));
        break;
      }

      case 'gemini': {
        const url = baseURL
          ? `${baseURL.replace(/\/$/, '')}/models?key=${apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return Response.json({ models: [] });
        const data = await res.json();
        models = (data.models ?? []).map((m: { name: string }) => ({
          id: m.name.replace(/^models\//, ''),
        }));
        break;
      }

      default: {
        // openai
        const effectiveBaseURL = baseURL || 'https://api.openai.com/v1';
        const res = await fetch(`${effectiveBaseURL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return Response.json({ models: [] });
        const data = await res.json();
        models = (data.data ?? data).map((m: { id: string }) => ({ id: m.id }));
        break;
      }
    }

    return Response.json({ models });
  } catch {
    return Response.json({ models: [] });
  }
}
