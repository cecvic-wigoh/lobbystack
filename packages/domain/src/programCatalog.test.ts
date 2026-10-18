import { describe, expect, it } from "vitest";

import { answerProgramCatalogQuestion, parseProgramPage, parsePublishedDate } from "./programCatalog";

// Trimmed from the two layouts suncrestcollege.ca uses for program pages.
const practicalNursing = parseProgramPage({
  url: "https://college.test/programs/practical-nursing-diploma",
  title: "Suncrest College - Practical Nursing",
  text: `[Program Index](https://college.test/programs) [Health & Human Services](https://college.test/interest/department-healthhumanservices) Practical Nursing

# Practical Nursing

### 2 Intake Options Available

Winter 2028Full-Time

##### Yorkton

Winter 2027Full-Time

##### Melfort

#### Yorkton

Full-Time

Winter 2028

Apply

**Application Deadline**April 30, 2027

**Start Date**February 28, 2028

**End Date**February 15, 2030

**Length**76 Weeks

**Domestic Tuition**$15,500.00

#### Additional Fees

## Tuition and Fees

| **\\*Tuition** | _$15,500.00_ |
| **\\*Student Fee** | _$100.00_ |

\\*Note: Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.

#### Courses

## Admission Requirements

This is a Competitive Entry program.

**Practical Nursing Admission Requirements**

- Grade 12 with a minimum overall score of 65% in the following four subjects:
  - 30-level English Language Arts
- English Language Proficiency

## Career Options

Licensed practical nurses work in hospitals.

#### Melfort

Full-Time

Winter 2027

**Application Deadline**April 30, 2026

**Start Date**February 2027

**End Date**February 16, 2029

**Domestic Tuition**$15,000.00

**International Tuition**$22,000.00

#### Additional Fees

## Tuition and Fees

| **\\*Tuition (total)** | _$16,000.00_ |
| **\\*Fees (per year)** | _$700.00_ |

\\*Note: Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.

#### Courses`,
});

const ccaMelfort = parseProgramPage({
  url: "https://college.test/programs/continuing-care-assistant-pt-3",
  title: "Suncrest College - Continuing Care Assistant (Part-Time) - Melfort",
  text: `# Continuing Care Assistant (Part-Time) - Melfort

DEMC 100

###### Melfort - DEMC 100-Dementia Care

Term:

Winter 2027 \\| Part-Time

Date:

Mar 10, 2027
\\- Apr 21, 2027

Schedule:

Tue & Wed (9:00am-3:00pm)

Location:

Melfort

Domestic Tuition:

$772.50

Capacity:

18

Register

SPCR 105

###### Melfort - SPCR 105-Personal Care 2

Term:

Fall 2025

Date:

Nov 17, 2025
\\- Dec 15, 2025

Location:

Melfort

Register

## Admission and / or Program Practicum Requirements

Grade 12 or equivalent

### Applying for Courses`,
});

const ccaYorkton = parseProgramPage({
  url: "https://college.test/programs/continuing-care-assistant-ft-3",
  title: "Suncrest College - Continuing Care Assistant (Full-Time) Fall 2027 Yorkton",
  text: `# Continuing Care Assistant (Full-Time) Fall 2027 Yorkton

### 1 Intake Option Available

#### Yorkton

Full-Time

Fall 2027

**Application Deadline**August 18, 2027

**Start Date**August 24, 2027

**End Date**May 2028

## Admission Requirements

Grade 12 with English Language Arts A30 and B30.

### 1 Intake Option Available`,
});

const welding = parseProgramPage({
  url: "https://college.test/programs/welding",
  title: "Suncrest College - Welding",
  text: `# Welding

### 1 Intake Option Available

#### Yorkton (TTC)

Full-Time

Fall 2027

**Length**16 Weeks

**Start Date**Fall 2027`,
});

const catalog = [practicalNursing, ccaMelfort, ccaYorkton, welding];
const now = new Date("2026-10-18T12:00:00Z");
const ask = (question: string, previousQuestion?: string) => answerProgramCatalogQuestion(catalog, { question, now, ...(previousQuestion ? { previousQuestion } : {}) });
const answer = (question: string, previousQuestion?: string) => {
  const result = ask(question, previousQuestion);
  return result?.kind === "answer" ? result.answer : undefined;
};

describe("parseProgramPage", () => {
  it("reads every intake of a full-time program, including tab-only campuses", () => {
    expect(practicalNursing).toMatchObject({ title: "Practical Nursing", area: "Health & Human Services" });
    expect(practicalNursing.intakes).toMatchObject([
      { campus: "Yorkton", term: "Winter 2028", commitment: "Full-Time", startDate: "February 28, 2028", endDate: "February 15, 2030", applicationDeadline: "April 30, 2027", length: "76 Weeks", domesticTuition: "$15,500.00", feeTableTuition: "Tuition $15,500.00" },
      { campus: "Melfort", term: "Winter 2027", commitment: "Full-Time", startDate: "February 2027", endDate: "February 16, 2029", applicationDeadline: "April 30, 2026", domesticTuition: "$15,000.00", internationalTuition: "$22,000.00", feeTableTuition: "Tuition (total) $16,000.00" },
    ]);
  });

  it("splits a combined domestic/international fee row", () => {
    const mla = parseProgramPage({ url: "https://college.test/programs/mla", title: "MLA", text: "# Medical Laboratory Assistant\n\n#### Yorkton\n\nFull-Time\n\nFall 2027\n\n**Domestic Tuition**$11,200.00\n\n#### Additional Fees\n\n| **\\*Tuition (Domestic)**<br>**(International)** | _$11,200.00_<br>_$22,000.00_ |\n| **\\*Materials/Textbooks** | _$625.00_ |\n\n#### Courses" });
    expect(answerProgramCatalogQuestion([mla], { question: "What are the fees for Medical Laboratory Assistant?", now })).toMatchObject({ kind: "answer", answer: "Medical Laboratory Assistant, Yorkton, Fall 2027 fee table: Tuition (Domestic): $11,200.00; Tuition (International): $22,000.00; Materials/Textbooks: $625.00." });
    expect(answerProgramCatalogQuestion([mla], { question: "How much are books for Medical Laboratory Assistant?", now })).toMatchObject({ answer: "Medical Laboratory Assistant, Yorkton, Fall 2027 fee table: Materials/Textbooks: $625.00." });
  });

  it("keeps each intake's own fee table and the page's price caveat", () => {
    expect(practicalNursing.intakes[0]!.fees).toContain("Student Fee");
    expect(practicalNursing.intakes[1]!.fees).toBe("Tuition and Fees\nTuition (total): $16,000.00\nFees (per year): $700.00\nNote: Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.");
    expect(practicalNursing.intakes[1]!.fees).not.toContain("Student Fee");
    expect(practicalNursing.priceNote).toBe("Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.");
  });

  it("reads course-by-course offerings with their course, dates and location", () => {
    expect(ccaMelfort.intakes[0]).toEqual({ campus: "Melfort", term: "Winter 2027", commitment: "Part-Time", course: "DEMC 100 Dementia Care", startDate: "Mar 10, 2027", endDate: "Apr 21, 2027", schedule: "Tue & Wed (9:00am-3:00pm)", domesticTuition: "$772.50" });
  });

  it("keeps the admission requirements section and stops at the next topic", () => {
    expect(practicalNursing.requirements).toContain("minimum overall score of 65%");
    expect(practicalNursing.requirements).toContain("30-level English Language Arts");
    expect(practicalNursing.requirements).not.toContain("Licensed practical nurses");
    expect(ccaMelfort.requirements).toBe("Admission and / or Program Practicum Requirements\nGrade 12 or equivalent");
  });

  it("parses the date forms published on program pages", () => {
    expect(parsePublishedDate("February 28, 2028")?.toISOString()).toBe("2028-02-28T00:00:00.000Z");
    expect(parsePublishedDate("Mar 10, 2027")?.toISOString()).toBe("2027-03-10T00:00:00.000Z");
    expect(parsePublishedDate("February 2027", true)?.toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(parsePublishedDate("Fall 2027")?.toISOString()).toBe("2027-09-01T00:00:00.000Z");
  });
});

describe("answerProgramCatalogQuestion", () => {
  it("lists every campus and term for a program, with passed deadlines called out", () => {
    const reply = answer("Which campuses offer Practical Nursing?");
    expect(reply).toContain("Yorkton, Winter 2028");
    expect(reply).toContain("Melfort, Winter 2027");
    expect(reply).toContain("the published application deadline, April 30, 2026, has passed");
  });

  it("filters by the campus asked about and resolves 'what about' follow-ups", () => {
    expect(answer("When does Practical Nursing start in Melfort?")).not.toContain("Yorkton");
    const followUp = answer("What about Yorkton?", "Is CCA offered in Melfort?");
    expect(followUp).toContain("Continuing Care Assistant (Full-Time) Fall 2027 Yorkton");
    expect(followUp).not.toContain("Melfort");
  });

  it("combines part-time and full-time pages of the same program", () => {
    const reply = answer("Where can I take the continuing care assistant program?");
    expect(reply).toContain("Melfort, Winter 2027");
    expect(reply).toContain("Yorkton, Fall 2027");
    expect(reply).not.toContain("Fall 2025");
  });

  it("keeps each program's own campuses when a question names two programs", () => {
    const both = answer("Which campuses offer Practical Nursing and Welding?");
    expect(both).toContain("Practical Nursing: Yorkton, Winter 2028");
    expect(both).toContain("Practical Nursing: Melfort, Winter 2027");
    expect(both).toContain("Welding: Yorkton (TTC), Fall 2027");
    expect(answer("Which campuses offer Practical Nursing, Welding or Continuing Care Assistant?")).toBe("Practical Nursing: Yorkton (Winter 2028), Melfort (Winter 2027); Continuing Care Assistant: Melfort (Winter 2027), Yorkton (Fall 2027); Welding: Yorkton (TTC) (Fall 2027). Which program are you interested in?");
    const melfort = answer("Is Practical Nursing or Welding offered in Melfort?");
    expect(melfort).toContain("Practical Nursing: Melfort, Winter 2027");
    expect(melfort).toContain("I couldn't find a published Welding intake for Melfort.");
    expect(answer("Are Practical Nursing or Welding offered in Fall 2030?")).toBe("I couldn't find a published Practical Nursing and Welding intake for Fall 2030. Published intakes are Practical Nursing: Yorkton (Winter 2028), Melfort (Winter 2027); Welding: Yorkton (TTC) (Fall 2027).");
  });

  it("says when a program has no published intake at a campus instead of guessing", () => {
    expect(answer("Is welding offered in Melfort?")).toBe("I couldn't find a published Welding intake for Melfort. Published intakes are Yorkton (TTC) (Fall 2027).");
  });

  it("lists programs by campus and term", () => {
    expect(answer("What programs start in Fall 2027?")).toBe("Programs with a published Fall 2027 intake: Continuing Care Assistant and Welding.");
    expect(answer("What programs are available at the Melfort campus?")).toBe("Programs with a published intake at Melfort: Practical Nursing and Continuing Care Assistant.");
  });

  it("returns the requirements of the campus's program page for grounded answering", () => {
    const result = ask("What are the requirements for Continuing Care Assistant in Yorkton?");
    expect(result).toMatchObject({ kind: "evidence", passages: [{ chunkId: "catalog:https://college.test/programs/continuing-care-assistant-ft-3", sourceUrl: ccaYorkton.url }] });
    expect(result?.kind === "evidence" && result.passages[0]!.content).toContain("English Language Arts A30");
    expect(result?.kind === "evidence" && result.passages).toHaveLength(1);
  });

  it("answers tuition from the campus's intake with the page's caveat", () => {
    expect(answer("How much is Practical Nursing in Yorkton?")).toBe("Practical Nursing, Yorkton, Winter 2028: domestic tuition $15,500.00. The fee table notes: \"Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.\" Please confirm the current amount with the college.");
    expect(answer("How much does Practical Nursing cost?")).toContain("Yorkton, Winter 2028: domestic tuition $15,500.00; Melfort, Winter 2027: domestic tuition $15,000.00");
    expect(answer("How much is the dementia care course for CCA in Melfort?")).toBe("Continuing Care Assistant (Part-Time) - Melfort, Melfort, Winter 2027 (DEMC 100 Dementia Care): domestic tuition $772.50.");
  });

  it("keeps a differing fee-table tuition beside the intake amount instead of reconciling them", () => {
    const reply = answer("What is the tuition for Practical Nursing in Melfort?");
    expect(reply).toContain("Melfort, Winter 2027: domestic tuition $15,000.00, international tuition $22,000.00 (the fee table on the same page lists Tuition (total) $16,000.00)");
    expect(reply).toContain("based on last year's program");
    expect(reply).toContain("Please confirm the current amount with the college.");
  });

  it("narrows course-by-course tuition to the course code asked about", () => {
    expect(answer("How much is DEMC 100 for CCA in Melfort?")).toBe("Continuing Care Assistant (Part-Time) - Melfort, Melfort, Winter 2027 (DEMC 100 Dementia Care): domestic tuition $772.50.");
  });

  it("answers fee questions from the campus intake's published fee lines, keeping both tuition figures and the caveat", () => {
    const caveat = "The fee table notes: \"Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.\" Please confirm the current amount with the college.";
    expect(answer("What are the fees for Practical Nursing in Melfort?")).toBe(`Practical Nursing, Melfort, Winter 2027 fee table: Tuition (total): $16,000.00; Fees (per year): $700.00. The Melfort intake lists domestic tuition $15,000.00, while its fee table lists Tuition (total) $16,000.00. ${caveat}`);
    expect(answer("How much is the student fee for Practical Nursing in Yorkton?")).toBe(`Practical Nursing, Yorkton, Winter 2028 fee table: Student Fee: $100.00. ${caveat}`);
    // Same question, same published answer: no model step can drop it.
    expect(new Set(Array.from({ length: 5 }, () => answer("What are the fees for Practical Nursing in Melfort?"))).size).toBe(1);
  });

  it.each([
    "What is the application fee for Practical Nursing in Yorkton?",
    "What is the cost of books for Practical Nursing in Yorkton?",
  ])("grounds charges the fee table does not list in that intake's table, not the tuition amount: %s", question => {
    const result = ask(question);
    expect(result?.kind).toBe("evidence");
    const content = result?.kind === "evidence" ? result.passages.map(passage => passage.content).join("\n") : "";
    expect(content).toContain("Intake: Yorkton, Winter 2028");
    expect(content).toContain("Student Fee");
    expect(content).not.toContain("Fees (per year)");
  });

  it("does not treat application deadlines or health programs as charges", () => {
    expect(answer("When is the application deadline for Practical Nursing?")).toContain("application deadline April 30, 2027");
    expect(answer("What health programs are offered in Melfort?")).toBe("Programs with a published intake at Melfort: Practical Nursing.");
  });

  it("attaches the fee-table mismatch and caveat to fee evidence", () => {
    const result = ask("What is the cost of books for Practical Nursing in Melfort?");
    expect(result).toMatchObject({
      notices: ["The Melfort intake lists domestic tuition $15,000.00, while its fee table lists Tuition (total) $16,000.00.", "The fee table notes: \"Tuition, Books and Supplies amounts are approximate, based on last year's program and may change at anytime.\""],
      confirm: "Please confirm the current amount with the college.",
    });
  });

  it.each([
    "What is the tuition refund policy for Practical Nursing in Yorkton?",
    "Is there a payment plan for Practical Nursing tuition?",
    "Are books included in the Practical Nursing tuition?",
  ])("leaves money policies to the policy pages: %s", question => {
    expect(ask(question)).toBeNull();
  });

  it("leaves tuition to page retrieval when no intake publishes it", () => {
    expect(ask("How much is welding in Yorkton?")).toBeNull();
    expect(ask("How much are programs at Melfort?")).toBeNull();
  });

  it("leaves other questions to page retrieval", () => {
    expect(ask("Tell me about Practical Nursing")).toBeNull();
    expect(ask("Do you offer an architecture program?")).toBeNull();
    expect(ask("Where is the Yorkton campus?")).toBeNull();
  });
});

const academicRequirements = `Admission Requirements
Application Deadline is April 30 2026. This is a Competitive Entry program.
Practical Nursing Admission Requirements
- Grade 12 with a minimum overall score of 65% in the following four subjects:
 - 30-level English Language Arts
 - Foundations of Math 30 OR Pre-Calculus 30 OR Workplace and Apprenticeship Math 30*
 - one of Biology 30, Chemistry 30 or Physics 30
 - one of Social Studies 30, History 30 or Native Studies 30
- English Language Proficiency
 - The English language requirement for this program follows Saskatchewan Polytechnic language requirements.
 - English Language requirement must be provided on or before the document deadline
_Click on the tab below, to learn more on the additional requirements upon acceptance to the program._
Practical Nursing Program Requirements
Immunization records are required before clinical placement.`;
const academicProgram = { ...practicalNursing, requirements: academicRequirements };
it("copies a complete published academic/language list without historical application prose", () => {
 const result = answerProgramCatalogQuestion([academicProgram], { question: "What are the admission requirements for Practical Nursing in Yorkton?", now });
 expect(result).toMatchObject({ kind: "answer", sources: [practicalNursing.url] });
 if (result?.kind !== "answer") throw new Error("Published list missing");
 for (const phrase of ["minimum overall score of 65%", "Foundations of Math 30 OR Pre-Calculus 30 OR Workplace and Apprenticeship Math 30*", "Biology 30, Chemistry 30 or Physics 30", "Social Studies 30, History 30 or Native Studies 30", "Saskatchewan Polytechnic language requirements", "on or before the document deadline", "additional requirements upon acceptance"]) expect(result.answer).toContain(phrase);
 expect(result.answer).not.toContain("April 30 2026");
});
it.each([
 "Am I eligible for Practical Nursing in Yorkton?",
 "What are the requirements for Practical Nursing in Winter 2035?",
 "What are the requirements for Practical Nursing and what does it cost?",
 "What are the requirements for Practical Nursing for international students?",
])("keeps interpretation and special cases on the grounded path: %s", question => {
 expect(answerProgramCatalogQuestion([academicProgram], { question, now })?.kind).not.toBe("answer");
});
it.each([
 academicRequirements.replace("English Language Proficiency", "Language"),
 academicRequirements.replace("document deadline", "deadline"),
 academicRequirements.replace("_Click on the tab below, to learn more on the additional requirements upon acceptance to the program._", ""),
])("does not return an incomplete or unbounded requirements list", requirements => {
 expect(answerProgramCatalogQuestion([{ ...academicProgram, requirements }], { question: "What are the requirements for Practical Nursing in Yorkton?", now })?.kind).toBe("evidence");
});
