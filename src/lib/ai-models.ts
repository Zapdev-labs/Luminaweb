import { openai } from "@inngest/agent-kit";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AgentRole = "manager" | "research" | "review" | "title" | "skill-router" | "enhance";

const GENERATION_MODEL = "minimax/minimax-m3";

const MODEL_DEFAULTS: Record<AgentRole, string> = {
  manager: GENERATION_MODEL,
  research: "x-ai/grok-4.1-fast",
  review: "x-ai/grok-4.1-fast",
  title: "x-ai/grok-4.1-fast",
  "skill-router": "x-ai/grok-4.1-fast",
  enhance: "x-ai/grok-4.1-fast",
};

const ENV_KEYS: Record<AgentRole, string> = {
  manager: "POLARIS_MANAGER_MODEL",
  research: "POLARIS_RESEARCH_MODEL",
  review: "POLARIS_REVIEW_MODEL",
  title: "POLARIS_TITLE_MODEL",
  "skill-router": "POLARIS_SKILL_ROUTER_MODEL",
  enhance: "POLARIS_ENHANCE_MODEL",
};

export function getModelId(role: AgentRole): string {
  const envValue = process.env[ENV_KEYS[role]];
  if (envValue) return envValue;
  if (role === "manager" && process.env.POLARIS_CODING_MODEL) {
    return process.env.POLARIS_CODING_MODEL;
  }
  return MODEL_DEFAULTS[role];
}

export function createAgentKitModel(role: AgentRole) {
  return openai({
    model: getModelId(role),
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1",
    defaultParameters: {
      temperature: 0.3,
      max_completion_tokens: 32000,
    },
  });
}

export function createVercelAIModel(role: AgentRole) {
  const provider = createOpenAICompatible({
    name: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return provider(getModelId(role));
}
