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

**International Tuition**$22,000.00`,
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
    expect(practicalNursing.intakes).toEqual([
      { campus: "Yorkton", term: "Winter 2028", commitment: "Full-Time", startDate: "February 28, 2028", endDate: "February 15, 2030", applicationDeadline: "April 30, 2027", length: "76 Weeks", domesticTuition: "$15,500.00" },
      { campus: "Melfort", term: "Winter 2027", commitment: "Full-Time", startDate: "February 2027", endDate: "February 16, 2029", applicationDeadline: "April 30, 2026", domesticTuition: "$15,000.00", internationalTuition: "$22,000.00" },
    ]);
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

  it("says when a program has no published intake at a campus instead of guessing", () => {
    expect(answer("Is welding offered in Melfort?")).toBe("I couldn't find a published Welding intake for Melfort. Published intakes are Yorkton (TTC) (Fall 2027).");
  });

  it("lists programs by campus and term", () => {
    expect(answer("What programs start in Fall 2027?")).toBe("Programs with a published Fall 2027 intake: Continuing Care Assistant and Welding.");
    expect(answer("What programs are available at the Melfort campus?")).toBe("Programs with a published intake at Melfort: Practical Nursing and Continuing Care Assistant.");
  });

  it("returns the requirements of the campus's program page for grounded answering", () => {
    const result = ask("What are the requirements for Continuing Care Assistant in Yorkton?");
    expect(result).toMatchObject({ kind: "requirements", passages: [{ chunkId: "catalog:https://college.test/programs/continuing-care-assistant-ft-3", sourceUrl: ccaYorkton.url }] });
    expect(result?.kind === "requirements" && result.passages[0]!.content).toContain("English Language Arts A30");
    expect(result?.kind === "requirements" && result.passages).toHaveLength(1);
  });

  it("answers tuition from the intake at the campus asked about", () => {
    expect(answer("How much is Practical Nursing in Yorkton?")).toBe("Practical Nursing, Yorkton, Winter 2028: domestic tuition $15,500.00.");
    expect(answer("What is the tuition for Practical Nursing in Melfort?")).toBe("Practical Nursing, Melfort, Winter 2027: domestic tuition $15,000.00, international tuition $22,000.00.");
    expect(answer("How much does Practical Nursing cost?")).toContain("Yorkton, Winter 2028: domestic tuition $15,500.00; Melfort, Winter 2027: domestic tuition $15,000.00");
    expect(answer("How much is the dementia care course for CCA in Melfort?")).toBe("Continuing Care Assistant (Part-Time) - Melfort, Melfort, Winter 2027 (DEMC 100 Dementia Care): domestic tuition $772.50.");
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
