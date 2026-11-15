import { expect, it } from "vitest";
import crawl4ai from "./fixtures/crawl4ai-nfpa.json";
import { answerCourseRequirements } from "./courseRequirements";
const source = { title: "NFPA 1140 - Wildland Firefighter Level I", sourceUrl: "https://college.test/product?catalog=NFPA1140-1", content: `Prerequisites\nTextbooks\nRegistration Deadline\n\nPrerequisites must be emailed to seri@college.test after purchasing this course. Once approved, registration and online access follow when registration closes and minimum class size is met.\n\n- Current member of good standing in a Saskatchewan fire department or other eligible emergency service.\n- ICS 100\n\n\\- [Textbook](https://books.test/)\nSorry, this course is not open for enrollment` };
it("copies the exact requested course's prerequisites with eligibility and registration conditions", () => {
 const result = answerCourseRequirements("What are the prerequisites for NFPA 1140 Wildland Firefighter Level I?", [source])!;
 expect(result.sources).toEqual([source.sourceUrl]);
 for (const phrase of ["seri@college.test", "minimum class size", "Current member of good standing", "other eligible emergency service", "ICS 100", "not open for enrollment"]) expect(result.answer).toContain(phrase);
 expect(result.answer).not.toContain("Textbook");
});
it.each(["What are the prerequisites for NFPA 1001?", "What are the prerequisites for NFPA 1140 Level II?", "What are the prerequisites for NFPA 1140 Level two?", "What are my prerequisites for NFPA 1140?", "How much does NFPA 1140 cost?"])("does not substitute or interpret a different request: %s", question => expect(answerCourseRequirements(question, [source])).toBeUndefined());
it("falls back for ambiguous courses, missing lists and conflicting published blocks", () => {
 expect(answerCourseRequirements("What are the prerequisites for NFPA 1140?", [source, { ...source, sourceUrl: "https://college.test/other" }])).toBeUndefined();
 expect(answerCourseRequirements("What are the prerequisites for NFPA 1140?", [{ ...source, content: "Prerequisites must be emailed to admissions." }])).toBeUndefined();
 expect(answerCourseRequirements("What are the prerequisites for NFPA 1140?", [source, { ...source, content: source.content.replace("ICS 100", "ICS 200") }])).toBeUndefined();
});

it("retains prerequisites embedded in a Crawl4AI table paragraph", () => {
 const result=answerCourseRequirements("What are the prerequisites for NFPA 1140 Wildland Firefighter Level I?", [{...source,sourceUrl:crawl4ai.url,content:crawl4ai.markdown}])!;
 for(const phrase of ["seri@suncrestcollege.ca", "minimum class size", "other eligible emergency service", "ICS 100", "not open for enrollment"])expect(result.answer).toContain(phrase);
 expect(result.answer).not.toContain("Textbooks");
 expect(result.answer).not.toContain("consolidated standard");
});
