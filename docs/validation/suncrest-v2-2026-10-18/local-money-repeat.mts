import { writeFile } from "node:fs/promises";
const R = "/Users/cec-mac/kai-projs/suncrest-lobbystack";
const { createDatabaseClient } = await import(`${R}/packages/db/src/index.ts`);
const { createEmbeddingProvider } = await import(`${R}/packages/providers/src/index.ts`);
const { createAgentModel, answerGroundedQuestion } = await import(`${R}/packages/agent-core/src/index.ts`);
const url = new URL(process.env.LOBBYSTACK_WORKER_DATABASE_URL!);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/suncrest_v2_test") throw new Error("not the local test database");
const worker = createDatabaseClient("lobbystack_worker", { ...process.env });
const domain = { db: worker.db, embeddings: createEmbeddingProvider()! };
const model = createAgentModel({ ...process.env, AI_CHAT_REASONING_EFFORT: "low" })!;
const snapshot = { businessId: "00000000-0000-4000-8000-00000000c011", displayName: "Suncrest College", defaultLocale: "en", timezone: "America/Regina" };
const questions = ["What are the fees for Practical Nursing in Melfort?", "What are the fees for Practical Nursing in Yorkton?", "What is the tuition for Practical Nursing in Melfort?", "What is the cost of books for Practical Nursing in Yorkton?", "What is the application fee for Practical Nursing in Yorkton?", "What is the tuition refund policy for Practical Nursing in Yorkton?"];
const results = [];
try {
  for (const question of questions) for (let run = 1; run <= 3; run++) {
    const started = performance.now();
    const result = await answerGroundedQuestion({ model, context: { domain, snapshot, channel: "web_voice" }, question }).catch((error: Error) => ({ answer: `ERROR ${error.name}`, outcome: "error", sources: [] }));
    const ms = Math.round(performance.now() - started);
    results.push({ question, run, ms, outcome: result.outcome, answer: result.answer });
    console.log(`[${result.outcome}, ${ms} ms] ${question} (run ${run})\n   ${result.answer}`);
  }
  await writeFile(`${process.argv[2]}/evidence/live-money-repeat.json`, JSON.stringify(results, null, 1));
} finally { await worker.pool.end(); }
