import { describe, expect, it } from "vitest";

import { agentModelId, createAgentModel, createVoiceKnowledgeDraft, describeAgentUsage } from "./model";

describe("createAgentModel", () => {
  it("defaults to gpt-6-luna on OpenAI's Responses API", () => {
    const model = createAgentModel({ OPENAI_API_KEY: "sk-test" });
    expect(agentModelId({}).model).toBe("gpt-6-luna");
    expect(model).toMatchObject({ provider: "openai.responses", modelId: "gpt-6-luna" });
  });

  it("uses chat completions for other OpenAI-compatible endpoints", () => {
    const model = createAgentModel({ AI_CHAT_BASE_URL: "http://127.0.0.1:18090/v1", AI_CHAT_MODEL: "local-model" });
    expect(model).toMatchObject({ provider: "openai.chat", modelId: "local-model" });
  });

  it("treats OpenAI's URL with trailing slashes as OpenAI", () => {
    expect(createAgentModel({ OPENAI_API_KEY: "sk-test", AI_CHAT_BASE_URL: "https://api.openai.com/v1//" })).toMatchObject({ provider: "openai.responses" });
  });

  it("needs a key to reach OpenAI", () => {
    expect(createAgentModel({})).toBeUndefined();
  });
});

describe("browser knowledge draft rollout", () => {
  const environment = { OPENAI_API_KEY: "sk-test", VOICE_KNOWLEDGE_DRAFT_MODEL: "gpt-4.1", VOICE_KNOWLEDGE_DRAFT_BUSINESS_IDS: " shercom, another " };
  it("requires an explicitly enabled workspace, model and OpenAI key", () => {
    expect(createVoiceKnowledgeDraft("other", environment)).toBeUndefined();
    expect(createVoiceKnowledgeDraft("shercom", { ...environment, VOICE_KNOWLEDGE_DRAFT_MODEL: "" })).toBeUndefined();
    expect(createVoiceKnowledgeDraft("shercom", { ...environment, OPENAI_API_KEY: "" })).toBeUndefined();
    expect(createVoiceKnowledgeDraft("shercom", { ...environment, AI_CHAT_BASE_URL: "https://custom.test/v1" })).toBeUndefined();
    expect(createVoiceKnowledgeDraft("shercom", environment)?.model).toMatchObject({ provider: "openai.responses", modelId: "gpt-4.1" });
  });
  it("attributes usage to the draft without charging the original model's prices", () => {
    const draft = createVoiceKnowledgeDraft("shercom", { ...environment, AI_CHAT_INPUT_COST_PER_MILLION_TOKENS: "9", AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS: "12", AI_CHAT_PRICING_VERSION: "original", AI_CHAT_PRICING_SOURCE: "original", AI_CHAT_PRICING_EFFECTIVE_DATE: "2026-01-01" })!;
    const usage = describeAgentUsage(undefined, 100, draft.usageEnvironment);
    expect(usage.model).toBe("gpt-4.1");
    expect(usage.totalCostUsd).toBeUndefined();
  });
});
