// Replays client-style program, campus and semester questions against the
// program catalog parsed from an exported Firecrawl `{data: [...]}` file.
// Usage: tsx scripts/operations/suncrest-catalog-eval.ts <export.json> [YYYY-MM-DD]
// Expectations were checked against the 10 October 2026 program-page export.
import { readFile } from "node:fs/promises";
import { answerProgramCatalogQuestion, chunkText, parseProgramPage } from "../../packages/domain/src/index";
import { websiteKnowledgeText } from "../../apps/worker/src/websiteText";

type Case = {
  question: string;
  previousQuestion?: string;
  // "answer": catalog replies directly; "evidence": passages go to grounded answering; null: page retrieval handles it.
  kind: "answer" | "evidence" | null;
  includes?: string[];
  excludes?: string[];
};

const cases: Case[] = [
  { question: "Which campuses offer Practical Nursing?", kind: "answer", includes: ["Yorkton, Winter 2028", "Melfort, Winter 2027", "April 30, 2027"] },
  { question: "When does Practical Nursing start in Melfort?", kind: "answer", includes: ["Melfort, Winter 2027", "February 2027"], excludes: ["Yorkton"] },
  { question: "What are the requirements for the Practical Nursing program in Yorkton?", kind: "evidence", includes: ["Practical Nursing", "65%", "Yorkton, Winter 2028"] },
  { question: "Where can I take the continuing care assistant program?", kind: "answer", includes: ["Esterhazy", "Canora", "Fort Qu'Appelle", "Melfort", "Nipawin", "Tisdale", "Yorkton", "Online"] },
  { question: "Is CCA offered in Melfort?", kind: "answer", includes: ["Continuing Care Assistant (Part-Time) - Melfort", "Winter 2027"], excludes: ["Canora"] },
  { question: "What about Canora?", previousQuestion: "Is CCA offered in Melfort?", kind: "answer", includes: ["Canora"], excludes: ["Melfort"] },
  { question: "What are the requirements for Continuing Care Assistant?", kind: "evidence", includes: ["Grade 12"] },
  { question: "What semester does the Medical Laboratory Assistant program start?", kind: "answer", includes: ["Yorkton, Fall 2027", "August 26, 2027"] },
  { question: "What are the admission requirements for Medical Lab Assistant?", kind: "evidence", includes: ["Medical Laboratory Assistant", "70%"] },
  { question: "Which campus has the Primary Care Paramedic program?", kind: "answer", includes: ["Tisdale", "Melville, Fall 2027"] },
  { question: "When is the application deadline for Diagnostic Medical Sonography?", kind: "answer", includes: ["February 15, 2027"] },
  { question: "Do you offer welding in Yorkton?", kind: "answer", includes: ["Welding", "Yorkton (TTC), Fall 2027"] },
  { question: "What are the requirements for the welding program?", kind: "evidence", includes: ["Welding"] },
  { question: "Is the electrician program offered in Melville?", kind: "answer", includes: ["couldn't find", "Nipawin"] },
  { question: "Can I study Early Childhood Education online?", kind: "answer", includes: ["couldn't find", "online", "Yorkton"] },
  { question: "What programs are available at the Nipawin campus?", kind: "answer", includes: ["Industrial Mechanics", "Continuing Care Assistant"] },
  { question: "What programs start in Fall 2027?", kind: "answer", includes: ["Medical Laboratory Assistant", "Continuing Care Assistant"] },
  { question: "What health programs are offered in Yorkton?", kind: "answer", includes: ["Practical Nursing", "Medical Laboratory Assistant"], excludes: ["Business", "Welding"] },
  { question: "What business programs are at Tisdale?", kind: "answer", includes: ["Business Certificate", "Tisdale, Fall 2027"] },
  { question: "What programs are offered online?", kind: "answer", includes: ["Continuing Care Assistant", "Office Administration"] },
  // Tuition differs by campus; Melfort's fee table ($16,000.00 total) must not answer for Yorkton.
  { question: "How much is Practical Nursing in Yorkton?", kind: "answer", includes: ["Yorkton, Winter 2028", "$15,500.00"], excludes: ["Melfort", "16,000"] },
  // Melfort's intake ($15,000.00) and its prior-year fee table ($16,000.00) must both be stated, not reconciled.
  { question: "What is the tuition for Practical Nursing in Melfort?", kind: "answer", includes: ["Melfort, Winter 2027", "$15,000.00", "Tuition (total) $16,000.00", "based on last year's program", "confirm the current amount"], excludes: ["Yorkton"] },
  // Other charges ground on that campus intake's fee table; money policies use the policy pages.
  { question: "What is the application fee for Practical Nursing in Yorkton?", kind: "evidence", includes: ["Intake: Yorkton, Winter 2028", "Student Fee"], excludes: ["Fees (per year)"] },
  { question: "What is the cost of books for Practical Nursing in Yorkton?", kind: "evidence", includes: ["Intake: Yorkton, Winter 2028", "Books and Supplies"], excludes: ["Melfort"] },
  { question: "What is the tuition refund policy for Practical Nursing in Yorkton?", kind: null },
  // Published fee tables are copied, with Melfort's two figures, the prior-year caveat and confirmation advice.
  { question: "What are the fees for Practical Nursing in Melfort?", kind: "answer", includes: ["Melfort, Winter 2027 fee table: Tuition (total): $16,000.00; Fees (per year): $700.00; Health & Dental Fee (per year): $252.00", "intake lists domestic tuition $15,000.00", "based on last year's program", "Please confirm the current amount"], excludes: ["Yorkton"] },
  { question: "What is the lab fee for Practical Nursing in Yorkton?", kind: "answer", includes: ["Lab/Shop Fee: $400.00"], excludes: ["Melfort", "Student Fee"] },
  { question: "What are the fees for Medical Laboratory Assistant?", kind: "answer", includes: ["Tuition (Domestic): $11,200.00", "Tuition (International): $22,000.00", "Materials/Textbooks: $625.00"] },
  { question: "How much is SPCR 105 for CCA in Melfort?", kind: "answer", includes: ["SPCR 105 Personal Care 2", "$702.00"], excludes: ["DEMC 100", "SPCR 101"] },
  // Two programs keep their own campuses.
  { question: "Which campuses offer Practical Nursing and Welding?", kind: "answer", includes: ["Practical Nursing: Yorkton (Winter 2028), Melfort (Winter 2027)", "Welding: Yorkton (TTC) (Fall 2027)", "Welding Applied Certificate: Tisdale"] },
  { question: "How much does the Medical Laboratory Assistant program cost?", kind: "answer", includes: ["Yorkton, Fall 2027", "$11,200.00", "$22,000.00"] },
  // Left to page retrieval: descriptions, unpublished programs and campus addresses.
  { question: "Tell me about the Electrician Applied Certificate", kind: null },
  { question: "Do you offer an architecture program?", kind: null },
  { question: "Where is the Yorkton campus?", kind: null },
  { question: "What nursing programs do you offer?", kind: null },
];

async function main() {
  const [path, date = "2026-10-18"] = process.argv.slice(2);
  if (!path) throw new Error("Pass the exported Firecrawl program pages file.");
  const payload = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(payload.data)) throw new Error("Expected Firecrawl page data.");
  // Store and rejoin text the way the indexer does, so parsing matches production.
  const catalog = payload.data
    .filter((page: { metadata?: { sourceURL?: string } }) => /\/programs\/[^/?#]+\/?$/.test(page.metadata?.sourceURL ?? ""))
    .map((page: { markdown?: string; metadata: { sourceURL: string; title?: string } }) => parseProgramPage({ url: page.metadata.sourceURL, title: page.metadata.title ?? "", text: chunkText(websiteKnowledgeText(page.metadata.sourceURL, page.markdown)).join("\n\n") }));
  const now = new Date(`${date}T12:00:00Z`);
  let failures = 0;
  for (const test of cases) {
    const result = answerProgramCatalogQuestion(catalog, { question: test.question, now, ...(test.previousQuestion ? { previousQuestion: test.previousQuestion } : {}) });
    const text = !result ? "" : result.kind === "answer" ? result.answer : result.passages.map(passage => passage.content).join("\n");
    const problems = [
      (result?.kind ?? null) !== test.kind ? `expected ${test.kind}, got ${result?.kind ?? null}` : "",
      ...(test.includes ?? []).filter(value => !text.includes(value)).map(value => `missing "${value}"`),
      ...(test.excludes ?? []).filter(value => text.includes(value)).map(value => `unexpected "${value}"`),
    ].filter(Boolean);
    if (problems.length) failures += 1;
    console.log(`${problems.length ? "FAIL" : "pass"}  ${test.question}${problems.length ? `\n      ${problems.join("; ")}` : ""}${result?.kind === "answer" ? `\n      → ${result.answer}` : ""}`);
  }
  console.log(`\n${cases.length - failures}/${cases.length} passed across ${catalog.length} program pages (${catalog.filter((entry: { intakes: unknown[] }) => entry.intakes.length).length} with published intakes).`);
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
