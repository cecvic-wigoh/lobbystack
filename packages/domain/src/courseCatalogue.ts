export type CataloguePage = { title: string; url: string; text: string };
export type CatalogueEntry = { title: string; url: string; kind: "program" | "course" | "short_course"; categories: string[]; code?: string };
type Turn = { role: "user" | "assistant"; content: string };
const clean = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const key = (s: string) => clean(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const links = (text: string) => [...text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)].map(m => ({ label: clean(m[1]!), url: m[2]!.replace(/\/$/, "") }));

/** Categories come from source links and curriculum membership, never inferred from title keywords. */
export function parseCourseCatalogue(pages: CataloguePage[]): CatalogueEntry[] {
  const result: CatalogueEntry[] = [];
  const curriculum = new Map<string, Set<string>>();
  for (const page of pages.filter(p => /\/programs\/[^/?#]+\/?$/.test(p.url))) {
    const areas = links(page.text).filter(link => /\/interest\//.test(link.url) && !/^(?:learn more|home|homepage|read more)$/i.test(link.label));
    const categories = [...new Set(areas.map(a => a.label))];
    const title = clean(/^# (.+)$/m.exec(page.text)?.[1] ?? clean(page.title).replace(/^.*?\s+-\s+/, "")).replace(/:\s*(?:apply|register) now\b.*$/i, "").trim();
    if (!title) continue;
    result.push({ title, url: page.url, kind: "program", categories });
    for (const link of links(page.text).filter(link => /\/courses\/[^/?#]+$/.test(link.url))) {
      const existing = curriculum.get(link.url) ?? new Set<string>();
      categories.forEach(category => existing.add(category));
      curriculum.set(link.url, existing);
    }
  }
  for (const page of pages.filter(p => !/\/programs\/[^/?#]+\/?$/.test(p.url))) {
    const url = new URL(page.url);
    const course = /\/courses\/[^/]+\/?$/.test(url.pathname);
    // A product is a course only when its own breadcrumb identifies a training catalogue.
    const breadcrumb = links(page.text).filter(link => /\/catalog\?pagename=/.test(link.url) && !/^(?:home|.*(?:hub|catalogue|catalog))$/i.test(link.label));
    if (!course && !(url.pathname === "/product" && url.searchParams.has("catalog") && (breadcrumb.length || links(page.text).some(link => /\/catalog\?pagename=/.test(link.url) && /training|course/i.test(link.label))))) continue;
    const title = clean(/^# (.+)$/m.exec(page.text)?.[1] ?? clean(page.title).replace(/^.*?\s+-\s+/, ""));
    if (!title) continue;
    const code = /^(?:#{1,6}\s*)?([A-Z]{2,6}[ -]?\d{2,5}[A-Z]{0,3})\s*$/m.exec(page.text)?.[1];
    result.push({ title, url: page.url, kind: course ? "course" : "short_course", categories: course ? [...(curriculum.get(page.url.replace(/\/$/, "")) ?? [])] : [...new Set(breadcrumb.map(b => b.label))], ...(code ? { code } : {}) });
  }
  return result;
}

const DETAILS = /\b(?:requirements?|prerequisites?|fees?|tuition|costs?|price|deadline|start|duration|guarantee|apply|application|admission|learn|cover|frais|conditions|inscription|d[eé]but|dur[eé]e|co[uû]t)\b/i;
const ORDINAL = /\b(?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|last) (?:one|course|program)\b/i;
const NEXT = /^(?:okay\s+|ok\s+|and\s+|please\s+)*(?:more|next|next page|show more|show me more|show the next (?:page|ones)|what else(?: is there)?|any others|are there more|what other (?:courses|programs)(?: are there)?|continue|keep going|la suite|encore|suivant|plus de cours)[?.!\s]*$/i;
const CATEGORIES = /\b(?:categories|areas of (?:interest|study)|types of (?:courses|programs)|cat[eé]gories|domaines)\b/i;
const LIST = /\b(?:courses|programs|classes|catalogue|catalog|cours|programmes|formations|domaines)\b|\bcat[eé]gories\b/i;
const labels = { en: { all: "Published catalogue", program: "Published programs", course: "Published courses", short_course: "Published short courses", scope: "All areas" }, fr: { all: "Catalogue publié", program: "Programmes publiés", course: "Cours publiés", short_course: "Formations courtes publiées", scope: "Tous les domaines" } };
type Kind = "all" | CatalogueEntry["kind"];
type State = { kind: Kind; categories: string[]; end: number };
function priorPage(history: Turn[], categories: string[]): State | undefined {
  const turn = [...history].reverse().find(t => t.role === "assistant");
  if (turn) {
    for (const language of ["en", "fr"] as const) for (const kind of ["all", "program", "course", "short_course"] as const) {
      const prefix = labels[language][kind] + " — ";
      if (!turn.content.startsWith(prefix)) continue;
      const match = /^(.*?)\. (?:Showing entries|Entrées) \d+ (?:to|à) (\d+) (?:of|sur) \d+\./.exec(turn.content.slice(prefix.length));
      if (match) return { kind, categories: categories.filter(c => match[1]!.split("; ").includes(c)), end: Number(match[2]) };
    }
  }
  return undefined;
}

export function isCatalogueDiscoveryQuestion(question: string, history: Turn[] = []): boolean {
  const lastAnswer = [...history].reverse().find(t => t.role === "assistant");
  const hasPage = Boolean(lastAnswer && /^(?:published (?:catalogue|programs|courses|short courses)|catalogue publie|programmes publies|cours publies|formations courtes publiees)\b/.test(key(lastAnswer.content)));
  if (hasPage && ORDINAL.test(question)) return true;
  if (DETAILS.test(question)) return false;
  return LIST.test(question) || /\bwhat (?:can|could) (?:i|we) (?:study|take)\b/i.test(question) || (hasPage && (NEXT.test(question) || question.trim().split(/\s+/).length <= 10));
}

/** Use conversation only for the cursor/filter; every listed fact is read again from current entries. */
export function answerCourseCatalogue(entries: CatalogueEntry[], input: { question: string; history?: Turn[]; businessName: string; locale?: "en" | "fr"; limit?: number }): { kind: "answer"; answer: string; sources: string[] } | { kind: "question"; question: string; sourceUrl: string } | null {
  if (!entries.length || !isCatalogueDiscoveryQuestion(input.question, input.history)) return null;
  const locale = input.locale ?? "en", history = input.history ?? [], q = input.question;
  const categories = [...new Set(entries.flatMap(e => e.categories))].sort((a, b) => a.localeCompare(b, "en"));
  const prior = priorPage(history, categories);
  const selected = categories.filter(c => key(c).split(" ").filter(w => w.length > 2 && !["and", "for", "the", "with", "from"].includes(w)).some(word => key(q).split(" ").includes(word)));
  const more = NEXT.test(q) || Boolean(prior && /\b(?:more|next)\b/i.test(q) && LIST.test(q));
  const lastAnswer = [...history].reverse().find(t => t.role === "assistant");
  const interruptedList = Boolean(lastAnswer?.content.includes("[interrupted]") && /^(?:published |catalogue publie|programmes publies|cours publies)/.test(key(lastAnswer.content)));
  if (more && !prior && !interruptedList) return null;
  const retainKind = more || selected.length > 0 || /\b(?:only|just|ones|those|them)\b/i.test(q);
  const kind: Kind = /\bprograms\b/i.test(q) && !/\b(?:courses|classes)\b/i.test(q) ? "program" : /\b(?:short courses|continuing education)\b/i.test(q) ? "short_course" : /\b(?:only|just)\s+(?:the )?(?:individual )?courses\b|individual courses|curriculum courses/i.test(q) ? "course" : retainKind ? prior?.kind ?? "all" : "all";
  const keepFilter = more || ORDINAL.test(q) || /\b(?:only|just|ones|those|them)\b/i.test(q);
  const filter = selected.length ? selected : keepFilter ? prior?.categories ?? [] : [];
  let filtered = entries.filter(e => (kind === "all" || e.kind === kind) && (!filter.length || e.categories.some(c => filter.includes(c))));
  // Stable order, programs first, with examples from different published areas before the next round.
  const ordered: CatalogueEntry[] = [];
  for (const k of ["program", "short_course", "course"]) {
    const groups = new Map<string, CatalogueEntry[]>();
    for (const entry of filtered.filter(e => e.kind === k).sort((a, b) => a.title.localeCompare(b.title, "en") || a.url.localeCompare(b.url))) {
      const group = entry.categories[0] ?? "~"; groups.set(group, [...(groups.get(group) ?? []), entry]);
    }
    while ([...groups.values()].some(g => g.length)) for (const name of [...groups.keys()].sort()) { const entry = groups.get(name)!.shift(); if (entry) ordered.push(entry); }
  }
  filtered = ordered;
  if (prior && ORDINAL.test(q)) {
    const previous = [...history].reverse().find(t => t.role === "assistant" && /^(?:Published |Catalogue publié|Programmes publiés|Cours publiés|Formations courtes publiées)/.test(t.content));
    const shown = previous ? filtered.filter(e => previous.content.includes(`\n- ${e.title}${e.code ? ` (${e.code})` : ""}\n`) || previous.content.endsWith(`\n- ${e.title}${e.code ? ` (${e.code})` : ""}`) || previous.content.includes(`\n- ${e.title}${e.code ? ` (${e.code})` : ""}\n\n`)) : [];
    const ordinal = ORDINAL.exec(q)!;
    const index = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"].indexOf(ordinal[1]!.toLowerCase());
    const target = ordinal[1]!.toLowerCase() === "last" ? shown.at(-1) : shown[index];
    return target ? { kind: "question", question: q.replace(ORDINAL, target.title + (target.code ? ` (${target.code})` : "")), sourceUrl: target.url } : null;
  }
  if (DETAILS.test(q)) return null;
  // Unknown subjects must not silently become an unrelated catalogue list.
  const ignore = new Set(("okay ok can could would will you tell me the list of courses course programs program classes do does offer offers offered have has there that are is at in for and some any all other interesting i we us options study studying available published show please what which about ones those them more next take taking to be able am might suggest recommend recommendations something different current currently now today else please only just individual curriculum short continuing education category categories areas interest types your our quelles quels que est sont les le la des de du vous pouvez pouvezvous proposer proposez offrez montrez moi tous toutes autres cours programmes formations categories domaines et en une un" + " " + key(input.businessName)).split(" "));
  const categoryWords = new Set(selected.flatMap(c => key(c).split(" ")));
  const unknown = key(q).split(" ").filter(w => !ignore.has(w) && !categoryWords.has(w));
  if (!NEXT.test(q) && unknown.length) return null;
  if (CATEGORIES.test(q) && !selected.length) {
    const scope = labels[locale].scope;
    return { kind: "answer", answer: `${labels[locale].all} — ${scope}. ${locale === "fr" ? "Domaines publiés" : "Published areas"}: ${categories.join("; ")}. ${locale === "fr" ? "Quel domaine vous intéresse ?" : "Which area would you like to explore?"}`, sources: [...new Set(categories.map(c => entries.find(e => e.categories.includes(c))!.url))] };
  }
  if (!filtered.length) return { kind: "answer", answer: locale === "fr" ? "Je ne trouve pas d’entrée publiée correspondant à ce filtre dans le catalogue indexé. Quel autre domaine vous intéresse ?" : "I couldn't find a published entry matching that filter in the indexed catalogue. Which other area would you like to explore?", sources: [] };
  const limit = Math.min(8, Math.max(1, input.limit ?? 8));
  // A cut-off spoken page is not a reliable cursor; safely restart it instead of skipping unheard names.
  const sameFilter = prior?.kind === kind && [...prior.categories].sort().join("\n") === [...filter].sort().join("\n");
  const offset = more && sameFilter ? prior.end : 0;
  if (offset >= filtered.length) return { kind: "answer", answer: locale === "fr" ? "Vous avez atteint la fin de cette liste publiée. Voulez-vous explorer un autre domaine ?" : "You've reached the end of this published list. Would you like to explore another area?", sources: [] };
  const shown = filtered.slice(offset, offset + limit), end = offset + shown.length;
  const scope = filter.length ? filter.join("; ") : labels[locale].scope;
  const header = locale === "fr" ? `${labels[locale][kind]} — ${scope}. Entrées ${offset + 1} à ${end} sur ${filtered.length}.` : `${labels[locale][kind]} — ${scope}. Showing entries ${offset + 1} to ${end} of ${filtered.length}.`;
  const note = locale === "fr" ? "La présence dans le catalogue ne confirme pas une inscription ouverte." : "Catalogue listings do not confirm open enrolment.";
  const next = end < filtered.length ? (locale === "fr" ? "Dites « la suite » pour continuer ou choisissez un domaine." : "Say “more” for the next entries, or choose an area.") : "";
  const menu = !filter.length && offset === 0 ? ` ${locale === "fr" ? "Domaines" : "Areas"}: ${categories.slice(0, 5).join("; ")}${categories.length > 5 ? (locale === "fr" ? "; et d’autres" : "; and more") : ""}.` : "";
  return { kind: "answer", answer: `${header}\n${shown.map(e => `- ${e.title}${e.code ? ` (${e.code})` : ""}`).join("\n")}\n\n${note} ${next}${menu}`.trim(), sources: shown.map(e => e.url) };
}
