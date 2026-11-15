import { expect, it } from "vitest";
import { answerCourseCatalogue, parseCourseCatalogue, type CatalogueEntry } from "./courseCatalogue";

const entries: CatalogueEntry[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ title: `Health Program ${String(i + 1).padStart(2, "0")}`, url: `https://college.test/programs/health-${i}`, kind: "program" as const, categories: ["Health & Human Services"] })),
  { title: "Business Certificate", url: "https://college.test/programs/business", kind: "program", categories: ["Business"] },
  { title: "Accounting", code: "ACCT 105", url: "https://college.test/courses/accounting", kind: "course", categories: ["Business"] },
  { title: "NFPA 1140", url: "https://training.test/product?catalog=NFPA1140-1", kind: "short_course", categories: ["Safety"] },
];
const answer = (question: string, history: Array<{ role: "user" | "assistant"; content: string }> = [], source = entries) => answerCourseCatalogue(source, { question, history, businessName: "Suncrest College" });
const text = (q: string, history: Array<{ role: "user" | "assistant"; content: string }> = []) => {
  const result = answer(q, history); expect(result?.kind).toBe("answer");
  if (result?.kind !== "answer") throw new Error("Expected catalogue answer");
  return result;
};

it.each([
  "Okay, what other interesting courses are there that I can study at Suncrest?",
  "Can you tell me the list of courses that Suncrest offers?",
  "What courses do you offer?",
  "What courses can I take at Suncrest?",
  "What can I study at Suncrest?",
  "What courses do you have to offer?",
  "What courses would I be able to study?",
  "What courses are currently available?",
])("answers the real broad request without an embedding or generated guess: %s", q => {
  const result = text(q);
  expect(result.answer).toContain("Showing entries 1 to 8 of 15");
  expect(result.answer).toContain("Business Certificate");
  expect(result.answer).toContain("Catalogue listings do not confirm open enrolment");
  expect(result.sources).toHaveLength(8);
  expect(result.sources.every(url => entries.some(e => e.url === url))).toBe(true);
});

it("keeps category and pagination across long conversations using the last page, then resets for a new broad question", () => {
  const first = text("What health courses do you have?");
  expect(first.answer).toContain("Health & Human Services. Showing entries 1 to 8 of 12");
  expect(first.answer).not.toContain("Business Certificate");
  const history = [{ role: "assistant" as const, content: first.answer }];
  const second = text("Show more", history);
  expect(second.answer).toContain("Showing entries 9 to 12 of 12");
  expect(second.answer).not.toContain("Health Program 01");
  expect(text("Can you show me more Health courses?", history).answer).toContain("Showing entries 9 to 12 of 12");
  expect(answer("Show more architecture courses", history)).toBeNull();
  expect(text("Show more Business courses", history).answer).toContain("Business. Showing entries 1 to 2 of 2");
  history.push({ role: "assistant", content: second.answer });
  expect(text("More", history).answer).toContain("end of this published list");
  expect(text("Can you tell me the list of courses that Suncrest offers?", history).answer).toContain("All areas. Showing entries 1 to 8 of 15");
});

it("offers published categories and accepts a short category follow-up", () => {
  const menu = text("What categories do you have?");
  expect(menu.answer).toContain("Business; Health & Human Services; Safety");
  const business = text("Business", [{ role: "assistant", content: menu.answer }]);
  expect(business.answer).toContain("Business Certificate");
  expect(business.answer).toContain("Accounting (ACCT 105)");
  expect(business.answer).not.toContain("Health Program");
});

it("filters individual courses without losing the selected category", () => {
  const business = text("Show me Business courses");
  const only = text("Only individual courses", [{ role: "assistant", content: business.answer }]);
  expect(only.answer).toContain("Published courses — Business");
  expect(only.answer).toContain("Accounting (ACCT 105)");
  expect(only.answer).not.toContain("Business Certificate");
});

it("resolves an ordinal detail follow-up from a currently indexed item, without trusting old answer facts", () => {
  const first = text("Show me Business courses");
  const history = [{ role: "assistant" as const, content: first.answer }];
  expect(answer("What are the requirements for the first one?", history)).toEqual({ kind: "question", question: "What are the requirements for Business Certificate?", sourceUrl: "https://college.test/programs/business" });
  expect(answer("What are the requirements for the first one?", history, [])).toBeNull();
});

it.each(["What are the Practical Nursing fees?", "What electrician courses do you have available?", "What architecture courses do you offer?", "What Business Management courses do you offer?", "Show health courses and guarantee admission", "More"])("leaves unsupported subjects and detail questions on their existing verified path: %s", q => {
  expect(answer(q)).toBeNull();
});

it("uses curriculum links for categories, excludes navigation, and retains exact course codes", () => {
  const parsed = parseCourseCatalogue([
    { title: "College - Nursing", url: "https://college.test/programs/nursing", text: '# Practical Nursing\n[Health & Human Services](https://college.test/interest/health)\n[Learn More](https://college.test/interest/safety)\n[ANAT100](https://college.test/courses/anatomy "Anatomy")' },
    { title: "\n      College  - Anatomy", url: "https://college.test/courses/anatomy", text: "ANAT 100\nPublished curriculum course" },
    { title: "CPR", url: "https://training.test/product?catalog=CPR", text: "# First Aid\n[Safety](https://training.test/catalog?pagename=Safety)" },
    { title: "Physical product", url: "https://college.test/product?catalog=shirt", text: "A shirt with no course breadcrumb" },
  ]);
  expect(parsed).toHaveLength(3);
  expect(parsed[0]?.categories).toEqual(["Health & Human Services"]);
  expect(parsed[1]).toMatchObject({ title: "Anatomy", code: "ANAT 100", categories: ["Health & Human Services"] });
  expect(parsed[2]).toMatchObject({ title: "First Aid", kind: "short_course", categories: ["Safety"] });
});

it("supports French catalogue questions and continuation while preserving published titles", () => {
  const first = answerCourseCatalogue(entries, { question: "Quels cours proposez-vous ?", businessName: "Suncrest College", locale: "fr" });
  expect(first?.kind).toBe("answer");
  if (first?.kind !== "answer") throw new Error("Expected French catalogue answer");
  expect(first.answer).toContain("Entrées 1 à 8 sur 15");
  const next = answerCourseCatalogue(entries, { question: "La suite", history: [{ role: "assistant", content: first.answer }], businessName: "Suncrest College", locale: "fr" });
  expect(next).toMatchObject({ kind: "answer", answer: expect.stringContaining("Entrées 9 à 15 sur 15") });
});

it("accepts a category after an interrupted voice list and does not carry pagination across a topic switch", () => {
  const interrupted = [{ role: "assistant" as const, content: "Published catalogue, all areas, showing entries one to five. [interrupted]" }];
  expect(text("Health", interrupted).answer).toContain("Health & Human Services");
  expect(text("More", interrupted).answer).toContain("Showing entries 1 to 8");
  const list = text("What courses do you offer?");
  expect(answer("More", [{ role: "assistant", content: list.answer }, { role: "user", content: "What are Nursing fees?" }, { role: "assistant", content: "The published tuition is $16,500." }])).toBeNull();
});

it("does not interpret function words in published categories as category selections", () => {
  const source: CatalogueEntry[] = [...entries, { title: "Skills Assessment", url: "https://college.test/programs/skills", kind: "program", categories: ["Skills for Success"] }];
  const page = answerCourseCatalogue(source, { question: "Show Business programs", businessName: "Suncrest College" });
  if (page?.kind !== "answer") throw new Error("Expected Business page");
  expect(answerCourseCatalogue(source, { question: "What are the requirements for the first one?", businessName: "Suncrest College", history: [{ role: "assistant", content: page.answer }] })).toEqual({ kind: "question", question: "What are the requirements for Business Certificate?", sourceUrl: "https://college.test/programs/business" });
});


it("prioritizes the selected area when a voice tool carries the original category question forward", () => {
  const menu = text("What categories of courses does Suncrest offer?");
  const business = text("What categories of courses does Suncrest offer? Business courses.", [{ role: "assistant", content: menu.answer }]);
  expect(business.answer).toContain("Business. Showing entries 1 to 2 of 2");
  expect(business.answer).not.toContain("Published areas:");
  const first = text("What categories of courses does Suncrest offer? Health courses.");
  const next = text("What categories of courses does Suncrest offer? Health courses. Show more.", [{ role: "assistant", content: first.answer }]);
  expect(next.answer).toContain("Showing entries 9 to 12 of 12");
});


it("starts fresh for the user's broad interesting-courses question after a filtered page", () => {
  const business = text("Business courses please");
  const reset = text("Okay, what other interesting courses are there that I can study at Suncrest?", [{ role: "assistant", content: business.answer }]);
  expect(reset.answer).toContain("All areas. Showing entries 1 to 8 of 15");
});
