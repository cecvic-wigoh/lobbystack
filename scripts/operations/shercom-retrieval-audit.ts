import assert from "node:assert/strict";
import { createDatabaseClient } from "../../packages/db/src/index";
import {
  searchKnowledgeEvidence,
  loadLatestBusinessSnapshot,
} from "../../packages/domain/src/index";
import { createEmbeddingProvider } from "../../packages/providers/src/index";
import {
  createAgentModel,
  answerGroundedQuestion,
} from "../../packages/agent-core/src/index";
const database = createDatabaseClient("lobbystack_worker");
const businessId = "dc28b440-52c9-4ec5-aa89-cd8fca22433a";
const cases = [
 "What does Shercom do?",
 "What rubber products do you offer?",
 "What bag sizes and coverage are available for Chip Mulch?",
 "What are the dimensions and weight of your parking curbs?",
 "Can rubber paving be installed over my existing asphalt driveway?",
 "How long do I wait before driving on a new rubber driveway?",
 "What is the rubber paving warranty?",
 "How much will my driveway cost?",
 "How do I find a paving installer?",
 "When did Shercom start?",
 "Who should I contact about admission to Suncrest College?",
 "Write a poem about pizza."
];
(async () => {
  try {
    const embeddings = createEmbeddingProvider();
    if (!embeddings) throw new Error("Embedding provider missing");
    const domain = { db: database.db, embeddings };
    const snapshot = await loadLatestBusinessSnapshot(domain, { businessId });
    const baseModel = createAgentModel({
      ...process.env,
      AI_CHAT_REASONING_EFFORT: "low",
    });
    if (!snapshot || !baseModel) throw new Error("Context missing");
    const model = baseModel;
    const results = [];
    for (const question of cases) {
      const evidence = await searchKnowledgeEvidence(domain, {
        businessId,
        query: question,
      });
      const started = Date.now();
      let answer;
      try {
        answer = await answerGroundedQuestion({
          model,
          context: { domain, snapshot, channel: "web_voice" },
          question,
        });
      } catch (e) {
        answer = { error: e instanceof Error ? e.name : "failed" };
      }
      results.push({
        question,
        answer,
        answerMs: Date.now() - started,
        retrievalMs: Math.round(evidence.durationMs),
        mode: evidence.mode,
        evidence: evidence.matches.map((p) => ({
          url: p.sourceUrl,
          sequence: p.sequence,
          text: p.content,
        })),
      });
    }
    console.log(JSON.stringify(results));
    assert.equal(results.length, 12);
    results.forEach((result, index) => assert.equal((result.answer as { outcome?: string }).outcome, index < 10 ? "supported" : "out_of_scope", result.question));
  } finally {
    await database.pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
