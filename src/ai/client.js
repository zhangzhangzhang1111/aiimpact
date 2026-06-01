import { resolveAiProfile } from './config.js';

export class AiClient {
  constructor({ config = {}, requestedProfile } = {}) {
    this.profile = resolveAiProfile(config, requestedProfile);
  }

  async complete(agentName, { system, user, fallback }) {
    const profile = this.profile.agents[agentName] || this.profile.default;
    if (profile.provider === 'offline') {
      return fallback || offlineCompletion(agentName, user);
    }

    const apiKey = profile.apiKey || (profile.apiKeyEnv ? process.env[profile.apiKeyEnv] : undefined);
    if (!apiKey && profile.provider !== 'ollama') {
      return `${fallback || offlineCompletion(agentName, user)}\n\n> AI provider ${profile.provider} skipped: missing API key.`;
    }

    try {
      if (profile.provider === 'openai') return await callOpenAi(profile, apiKey, system, user);
      if (profile.provider === 'claude' || profile.provider === 'anthropic') {
        return await callClaude(profile, apiKey, system, user);
      }
      if (profile.provider === 'minimax') return await callMiniMax(profile, apiKey, system, user);
      if (profile.provider === 'ollama') return await callOllama(profile, system, user);
      return `${fallback || offlineCompletion(agentName, user)}\n\n> Unsupported provider: ${profile.provider}.`;
    } catch (error) {
      return `${fallback || offlineCompletion(agentName, user)}\n\n> AI provider ${profile.provider} failed: ${error.message}`;
    }
  }
}

async function callOpenAi(profile, apiKey, system, user) {
  const baseUrl = profile.baseUrl || 'https://api.openai.com';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.model,
      temperature: profile.temperature,
      max_tokens: profile.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || response.statusText);
  return body.choices?.[0]?.message?.content || '';
}

async function callClaude(profile, apiKey, system, user) {
  const baseUrl = profile.baseUrl || 'https://api.anthropic.com';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.model,
      system,
      max_tokens: profile.maxTokens,
      temperature: profile.temperature,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || response.statusText);
  return body.content?.map((item) => item.text).join('\n') || '';
}

async function callMiniMax(profile, apiKey, system, user) {
  const baseUrl = profile.baseUrl || 'https://api.minimax.io';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/text/chatcompletion_v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.model,
      messages: [
        { sender_type: 'BOT', sender_name: 'system', text: system },
        { sender_type: 'USER', sender_name: 'user', text: user },
      ],
      temperature: profile.temperature,
      tokens_to_generate: profile.maxTokens,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || response.statusText);
  return body.reply || body.choices?.[0]?.message?.content || '';
}

async function callOllama(profile, system, user) {
  const baseUrl = profile.baseUrl || 'http://127.0.0.1:11434';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body.message?.content || '';
}

function offlineCompletion(agentName, user) {
  return [
    `## ${agentName} 离线分析`,
    '',
    '未配置可用 API key 或本地模型，服务使用规则引擎生成该部分。',
    '',
    user.slice(0, 1600),
  ].join('\n');
}
