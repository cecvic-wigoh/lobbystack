export const SHERCOM_FAQ_URL = "https://www.shercomindustries.com/rubber-paving/residential/faq";

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Match only self-contained questions; mixed requests and follow-ups still need grounding.
const questions = [
  { pattern: /^can (?:rubber (?:paving|surfacing) be installed|you (?:install|put) rubber (?:paving|surfacing)) (?:over|on(?: top of)?) (?:my |the )?(?:existing |old )?(?:asphalt|concrete)(?: (?:driveway|surface))?$/, heading: "Can you install over gravel?" },
  { pattern: /^how much (?:does rubber (?:paving|surfacing) cost|will (?:my |a |the )?(?:rubber )?driveway cost)$/, heading: "How much does rubber paving cost?" },
  { pattern: /^how long (?:do i (?:wait|have to wait) before driving on (?:a |my )?(?:new )?(?:rubber )?driveway|before i can drive on (?:a |my )?(?:new )?(?:rubber )?driveway)$/, heading: "How long does it take to install?" },
  { pattern: /^what is (?:the |your |shercom s )?(?:rubber (?:paving|surfacing) )?warranty$/, heading: "Can these surfaces be repaired if needed? Is there a warranty?" },
  { pattern: /^can you guarantee (?:my |a |the )?(?:rubber )?driveway will never crack$/, heading: "Can these surfaces be repaired if needed? Is there a warranty?", guarantee: true },
];

export function shercomFaqQuestion(question: string) {
  return questions.find(item => item.pattern.test(normalize(question)));
}

/** Copy one complete published answer, including every condition, from current evidence. */
export function answerShercomFaq(question: string, passages: Array<{ content: string; sourceUrl?: string | null }>) {
  const requested = shercomFaqQuestion(question);
  if (!requested) return undefined;
  const answers = new Set<string>();
  for (const passage of passages) {
    if (passage.sourceUrl !== SHERCOM_FAQ_URL) continue;
    const text = passage.content.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    // A following question/heading proves the body wasn't cut off at a chunk boundary.
    const blocks = text.matchAll(/\[\*\*([^*]+)\*\*[\s\\]*\]\(https:\/\/www\.shercomindustries\.com\/rubber-paving\/residential\/faq#\)\s*\n([\s\S]*?)(?=\n\s*(?:\[\*\*|#{1,6} ))/g);
    for (const block of blocks) {
      if (normalize(block[1]!) !== normalize(requested.heading)) continue;
      const answer = block[2]!.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\\([\\*])/g, "$1").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      if (answer.length >= 10 && answer.length <= 1800) answers.add(answer);
    }
  }
  if (answers.size !== 1) return undefined;
  return {
    answer: `${requested.guarantee ? "I can't guarantee that. " : ""}${[...answers][0]}`,
    sources: [SHERCOM_FAQ_URL],
    outcome: "supported",
  };
}
