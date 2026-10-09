import { beforeEach, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { searchKnowledgeEvidence } from "@lobbystack/domain";
import { answerGroundedQuestion, validateGroundedAnswer } from "./groundedAnswer";
vi.mock("@lobbystack/domain", () => ({ searchKnowledgeEvidence: vi.fn() }));
vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), generateText: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const evidence = [{ chunkId: "contact", sourceUrl: "https://college.test/contact", content: "Admissions: admissions@college.test. Call 306-555-1234 for program applications." }];
const claim = { text: "Call 306-555-1234 for program applications.", sourceId: "contact", quote: "Call 306-555-1234 for program applications." };
it("returns verified claims with the actual source URL", () => {
 expect(validateGroundedAnswer({ status: "supported", claims: [claim] }, evidence, "en")).toEqual({ answer: claim.text, sources: [evidence[0]!.sourceUrl], outcome: "supported" });
});
it.each([
 { ...claim, sourceId: "invented" },
 { ...claim, quote: "Guaranteed admission and free tuition." },
 { ...claim, text: "Call 306-555-9876 for guaranteed admission." },
 { ...claim, text: "Email invented@college.test." },
])("refuses unverified evidence or altered contacts: %j", bad => {
 expect(validateGroundedAnswer({ status: "supported", claims: [bad] }, evidence, "en").outcome).toBe("unknown");
});
it("does not let an unrelated answer pass even when it supplies a valid quote", () => {
 expect(validateGroundedAnswer({ status: "out_of_scope", claims: [claim] }, evidence, "en")).toMatchObject({ outcome: "out_of_scope", sources: [] });
});
it("abstains when evidence is absent", () => {
 expect(validateGroundedAnswer({ status: "supported", claims: [claim] }, [], "en").outcome).toBe("unknown");
});
it("asks for the campus rather than inventing a location", () => {
 expect(validateGroundedAnswer({ status: "clarify_campus", claims: [] }, evidence, "en")).toMatchObject({ answer: "Which campus are you asking about?", outcome: "clarification" });
});
it("keeps a verified contact while disclosing that other details are missing", () => {
 const result = validateGroundedAnswer({ status: "partial", claims: [claim] }, evidence, "en");
 expect(result.answer).toContain(claim.text);
 expect(result.answer).toContain("can't confirm the remaining details");
 expect(result.sources).toEqual([evidence[0]!.sourceUrl]);
});

it("handles greetings without inventing facts or doing a knowledge search", async () => {
 const result = await answerGroundedQuestion({ model: {} as never, context: { domain: {} as never, snapshot: { defaultLocale: "en" } as never } as never, question: "Hello!" });
 expect(result).toMatchObject({ outcome: "greeting", sources: [] });
});
it("clarifies an unspecified college location before choosing a campus", async () => {
 const result = await answerGroundedQuestion({ model: {} as never, context: { domain: {} as never, snapshot: { displayName: "Suncrest College", defaultLocale: "en" } as never } as never, question: "Where is Suncrest College located?" });
 expect(result).toMatchObject({ outcome: "clarification", answer: "Which campus are you asking about?" });
});

const context = { domain: {}, snapshot: { businessId: "college", displayName: "College", defaultLocale: "en" } } as never;
const admissionsHistory = [
 { role: "user" as const, content: "Who should I contact about admission to College?" },
 { role: "assistant" as const, content: "Contact admissions@college.test." },
 { role: "user" as const, content: "Who should I contact about admission to College?" },
 { role: "assistant" as const, content: "Contact admissions@college.test." },
];
function mockAnswer(claim: { text: string; sourceId: string; quote: string }) {
 vi.mocked(generateText).mockResolvedValueOnce({ output: { status: "supported", claims: [claim] } } as never)
  .mockResolvedValueOnce({ output: { supported: true } } as never);
}
it("answers a new courses question without carrying over repeated admissions intent", async () => {
 const catalog = { chunkId: "catalog", sourceUrl: "https://college.test/programs", content: "Area of Interest: Business, Health, Trades." };
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: [catalog] } as never);
 mockAnswer({ text: "The catalogue lists areas including Business, Health, and Trades.", sourceId: "catalog", quote: catalog.content });
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "what courses do you offer", history: admissionsHistory });
 expect(result).toMatchObject({ outcome: "supported", sources: [catalog.sourceUrl] });
 const searches = vi.mocked(searchKnowledgeEvidence).mock.calls.map(call => call[1]);
 expect(searches).toHaveLength(2);
 expect(searches[0]!.query).toBe("what courses do you offer");
 expect(searches[1]!.sourcePath).toBe("/programs");
 for (const [request] of vi.mocked(generateText).mock.calls) expect(JSON.parse(request.prompt as string).conversation).toEqual([]);
});
it("keeps admissions context when a caller asks for their email", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 mockAnswer({ text: "The admissions email is admissions@college.test.", sourceId: "contact", quote: evidence[0]!.content });
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "What is their email?", history: admissionsHistory });
 expect(result).toMatchObject({ outcome: "supported", sources: [evidence[0]!.sourceUrl] });
 expect(vi.mocked(searchKnowledgeEvidence).mock.calls[0]![1].query).toContain("Previous question: Who should I contact about admission");
 expect(JSON.parse(vi.mocked(generateText).mock.calls[0]![0].prompt as string).conversation).toEqual(admissionsHistory);
});
it("keeps the location question when a caller supplies a campus clarification", async () => {
 const campus = { chunkId: "campus", sourceUrl: "https://college.test/campuses", content: "Yorkton campus: 200 Prystai Way." };
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: [campus] } as never);
 mockAnswer({ text: "Yorkton campus is at 200 Prystai Way.", sourceId: "campus", quote: campus.content });
 const history = [{ role: "user" as const, content: "Where is College located?" }, { role: "assistant" as const, content: "Which campus are you asking about?" }];
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "Yorkton", history });
 expect(result.outcome).toBe("supported");
 expect(vi.mocked(searchKnowledgeEvidence).mock.calls[0]![1].query).toMatch(/Previous question: Where is\s+located/);
});

it("uses the actual retrieved catalogue passage when the model reformats a quotation", async () => {
 const catalog = { chunkId: "catalog", sourceUrl: "https://college.test/programs", content: "Area of Interest\n- **Business**\n- **Health**\n- **Trades**" };
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: [catalog] } as never);
 mockAnswer({ text: "The catalogue lists Business, Health, and Trades areas.", sourceId: "catalog", quote: "Business, Health, Trades" });
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "what courses do you offer" });
 expect(result).toMatchObject({ outcome: "supported", sources: [catalog.sourceUrl] });
 expect(JSON.parse(vi.mocked(generateText).mock.calls[1]![0].prompt as string).claims[0].quote).toBe(catalog.content);
});
it("still rejects an unsupported claim after replacing its fabricated quotation with the real source", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 vi.mocked(generateText).mockResolvedValueOnce({ output: { status: "supported", claims: [{ text: "Admission is guaranteed.", sourceId: "contact", quote: "Admission is guaranteed." }] } } as never)
  .mockResolvedValueOnce({ output: { supported: false } } as never)
  .mockResolvedValueOnce({ output: { status: "supported", claims: [{ text: "Admission is guaranteed.", sourceId: "contact", quote: "Admission is guaranteed." }] } } as never)
  .mockResolvedValueOnce({ output: { supported: false } } as never);
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "Is admission guaranteed?" });
 expect(result).toMatchObject({ outcome: "unknown", reason: "unsupported_paraphrase", sources: [] });
});
it("does not repair citations to a nonexistent source", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 vi.mocked(generateText).mockResolvedValueOnce({ output: { status: "supported", claims: [{ ...claim, sourceId: "invented" }] } } as never);
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "Who handles admissions?" });
 expect(result).toMatchObject({ outcome: "unknown", reason: "quote_mismatch" });
 expect(generateText).toHaveBeenCalledTimes(1);
});
it("does not accept an invented contact through citation repair", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 vi.mocked(generateText).mockResolvedValue({ output: { status: "supported", claims: [{ text: "Call 306-555-9876.", sourceId: "contact", quote: "Call 306-555-9876." }] } } as never);
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "What is the admissions phone number?" });
 expect(result).toMatchObject({ outcome: "unknown", reason: "detail_mismatch" });
 expect(generateText).toHaveBeenCalledTimes(2);
});

it("rechecks a narrower second draft after factual verification rejects the first", async () => {
 const catalog = { chunkId: "catalog", sourceUrl: "https://college.test/programs", content: "Area of Interest: Business, Health, Trades." };
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: [catalog] } as never);
 vi.mocked(generateText).mockResolvedValueOnce({ output: { status: "supported", claims: [{ text: "Business registration is open.", sourceId: "catalog", quote: catalog.content }] } } as never)
  .mockResolvedValueOnce({ output: { supported: false } } as never)
  .mockResolvedValueOnce({ output: { status: "supported", claims: [{ text: "The catalogue lists Business, Health, and Trades areas.", sourceId: "catalog", quote: catalog.content }] } } as never)
  .mockResolvedValueOnce({ output: { supported: true } } as never);
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "Which programs are available?" });
 expect(result).toMatchObject({ outcome: "supported", answer: "The catalogue lists Business, Health, and Trades areas." });
 expect(generateText).toHaveBeenCalledTimes(4);
 expect(searchKnowledgeEvidence).toHaveBeenCalledTimes(2);
 expect(JSON.parse(vi.mocked(generateText).mock.calls[2]![0].prompt as string).correction).toContain("without implying current registration availability");
});

it("keeps a safe refusal if the single verification retry times out", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 vi.mocked(generateText).mockResolvedValueOnce({ output: { status: "supported", claims: [claim] } } as never)
  .mockResolvedValueOnce({ output: { supported: false } } as never)
  .mockRejectedValueOnce(new Error("timeout"));
 expect(await answerGroundedQuestion({ model: {} as never, context, question: "Who handles admissions?" })).toMatchObject({ outcome: "unknown", reason: "unsupported_paraphrase", sources: [] });
 expect(generateText).toHaveBeenCalledTimes(3);
});

it("retrieves a catalogue for a natural broad program inquiry and a directory for campuses", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: [] } as never);
 vi.mocked(generateText).mockResolvedValue({ output: { status: "unknown", claims: [] } } as never);
 await answerGroundedQuestion({ model: {} as never, context, question: "Can you tell me about some of the programs available at College?" });
 expect(vi.mocked(searchKnowledgeEvidence).mock.calls.some(([, input]) => input.sourcePath === "/programs")).toBe(true);
 vi.mocked(searchKnowledgeEvidence).mockClear();
 await answerGroundedQuestion({ model: {} as never, context, question: "What campuses are available for College?" });
 expect(vi.mocked(searchKnowledgeEvidence).mock.calls.some(([, input]) => input.sourcePath === "/contact-us")).toBe(true);
});

it("checks factual claims before using them to name program alternatives", () => {
 expect(validateGroundedAnswer({ status: "clarify_program", claims: [claim] }, evidence, "en").answer).toContain("Which program");
 expect(validateGroundedAnswer({ status: "clarify_program", claims: [{ ...claim, text: "Call 999-555-0000." }] }, evidence, "en").outcome).toBe("unknown");
});

it("retries a number-format mismatch once without weakening factual checks", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 vi.mocked(generateText).mockResolvedValueOnce({ output: { status: "supported", claims: [{ ...claim, text: "Call 1-306-555-1234 for program applications." }] } } as never);
 mockAnswer(claim);
 expect(await answerGroundedQuestion({ model: {} as never, context, question: "Who can I contact?" })).toMatchObject({ outcome: "supported", answer: claim.text });
 expect(vi.mocked(generateText)).toHaveBeenCalledTimes(3);
});

it("retries one timed-out draft within the existing time budget", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 vi.mocked(generateText).mockRejectedValueOnce(Object.assign(new Error("provider deadline"), { name: "TimeoutError" }));
 mockAnswer(claim);
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "Who handles applications?" });
 expect(result).toMatchObject({ outcome: "supported", answer: claim.text });
 expect(generateText).toHaveBeenCalledTimes(3);
 expect(vi.mocked(generateText).mock.calls[1]![0].timeout).toBe(4000);
});

it("returns a source-derived campus directory without a model deadline", async () => {
 const outline = { chunkId: "outline:contact:3", sourceUrl: "https://college.test/contact-us", content: "## Contact Us\n##### For Admissions\n## Campuses\n### Canora\n### Yorkton (TTC)\n## Services\n### Library" };
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: [outline] } as never);
 const result = await answerGroundedQuestion({ model: {} as never, context, question: "What campuses are available for College?" });
 expect(result).toMatchObject({ outcome: "supported", answer: "The published campuses and buildings are: Canora, Yorkton (TTC).", sources: [outline.sourceUrl] });
 expect(generateText).not.toHaveBeenCalled();
});

it("uses business guidance without college lookups for a non-college client", async () => {
 vi.mocked(searchKnowledgeEvidence).mockResolvedValue({ matches: evidence } as never);
 mockAnswer(claim);
 await answerGroundedQuestion({ model: {} as never, context: { domain: {}, snapshot: { businessId: "certnova", displayName: "CertNova", defaultLocale: "en" } } as never, question: "Who can help with my application?" });
 expect(searchKnowledgeEvidence).toHaveBeenCalledTimes(1);
 expect(vi.mocked(generateText).mock.calls[0]![0].instructions).toContain("this business's published information");
 expect(vi.mocked(generateText).mock.calls[0]![0].instructions).not.toContain("nursing programs");
 expect(validateGroundedAnswer({ status: "unknown", claims: [] }, [], "en").answer).not.toContain("college");
});

it.each([
 ["What services do you offer?", "/services"],
 ["How is CBAPro different from CBAReview?", "/pricing"],
 ["How much does CBAReview cost?", "/pricing"],
])("retrieves the published business overview for %s", async (question, sourcePath) => {
 const overview = { chunkId: "overview", sourceUrl: `https://business.test${sourcePath}`, content: "Published service details." };
 vi.mocked(searchKnowledgeEvidence).mockImplementation(async (_domain, input) => ({ matches: input.sourcePath ? [overview] : [] }) as never);
 mockAnswer({ text: overview.content, sourceId: overview.chunkId, quote: overview.content });
 await answerGroundedQuestion({ model: {} as never, context: { domain: {}, snapshot: { businessId: "business", displayName: "Business", defaultLocale: "en" } } as never, question });
 expect(vi.mocked(searchKnowledgeEvidence).mock.calls.some(([, input]) => input.sourcePath === sourcePath)).toBe(true);
 const prompt = JSON.parse(vi.mocked(generateText).mock.calls[0]![0].prompt as string);
 expect(prompt.passages).toContainEqual(expect.objectContaining({ sourceId: overview.chunkId }));
 if (question.includes("CBAPro")) expect(vi.mocked(searchKnowledgeEvidence).mock.calls[0]![1].query).toContain("CBA Pro");
});
