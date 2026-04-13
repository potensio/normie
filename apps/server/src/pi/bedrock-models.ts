/**
 * Bedrock Models Configuration
 *
 * Defines models available via Bedrock (OpenAI-compatible API).
 * Used with ModelRegistry.registerProvider() to register custom Bedrock provider.
 */

type BedrockModel = {
  id: string;
  name: string;
  api: "openai-completions";
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
};

export const BEDROCK_MODELS: BedrockModel[] = [
  {
    id: "zai.glm-5",
    name: "GLM-5",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: "moonshotai.kimi-k2.5",
    name: "Kimi K2.5",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: "openai.gpt-oss-120b",
    name: "GPT OSS 120B",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
];
