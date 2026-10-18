// Local-only V2 audit: Suncrest program pages in the loopback test database,
// answered by the real model through answerGroundedQuestion.
import { readFile, writeFile } from "node:fs/promises";
const R = "/Users/cec-mac/kai-projs/suncrest-lobbystack";
const { businesses, createDatabaseClient } = await import(`${R}/packages/db/src/index.ts`);
const { chunkText, indexDocumentText, upsertWebsiteDocument, normalizeWebsiteSourceUrl, loadProgramCatalog } = await import(`${R}/packages/domain/src/index.ts`);
const { createEmbeddingProvider } = await import(`${R}/packages/providers/src/index.ts`);
const { createAgentModel, answerGroundedQuestion } = await import(`${R}/packages/agent-core/src/index.ts`);
const { websiteKnowledgeText } = await import(`${R}/apps/worker/src/websiteText.ts`);

for (const key of ["DATABASE_URL", "LOBBYSTACK_WORKER_DATABASE_URL"]) {
  const url = new URL(process.env[key]!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/suncrest_v2_test") throw new Error(`${key} is not the local test database`);
}
const SCRATCH = process.argv[2]!;
const businessId = "00000000-0000-4000-8000-00000000c011";
const migrator = createDatabaseClient("lobbystack_migrator", { ...process.env });
const worker = createDatabaseClient("lobbystack_worker", { ...process.env });
const embeddings = createEmbeddingProvider();
if (!embeddings) throw new Error("Embedding provider missing");
const domain = { db: worker.db, embeddings };
try {
  await migrator.db.insert(businesses).values({ id: businessId, slug: "suncrest-v2-local", name: "Suncrest College", timezone: "America/Regina", businessType: "education", defaultLocale: "en", telemetryEnabled: false }).onConflictDoNothing();
  if ((await loadProgramCatalog(domain, { businessId })).length < 99) {
    const pages = JSON.parse(await readFile(`${SCRATCH}/data/programs.json`, "utf8"));
    for (const page of pages) {
      const sourceUrl = normalizeWebsiteSourceUrl(page.metadata.sourceURL);
      const text = websiteKnowledgeText(sourceUrl, page.markdown);
      const vectors = await embeddings.embed(chunkText(text));
      const documentId = await upsertWebsiteDocument(domain, { businessId, sourceUrl, title: page.metadata.title ?? sourceUrl });
      await indexDocumentText(domain, { businessId, documentId, text, embeddings: vectors, ...(embeddings.fingerprint ? { embeddingFingerprint: embeddings.fingerprint } : {}) });
    }
  }
  console.log(`catalog pages: ${(await loadProgramCatalog(domain, { businessId })).length}`);
  const model = createAgentModel({ ...process.env, AI_CHAT_REASONING_EFFORT: "low" });
  if (!model) throw new Error("Model unavailable");
  const snapshot = { businessId, displayName: "Suncrest College", defaultLocale: "en", timezone: "America/Regina" };
  const followUp = [{ role: "user", content: "Is the Continuing Care Assistant program offered in Melfort?" }, { role: "assistant", content: "Yes, part-time courses run in Melfort." }];
  const cases: Array<{ question: string; history?: typeof followUp }> = [
    { question: "Which campuses offer Practical Nursing?" },
    { question: "When does Practical Nursing start in Melfort?" },
    { question: "What are the requirements for the Practical Nursing program in Yorkton?" },
    { question: "Where can I take the continuing care assistant program?" },
    { question: "What about Canora?", history: followUp },
    { question: "What are the admission requirements for Medical Lab Assistant?" },
    { question: "What semester does the Medical Laboratory Assistant program start?" },
    { question: "What are the requirements for the welding program?" },
    { question: "Is the electrician program offered in Melville?" },
    { question: "What programs are available at the Nipawin campus?" },
    { question: "What programs start in Fall 2027?" },
    { question: "What health programs are offered in Yorkton?" },
    { question: "How much is Practical Nursing in Yorkton?" },
    { question: "What is the tuition for Practical Nursing in Melfort?" },
    { question: "What is the application fee for Practical Nursing in Yorkton?" },
    { question: "What is the cost of books for Practical Nursing in Yorkton?" },
    { question: "What are the fees for Practical Nursing in Melfort?" },
    { question: "What is the tuition refund policy for Practical Nursing in Yorkton?" },
    { question: "Which campuses offer Practical Nursing and Welding?" },
    { question: "How much is SPCR 105 for CCA in Melfort?" },
    { question: "What nursing programs do you offer?" },
    { question: "Do you offer an architecture program?" },
    { question: "Can you guarantee me admission?" },
  ];
  const results = [];
  for (const test of cases) {
    const started = performance.now();
    let result;
    try {
      result = await answerGroundedQuestion({ model, context: { domain, snapshot, channel: "web_voice" }, question: test.question, ...(test.history ? { history: test.history } : {}) });
    } catch (error) {
      result = { error: error instanceof Error ? `${error.name}: ${error.message.slice(0, 160)}` : "failed" };
    }
    const ms = Math.round(performance.now() - started);
    results.push({ ...test, result, ms });
    console.log(`\nQ: ${test.question}\n[${"outcome" in result ? result.outcome : "error"}, ${ms} ms] ${"answer" in result ? result.answer : result.error}\n   ${"sources" in result ? result.sources.join(" ") : ""}`);
  }
  await writeFile(`${SCRATCH}/evidence/live-answer-audit.json`, JSON.stringify(results, null, 1));
} finally {
  await Promise.all([migrator.pool.end(), worker.pool.end()]);
}
