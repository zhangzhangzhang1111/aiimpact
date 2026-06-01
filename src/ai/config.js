export function resolveAiProfile(config = {}, requestedProfile) {
  const profiles = config.profiles || {};
  const defaultProfileName = requestedProfile || config.defaultProfile || Object.keys(profiles)[0];
  const defaultProfile = profiles[defaultProfileName] || {
    provider: 'offline',
    model: 'offline-rule-engine',
  };

  const agents = {};
  for (const [agentName, profileName] of Object.entries(config.agents || {})) {
    agents[agentName] = profiles[profileName] || defaultProfile;
  }

  return {
    name: defaultProfileName || 'offline',
    default: normalizeProfile(defaultProfile),
    agents: Object.fromEntries(
      Object.entries(agents).map(([agentName, profile]) => [agentName, normalizeProfile(profile)]),
    ),
  };
}

export function normalizeProfile(profile) {
  const providerAliases = {
    ollm: 'ollama',
    calude: 'claude',
    anthropic: 'claude',
    minmax: 'minimax',
  };
  const provider = providerAliases[profile.provider] || profile.provider || 'offline';
  return {
    provider,
    model: profile.model || 'offline-rule-engine',
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    apiKeyEnv: profile.apiKeyEnv,
    temperature: profile.temperature ?? 0.2,
    maxTokens: profile.maxTokens ?? 4096,
  };
}
