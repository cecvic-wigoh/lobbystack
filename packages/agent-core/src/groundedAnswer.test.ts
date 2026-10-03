import { expect, it, vi } from "vitest";
import { validateGroundedAnswer } from "./groundedAnswer";
vi.mock("@lobbystack/domain", () => ({ searchKnowledgeEvidence: vi.fn() }));
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
