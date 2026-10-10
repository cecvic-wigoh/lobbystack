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
const businessId = "9598f317-838d-4126-804c-cb8b376ac0e2";
const cases = [
  "What nursing programs do you offer?",
  "What are the entry requirements for Practical Nursing in Yorkton?",
  "What is the tuition for the Electrician Applied Certificate?",
  "Which campuses offer the Bachelor of Science in Nursing?",
  "What are the admission requirements for Computer Networking Technician?",
  "How long is the Welding Applied Certificate?",
  "What do you learn in Anatomy and Physiology 1?",
  "What is the HVAC course about?",
  "What are the requirements for Continuing Care Assistant?",
  "What programs do you offer in business?",
  "When does Practical Nursing start in Melfort?",
  "Can you guarantee admission to nursing?",
  "What are the prerequisites for NFPA 1140 Wildland Firefighter Level I?",
  "Do you offer online ed2go courses?",
  "What does the 1A Truck Driver Training MELT course cover?",
  "What is the cancellation policy for corporate training courses?",
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
  } finally {
    await database.pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
