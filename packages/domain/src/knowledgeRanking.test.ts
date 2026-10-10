import { describe, expect, it } from "vitest";
import { fuseKnowledgeRanks, knowledgeLexicalQueries, knowledgeQueryTerms, knowledgeTitleTerms, withinKnowledgeBudget, type KnowledgePassage } from "./knowledgeRanking";
import { countKnowledgeTokens } from "@lobbystack/ai";

const passage = (id: string): KnowledgePassage => ({ chunkId: id, documentId: "document", title: "Management", content: "MNGT 10407", sourceUrl: "https://example.com/courses", sourceRevision: 2, sequence: 0 });

describe("knowledge ranking", () => {
  it("matches dotted and plain acronyms without splitting course identifiers", () => {
    expect(knowledgeQueryTerms("B.A.A. Management MNGT 10407")).toEqual(["baa", "management", "mngt", "10407"]);
    expect(knowledgeLexicalQueries(["baa", "management", "10407"])).toEqual({ any: "(baa | b.a.a) | management | 10407", all: "(baa | b.a.a) & management & 10407" });
  });
  it("does not rank conversational filler as website facts", () => {
    expect(knowledgeQueryTerms("Tell me about some available nursing programs you offer")).toEqual(["nursing", "programs"]);
  });
  it("promotes evidence found by both searches without duplicating it", () => {
    expect(fuseKnowledgeRanks([[passage("a"), passage("b")], [passage("b"), passage("c")]]).map(p => p.chunkId)).toEqual(["b", "a", "c"]);
  });
  it("corroborates a document even when the two indexes find different sections", () => {
    const overview = { ...passage("overview"), documentId: "program" };
    const requirements = { ...passage("requirements"), documentId: "program" };
    const unrelated = { ...passage("unrelated"), documentId: "archive" };
    expect(fuseKnowledgeRanks([[unrelated, requirements], [overview]])[0]?.documentId).toBe("program");
  });
  it("does not inflate scores for duplicate candidates within one index", () => {
    expect(fuseKnowledgeRanks([[passage("a"), passage("a")], [passage("b")]])).toHaveLength(2);
  });
  it("caps the number of passages", () => {
    expect(fuseKnowledgeRanks([Array.from({ length: 20 }, (_, i) => passage(String(i)))])).toHaveLength(6);
  });
  it("preserves French terms and exact identifier components", () => {
    expect(knowledgeQueryTerms("Quel est le numéro du cours de stratégie MNGT 10407 ?")).toEqual(["stratégie", "mngt", "10407"]);
  });
  it("drops Spanish, Serbian and elided French function words", () => {
    expect(knowledgeQueryTerms("¿Cuál es el precio de la limpieza dental?")).toEqual(["precio", "limpieza", "dental"]);
    expect(knowledgeQueryTerms("Koja je cena čišćenja zuba?")).toEqual(["cena", "čišćenja", "zuba"]);
    expect(knowledgeQueryTerms("Qu'est-ce que l'assurance couvre ?")).toEqual(["assurance", "couvre"]);
    expect(knowledgeQueryTerms("What are the")).toEqual([]);
  });
  it("budgets whole multilingual passages without cutting identifiers", () => {
    const budget = countKnowledgeTokens("éé\n");
    expect(withinKnowledgeBudget(["éé", "MNGT 10407"], budget, value => value)).toEqual(["éé"]);
    expect(withinKnowledgeBudget(["longer than budget ".repeat(100), "10407"], 5, value => value)).toEqual(["10407"]);
  });
  it("keeps capitalized identifiers that collide with another language's function words", () => {
    expect(knowledgeQueryTerms("What is your PO number?")).toEqual(["po"]);
    expect(knowledgeQueryTerms("Do you deliver to LA?")).toEqual(["deliver", "la"]);
    expect(knowledgeQueryTerms("where is la clinique")).toEqual(["clinique"]);
    expect(knowledgeQueryTerms("WHAT IS YOUR PO NUMBER")).toEqual([]);
  });
});

it("ranks a named subject ahead of general delivery and requirement words", () => {
  expect(knowledgeTitleTerms(knowledgeQueryTerms("Do you offer online ed2go courses?"))).toEqual(["ed2go"]);
  expect(knowledgeTitleTerms(knowledgeQueryTerms("What do you learn in Anatomy and Physiology 1?"))).toEqual(["anatomy", "physiology", "1"]);
  expect(knowledgeTitleTerms(knowledgeQueryTerms("What nursing programs do you offer?"))).toEqual(["nursing"]);
  expect(knowledgeTitleTerms(["online", "courses"])).toEqual(["online", "courses"]);
});

it("keeps another source's answer when repeated headings dominate both indexes", () => {
  const headings = Array.from({ length: 8 }, (_, i) => ({ ...passage(`heading-${i}`), content: "Human Anatomy & Physiology 1" }));
  const answer = { ...passage("description"), documentId: "complete-course", content: "You will explore the human body and physiological functions." };
  const result = fuseKnowledgeRanks([[...headings, answer], headings]);
  expect(result).toHaveLength(6);
  expect(result.some(p => p.chunkId === answer.chunkId)).toBe(true);
});
