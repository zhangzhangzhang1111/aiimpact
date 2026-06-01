import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAiProfile } from '../src/ai/config.js';

test('resolveAiProfile selects configured providers and exposes agent model mapping', () => {
  const profile = resolveAiProfile(
    {
      defaultProfile: 'openai-main',
      profiles: {
        'openai-main': {
          provider: 'openai',
          apiKeyEnv: 'OPENAI_API_KEY',
          model: 'gpt-4.1',
        },
        local: {
          provider: 'ollama',
          baseUrl: 'http://localhost:11434',
          model: 'qwen2.5-coder',
        },
      },
      agents: {
        diff: 'local',
        review: 'openai-main',
      },
    },
    'openai-main',
  );

  assert.equal(profile.default.provider, 'openai');
  assert.equal(profile.agents.diff.provider, 'ollama');
  assert.equal(profile.agents.review.model, 'gpt-4.1');
});

test('resolveAiProfile accepts common provider aliases from config', () => {
  const profile = resolveAiProfile({
    profiles: {
      local: {
        provider: 'ollm',
        model: 'qwen',
      },
      reviewer: {
        provider: 'calude',
        model: 'claude-sonnet',
      },
      chinese: {
        provider: 'minmax',
        model: 'MiniMax-Text-01',
      },
    },
    agents: {
      callGraph: 'local',
      review: 'reviewer',
      businessImpact: 'chinese',
    },
  });

  assert.equal(profile.agents.callGraph.provider, 'ollama');
  assert.equal(profile.agents.review.provider, 'claude');
  assert.equal(profile.agents.businessImpact.provider, 'minimax');
});
