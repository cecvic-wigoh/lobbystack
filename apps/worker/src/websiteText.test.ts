import { describe, expect, it, vi } from "vitest";
import { websiteKnowledgeText, websitePageText } from "./websiteText";

describe("Suncrest public website text", () => {
  const course = "# A+ Cisco IT Essentials 1\n\nCRN: CNET-113\n\n4.00 CEU\n\n60.00 Hours\n\nYou will install personal computer hardware using safe lab procedures.";
  const wizard = "\n\nBack\n\nPrint Application Form\n\n\n##### Application Timeline\n\n1\n\nCreate an Account\n\n###### Application Complete\n\nThere is no fee tied to this application. We have received your payment successfully.";
  it("keeps course facts but excludes hidden application completion and payment messages", () => {
    expect(websiteKnowledgeText("https://suncrestcollege.ca/courses/a-cisco-it-essentials-1", course + wizard)).toBe(course);
  });
  it("preserves published application instructions without the exact hidden-wizard signature", () => {
    const admissions = "# How to apply\n\nApplication Timeline\n\nA non-refundable application fee of $60.00 is required.";
    expect(websiteKnowledgeText("https://suncrestcollege.ca/admissions", admissions)).toBe(admissions);
  });
  it("does not apply Suncrest-specific cleanup to other businesses", () => {
    expect(websiteKnowledgeText("https://another-college.test/course", course + wizard)).toBe(course + wizard);
  });
});

vi.mock("./documentExtraction", () => ({ extractDocumentText: vi.fn(async () => "# Annual Research Report 2013\nPublished historical research findings.") }));

it("extracts saved PDF bytes while preserving the historical year", async () => {
  const text = await websitePageText({ url: "https://suncrestcollege.ca/report.pdf", rawBase64: Buffer.from("%PDF-1.7\nfixture").toString("base64") });
  expect(text).toContain("Annual Research Report 2013");
});
it("rejects non-PDF file bytes rather than indexing an error response as evidence", async () => {
  await expect(websitePageText({ url: "https://suncrestcollege.ca/report.pdf", rawBase64: Buffer.from("Access denied").toString("base64") })).rejects.toThrow("not a PDF");
});
it("does not treat raw image bytes as website knowledge", async () => {
  expect(await websitePageText({ url: "https://suncrestcollege.ca/photo.png", rawBase64: "AAAA" })).toBe("");
});
