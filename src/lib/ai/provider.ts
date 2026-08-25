import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface AIConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export function extractAIConfig(request: NextRequest): AIConfig {
  // 平台统一配置优先（服务端 .env），前端即使携带 Key 也会被覆盖，用户无需填写
  const provider = process.env.AI_PROVIDER || request.headers.get('x-provider') || 'openai';
  const apiKey = process.env.AI_API_KEY || request.headers.get('x-api-key') || '';
  const baseURL = process.env.AI_BASE_URL || request.headers.get('x-base-url') || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || request.headers.get('x-model') || 'gpt-4o';
  return { provider, apiKey, baseURL, model };
}

export function getModel(config: AIConfig, modelOverride?: string) {
  if (!config.apiKey) {
    throw new AIConfigError('AI 服务未配置（平台方需在 .env 中设置 AI_API_KEY）。');
  }
  // 平台已在 .env 配置模型时，忽略客户端覆盖，保证平台统一控制
  const modelId = process.env.AI_MODEL ? config.model : (modelOverride || config.model);

  switch (config.provider) {
    case 'anthropic': {
      const p = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL || undefined });
      return p(modelId);
    }
    case 'gemini': {
      const p = createGoogleGenerativeAI({ apiKey: config.apiKey, baseURL: config.baseURL || undefined });
      return p(modelId);
    }
    default: {
      const p = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      return p.chat(modelId);
    }
  }
}

/**
 * Returns providerOptions for JSON mode — only applicable to OpenAI-compatible providers.
 */
export function getJsonProviderOptions(config: AIConfig) {
  if (config.provider === 'openai') {
    return { openai: { response_format: { type: 'json_object' as const } } };
  }
  return {} as Record<string, never>;
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}
