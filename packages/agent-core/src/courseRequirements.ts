/** Copy a uniquely identified course's published prerequisite block, never a similar course. */
type CoursePassage = { title: string; content: string; sourceUrl?: string | null };

function matchingCourseSources(question: string, passages: CoursePassage[]) {
  if (!/\b(?:prerequisites?|entry requirements?|admission requirements?)\b/i.test(question) || /\b(?:cost|fees?|guarantee|international|my)\b/i.test(question)) return;
  if (!/^(?:(?:what|which) (?:are|is) |(?:can|could) you (?:please )?(?:tell|repeat)|(?:tell|repeat))/i.test(question.trim())) return;
  const code = /\b([A-Z]{2,8})[ -]?(\d{2,5})\b/i.exec(question);
  if (!code) return;
  const compact = (text: string) => text.replace(/[ -]/g, "").toLowerCase();
  const levelKey = (value: string) => ({ "1": "i", one: "i", "2": "ii", two: "ii", "3": "iii", three: "iii", "4": "iv", four: "iv", "5": "v", five: "v" }[value.toLowerCase()] ?? value.toLowerCase());
  const requestedLevel = /\blevel\s+([a-z0-9]+)\b/i.exec(question)?.[1];
  const level = requestedLevel ? levelKey(requestedLevel) : undefined;
  if (level && !/^[ivx]+$/.test(level)) return;
  const sources = new Map<string, { title: string; texts: string[] }>();
  for (const passage of passages) {
    const sourceCode = /\b([A-Z]{2,8})[ -]?(\d{2,5})\b/i.exec(passage.title);
    if (!passage.sourceUrl || !sourceCode || compact(sourceCode[0]) !== compact(code[0])) continue;
    if (level && levelKey(/\blevel\s+([a-z0-9]+)\b/i.exec(passage.title)?.[1] ?? "") !== level) continue;
    const existing = sources.get(passage.sourceUrl) ?? { title: passage.title, texts: [] };
    existing.texts.push(passage.content); sources.set(passage.sourceUrl, existing);
  }
  if (sources.size !== 1) return;
  return sources;
}

export function courseRequirementsSource(question: string, passages: CoursePassage[]) {
  return matchingCourseSources(question, passages)?.keys().next().value;
}

export function answerCourseRequirements(question: string, passages: CoursePassage[]) {
  const sources = matchingCourseSources(question, passages);
  if (!sources) return;
  const [url, source] = [...sources][0]!;
  const blocks = new Set<string>();
  for (const text of source.texts) {
    const lines = text.replace(/\b(Prerequisites\s+must\b)/gi, "\n$1").split("\n");
    const start = lines.findIndex(line => /^(?:#{1,6}\s*)?Prerequisites(?:\s+must\b|\s*:\s*\S)/i.test(line.trim()));
    if (start < 0) continue;
    const block: string[] = []; let listStarted = false;
    for (const line of lines.slice(start)) {
      if (/^(?:#{1,6}\s*)?(?:Textbooks|Registration Deadline|Blended Delivery|Proof of Certification)\b/i.test(line.trim())) break;
      if (listStarted && !line.trim()) break;
      if (/^\s*[-*]\s+\S/.test(line)) listStarted = true;
      block.push(line);
    }
    if (listStarted) blocks.add(block.join("\n").trim());
  }
  if (blocks.size !== 1) return;
  const requirements = [...blocks][0]!;
  if (requirements.length > 3500) return;
  const closed = source.texts.some(text => /this course is not open for enrollment/i.test(text));
  return { answer: `${source.title} — published prerequisites:\n${requirements}${closed ? "\nThe page says this course is not open for enrollment." : ""}`, sources: [url], outcome: "supported" };
}
