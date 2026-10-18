// Structured program offerings parsed from college program pages. Retrieval
// returns a handful of passages, which cannot answer "which campuses offer X"
// or "what starts in Fall 2027" across dozens of campus-specific pages.

export type ProgramIntake = {
  campus: string;
  term: string;
  commitment?: string;
  course?: string;
  startDate?: string;
  endDate?: string;
  applicationDeadline?: string;
  length?: string;
  schedule?: string;
  domesticTuition?: string;
  internationalTuition?: string;
  /** The intake's "Additional Fees" section, which can differ from the intake tuition. */
  fees?: string;
  /** The tuition row of that fee table, e.g. "Tuition (total) $16,000.00". */
  feeTableTuition?: string;
};

export type ProgramEntry = {
  title: string;
  url: string;
  area?: string;
  intakes: ProgramIntake[];
  requirements?: string;
  /** A caveat the page attaches to its prices, e.g. "approximate, based on last year's program". */
  priceNote?: string;
};

export type ProgramCatalogResult =
  | { kind: "answer"; answer: string; sources: string[] }
  | { kind: "evidence"; passages: Array<{ chunkId: string; title: string; content: string; sourceUrl: string }>; notices?: string[]; confirm?: string };

const plain = (value: string) => value
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\\([|*\-_#])/g, "$1")
  .replace(/\*\*|__/g, "")
  .replace(/[ \t]+/g, " ")
  .trim();

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TERM_START_MONTH: Record<string, number> = { winter: 0, spring: 3, summer: 6, fall: 8 };

/** Reads "February 28, 2028", "Mar 10, 2027", "February 2027" or "Fall 2027". */
export function parsePublishedDate(value: string | undefined, endOfPeriod = false): Date | undefined {
  if (!value) return undefined;
  const exact = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(value);
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  if (exact && month(exact[1]!) >= 0) return new Date(Date.UTC(Number(exact[3]), month(exact[1]!), Number(exact[2])));
  const monthYear = /\b([A-Za-z]{3,9})\s+(\d{4})\b/.exec(value);
  if (monthYear && month(monthYear[1]!) >= 0) return new Date(Date.UTC(Number(monthYear[2]), month(monthYear[1]!) + (endOfPeriod ? 1 : 0), endOfPeriod ? 0 : 1));
  const term = /\b(winter|spring|summer|fall)\s+(\d{4})\b/i.exec(value);
  if (term) {
    const start = TERM_START_MONTH[term[1]!.toLowerCase()]!;
    return new Date(Date.UTC(Number(term[2]), start + (endOfPeriod ? 3 : 0), endOfPeriod ? 0 : 1));
  }
  return undefined;
}

function requirementsSection(text: string): string | undefined {
  const heading = /^#{1,6} [^\n]*(?:Admission|Requirements)[^\n]*$/m.exec(text);
  if (!heading) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  const end = /^#{1,3} (?![^\n]*(?:Admission|Requirement))[^\n]*$/m.exec(rest);
  const body = plain(rest.slice(0, end ? end.index : undefined)).replace(/\n{2,}/g, "\n").replace(/^\* \* \*$/gm, "").replace(/\n{2,}/g, "\n").trim();
  return body ? `${plain(heading[0].replace(/^#+\s*/, ""))}\n${body}`.slice(0, 3000) : undefined;
}

/** A Markdown fee table as plain "Label: amount" lines that can be quoted exactly. */
function feeLines(table: string): string {
  const clean = (value: string) => plain(value.replace(/<br\s*\/?>/gi, " ")).replace(/(^|\s)_+|_+(?=\s|$)/g, "$1").replace(/^[#*\s]+/, "").replace(/\s+/g, " ").trim();
  return table.split("\n").flatMap(line => {
    if (!line.trim().startsWith("|")) return clean(line) ? [clean(line)] : [];
    const cells = line.split("|").map(clean).filter(Boolean);
    return !cells.length || cells.every(cell => /^-+$/.test(cell)) ? [] : [cells.length > 1 ? `${cells[0]}: ${cells.slice(1).join(" ")}` : cells[0]!];
  }).join("\n");
}

/** "Label: $amount" lines of a plain fee table. */
function feeItems(fees: string): Array<{ label: string; value: string }> {
  return fees.split("\n").flatMap(line => {
    const item = /^([^:]+):\s*(.*\$\s?[\d,].*)$/.exec(line);
    if (!item || /^note\b/i.test(item[1]!)) return [];
    // "Tuition (Domestic) (International): $11,200.00 $22,000.00" is two lines in one row.
    const tags = [...item[1]!.matchAll(/\(([^)]+)\)/g)].map(tag => tag[1]!);
    const amounts = item[2]!.match(/\$\s?[\d,]+(?:\.\d{2})?/g) ?? [];
    const base = item[1]!.replace(/\s*\([^)]*\)/g, "").trim();
    return tags.length > 1 && tags.length === amounts.length ? tags.map((tag, index) => ({ label: `${base} (${tag})`, value: amounts[index]! })) : [{ label: item[1]!.trim(), value: item[2]!.trim() }];
  });
}

/** The page's own caveat about its prices, as written. */
function priceCaveat(text: string | undefined): string | undefined {
  const line = text?.split("\n").find(value => /tuition|fee|amount/i.test(value) && /approximat|subject to change|last year/i.test(value));
  return line ? plain(line).replace(/^[>|\s]*\**\s*(?:Note:\s*)?/i, "").replace(/\s*\|.*$/, "").trim() : undefined;
}

/** Parse one program page (Markdown as imported) into its published intakes and requirements. */
export function parseProgramPage(input: { url: string; title: string; text: string }): ProgramEntry {
  const text = input.text.replace(/\r\n?/g, "\n");
  const title = plain(/^# (.+)$/m.exec(text)?.[1] ?? input.title.replace(/^[\s\S]*?\s-\s/, ""));
  const area = /\[([^\]]+)\]\(https?:\/\/[^)]*\/interest\/department-[^)]*\)/.exec(text)?.[1];
  const intakes: ProgramIntake[] = [];
  const add = (intake: ProgramIntake) => {
    const key = [intake.campus, intake.term, intake.course ?? "", intake.startDate ?? ""].join("|").toLowerCase();
    if (!intakes.some(item => [item.campus, item.term, item.course ?? "", item.startDate ?? ""].join("|").toLowerCase() === key)) intakes.push(intake);
  };

  // Full-time layout: "#### Campus / Full-Time / Fall 2027 / **Start Date**…" detail blocks.
  for (const block of text.matchAll(/^#### ([^\n]+)\n+(Full-Time|Part-Time|Self-Paced)\n+([^\n]+)\n([\s\S]*?)(?=^#{1,4} |(?![\s\S]))/gm)) {
    const body = block[4]!;
    const field = (label: string) => { const value = new RegExp(`\\*\\*${label}\\*\\*\\s*([^\\n*]+)`).exec(body)?.[1]; return value ? plain(value) : undefined; };
    const intake: ProgramIntake = { campus: plain(block[1]!), term: plain(block[3]!), commitment: block[2]! };
    for (const [key, label] of [["startDate", "Start Date"], ["endDate", "End Date"], ["applicationDeadline", "Application Deadline"], ["length", "Length"], ["domesticTuition", "Domestic Tuition"], ["internationalTuition", "International Tuition"]] as const) {
      const value = field(label);
      if (value) intake[key] = value;
    }
    // Each intake's own fee table follows its details; keep it with that intake.
    const after = text.slice(block.index + block[0].length);
    const feeHeading = /^#### Additional Fees[^\n]*\n/.exec(after);
    if (feeHeading?.index === 0) {
      const rest = after.slice(feeHeading[0].length);
      const table = rest.slice(0, Math.min(/^#{3,4} /m.exec(rest)?.index ?? Infinity, 1500)).trim();
      const fees = feeLines(table);
      if (fees) intake.fees = fees;
      const row = /^\|([^|\n]*tuition[^|\n]*)\|([^|\n]*)\|/im.exec(table);
      const amount = row && /\$\s?[\d,]+(?:\.\d{2})?/.exec(row[2]!)?.[0];
      if (row && amount) intake.feeTableTuition = `${plain(row[1]!.replace(/<br>/gi, " ")).replace(/^\*+/, "").trim()} ${amount.replace(/\s/g, "")}`;
    }
    add(intake);
  }
  // Intake tabs ("Winter 2027Full-Time / ##### Melfort") list intakes whose details may be missing.
  for (const tab of text.matchAll(/^((?:Fall|Winter|Spring|Summer) \d{4}|Continuous Intake|Term \d+)\s*(Full-Time|Part-Time|Self-Paced)?\s*\n+#{5} ([^\n]+)$/gm)) {
    const campus = plain(tab[3]!);
    if (!intakes.some(item => item.campus === campus && item.term === tab[1])) add({ campus, term: tab[1]!, ...(tab[2] ? { commitment: tab[2] } : {}) });
  }
  // Course-by-course layout: "Term: / Winter 2027 / Date: / … / Location: / Esterhazy".
  const termPattern = /^Term:\s*\n+([^\n]+)/gm;
  for (const term of text.matchAll(termPattern)) {
    const after = text.slice(term.index + term[0].length);
    const segment = after.slice(0, Math.min(...[/^Term:/m.exec(after)?.index, /^Register\b/m.exec(after)?.index, /^#{1,6} /m.exec(after)?.index, 1500].filter((value): value is number => value !== undefined)));
    const field = (label: string) => { const value = new RegExp(`^${label}:\\s*\\n+([^\\n]+(?:\\n+\\\\?- [^\\n]+)?)`, "m").exec(segment)?.[1]; return value ? plain(value.replace(/\n+/g, " ")) : undefined; };
    const [termName, commitment] = plain(term[1]!).split(/\s*\|\s*/);
    const campus = field("Location");
    if (!campus || !termName) continue;
    const before = text.slice(0, term.index);
    const course = [...before.matchAll(/^#{6} (?:[^\n]*? - )?([A-Z]{2,6}[ -]?\d{2,4}[A-Z]?)\s*-\s*([^\n]+)$/gm)].at(-1);
    const dates = field("Date")?.split(/\s+-\s+/);
    const intake: ProgramIntake = { campus, term: termName };
    if (commitment) intake.commitment = commitment;
    if (course) intake.course = `${course[1]} ${plain(course[2]!)}`;
    if (dates?.[0]) intake.startDate = dates[0];
    if (dates?.[1]) intake.endDate = dates[1];
    const schedule = field("Schedule");
    if (schedule) intake.schedule = schedule;
    const tuition = field("Domestic Tuition");
    if (tuition) intake.domesticTuition = tuition;
    add(intake);
  }
  const requirements = requirementsSection(text);
  const priceNote = priceCaveat(text);
  return { title, url: input.url, ...(area ? { area: plain(area) } : {}), intakes, ...(requirements ? { requirements } : {}), ...(priceNote ? { priceNote } : {}) };
}

const SEASONS = new Set(["fall", "autumn", "winter", "spring", "summer", "term"]);
// Question words that say what is being asked, not which subject it is about.
const QUESTION_WORDS = new Set(["what", "which", "where", "when", "offered", "offer", "offers", "available", "start", "starts", "study", "take", "campus", "campuses", "online", "remote", "semester", "intake", "intakes", "there", "have", "does", "with", "from", "about", "they", "them", "this", "that", "tell", "list", "show", "upcoming", "next", "options", "located", "classes"]);
const GENERIC = new Set(["program", "programs", "certificate", "certificates", "diploma", "applied", "course", "courses", "part", "time", "full", "training", "the", "and", "of", "for", "in", "at", "to", "a", "an", "suncrest", "college", "level", "apply", "now", "school", "year", "virtual", "face", "includes", "your", "you", "do", "is", "are"]);
const words = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const stem = (word: string) => (word.length > 4 ? word.replace(/(?:ing|ers|er|es|s|e)$/, "") : word).slice(0, 6);
const campusKey = (campus: string) => words(campus.replace(/\(.*?\)/g, "")).join(" ");

function mentionedCampus(catalog: ProgramEntry[], question: string | undefined): string | undefined {
  if (!question) return undefined;
  const spoken = ` ${words(question).join(" ")} `;
  if (/\b(?:online|virtual|virtually|remote)\b/.test(spoken)) return "online";
  const campuses = [...new Set(catalog.flatMap(entry => entry.intakes.map(intake => campusKey(intake.campus))))].filter(key => key && !["online", "various"].includes(key));
  return campuses.sort((left, right) => right.length - left.length).find(key => spoken.includes(` ${key} `));
}

function mentionedTerm(question: string | undefined): { season: string; year?: string } | undefined {
  const match = question && /\b(fall|autumn|winter|spring|summer)(?:\s+(?:semester|term|intake)?\s*(?:of\s+)?(\d{4}))?\b/i.exec(question);
  return match ? { season: match[1]!.toLowerCase() === "autumn" ? "fall" : match[1]!.toLowerCase(), ...(match[2] ? { year: match[2] } : {}) } : undefined;
}

function matchPrograms(catalog: ProgramEntry[], question: string | undefined): ProgramEntry[] {
  if (!question) return [];
  const campusWords = new Set(catalog.flatMap(entry => entry.intakes.flatMap(intake => words(intake.campus))));
  const asked = words(question);
  const askedStems = new Set(asked.map(stem));
  // "lab" names "laboratory" and "tech" names "technician"; generic words never do.
  const abbreviations = asked.filter(word => word.length >= 3 && !GENERIC.has(word) && !QUESTION_WORDS.has(word));
  const scored = catalog.map(entry => {
    const tokens = [...new Set(words(entry.title).filter(word => !GENERIC.has(word) && !SEASONS.has(word) && !campusWords.has(word) && !/^\d+$/.test(word)))];
    const acronym = tokens.length >= 2 ? tokens.map(word => word[0]).join("") : "";
    const hits = tokens.filter(word => askedStems.has(stem(word)) || abbreviations.some(prefix => word.startsWith(prefix))).length;
    return { entry, hits, score: acronym && asked.includes(acronym) ? 1 : tokens.length ? hits / tokens.length : 0 };
  });
  const best = Math.max(0, ...scored.map(item => item.score));
  if (best >= 1) return scored.filter(item => item.score >= 1).map(item => item.entry);
  // A program named without its qualifier, e.g. "Diagnostic Medical Sonography" for "… - Ultrasound".
  return best >= 0.6 ? scored.filter(item => item.score === best && item.hits >= 2).map(item => item.entry) : [];
}

const REQUIREMENTS = /\b(?:requirements?|prerequisites?|pre-requisites?|eligib\w*|qualif\w*|admission|entrance|get in(?:to)?|need to (?:apply|enrol|enroll|have))\b/i;
const SCHEDULE = /\b(?:campus(?:es)?|where|locations?|offered|available|semesters?|terms?|intakes?|start\w*|begin\w*|when|deadline|fall|autumn|winter|spring|summer|online|virtual|in person|in-person|dates?|schedule)\b/i;
const TUITION_AMOUNT = /\b(?:tuition|costs?|price|how much|pay)\b/i;
// Other charges come from the intake's fee table; money policies from the policy pages.
const OTHER_CHARGES = /\b(?:application|books?|textbooks?|materials?|supplies|student fees?|health|dental|lab|shop|tech fees?|printing|exams?|consumables?|uniforms?|equipment|fees)\b/i;
// Words naming one fee line; a question without any asks about the whole table.
const FEE_ITEMS = new Set(["application", "book", "books", "textbook", "textbooks", "material", "materials", "supplies", "student", "health", "dental", "lab", "shop", "tech", "technology", "printing", "exam", "exams", "test", "consumable", "consumables", "uniform", "uniforms", "equipment"]);
const MONEY_POLICY = /\b(?:refund\w*|deposits?|withdraw\w*|payment plans?|instal+ments?|polic(?:y|ies)|includ\w*|scholarships?|bursar(?:y|ies)|funding|loans?|grants?|sponsor\w*)\b/i;
// Details the catalog does not hold go through the page passages instead.
const OTHER_DETAIL = /\b(?:learn|cover\w*|(?<!what |how )about|careers?|jobs?|salary|contact|email|phone|call)\b/i;
const CATALOG_LIST = /\b(?:programs?|courses?|study|offer\w*|available|take)\b/i;

const isOnline = (campus: string) => /^(?:online|virtual|remote)/i.test(campus.trim());
/** "Continuing Care Assistant (Full-Time) Fall 2027 Yorkton" → "Continuing Care Assistant". */
const baseTitle = (title: string) => title.replace(/\s*\((?:part|full)-time\)/gi, "").split(/\s+-\s+|:\s/)[0]!.replace(/\s+(?:fall|winter|spring|summer)\s+\d{4}\b.*$/i, "").trim();
const joinNames = (names: string[], locale: "en" | "fr") => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${locale === "fr" ? "et" : "and"} ${names.at(-1)}`;

function describeIntake(intake: ProgramIntake, now: Date, locale: "en" | "fr"): string {
  const details = [
    intake.course,
    intake.commitment?.toLowerCase(),
    intake.startDate && intake.startDate !== intake.term ? `${locale === "fr" ? "début" : "starts"} ${intake.startDate}` : undefined,
    intake.endDate ? `${locale === "fr" ? "fin" : "ends"} ${intake.endDate}` : undefined,
    intake.schedule,
    intake.applicationDeadline ? (parsePublishedDate(intake.applicationDeadline, true)?.getTime() ?? Infinity) < now.getTime()
      ? (locale === "fr" ? `la date limite publiée, ${intake.applicationDeadline}, est passée` : `the published application deadline, ${intake.applicationDeadline}, has passed`)
      : `${locale === "fr" ? "date limite de demande" : "application deadline"} ${intake.applicationDeadline}` : undefined,
  ].filter(Boolean);
  return `${intake.campus}, ${intake.term}${details.length ? ` (${details.join("; ")})` : ""}`;
}

/** Published intakes that have not yet finished. */
function currentIntakes(entry: ProgramEntry, now: Date) {
  return entry.intakes.filter(intake => {
    const end = parsePublishedDate(intake.endDate, true) ?? parsePublishedDate(intake.term, true);
    return !end || end.getTime() >= now.getTime();
  });
}

/**
 * Answer campus and term questions from the parsed catalog, or select the
 * requirement passages for the program asked about. Returns null when the
 * question is not a catalog question or names no published program.
 */
export function answerProgramCatalogQuestion(catalog: ProgramEntry[], input: { question: string; previousQuestion?: string; now?: Date; locale?: "en" | "fr" }): ProgramCatalogResult | null {
  if (!catalog.length) return null;
  const now = input.now ?? new Date();
  const locale = input.locale ?? "en";
  const question = input.question;
  const wantsRequirements = REQUIREMENTS.test(question);
  const campus = mentionedCampus(catalog, question) ?? (input.previousQuestion && !mentionedTerm(question) ? mentionedCampus(catalog, input.previousQuestion) : undefined);
  const term = mentionedTerm(question);
  const wantsSchedule = SCHEDULE.test(question) || Boolean(campus) || Boolean(term);
  const moneyPolicy = MONEY_POLICY.test(question);
  // "application deadline" and "health programs" are not charges; a cost word makes them one.
  const wantsCharges = !wantsRequirements && !moneyPolicy && OTHER_CHARGES.test(question) && /\b(?:costs?|price|how much|pay|fees?)\b/i.test(question);
  const wantsTuition = !wantsRequirements && !moneyPolicy && !wantsCharges && TUITION_AMOUNT.test(question);
  if (!wantsRequirements && !wantsTuition && !wantsCharges && (!wantsSchedule || OTHER_DETAIL.test(question) || moneyPolicy || TUITION_AMOUNT.test(question))) return null;
  let programs = matchPrograms(catalog, question);
  if (!programs.length && input.previousQuestion && /\b(?:it|its|that|this|the program|the course|there|same|what about|how about|and)\b/i.test(question)) programs = matchPrograms(catalog, input.previousQuestion);
  const atCampus = (intake: ProgramIntake) => !campus || (campus === "online" ? isOnline(intake.campus) : campusKey(intake.campus) === campus || campusKey(intake.campus).startsWith(`${campus} `));
  const inTerm = (intake: ProgramIntake) => !term || (intake.term.toLowerCase().startsWith(term.season) && (!term.year || intake.term.includes(term.year)));
  // A course code ("SPCR 105") narrows course-by-course offerings to that course.
  const codeOf = (value: string) => value.replace(/[\s-]+/g, "").toUpperCase();
  const askedCode = /\b([A-Z]{2,6})[\s-]?(\d{3})\b/i.exec(question);
  const code = askedCode && programs.some(entry => entry.intakes.some(intake => intake.course && codeOf(intake.course).startsWith(codeOf(askedCode[0])))) ? codeOf(askedCode[0]) : undefined;
  const forCourse = (intake: ProgramIntake) => !code || Boolean(intake.course && codeOf(intake.course).startsWith(code));
  // Several labels share a key ("Melville", "Melville (…Institute)"); say the plain one.
  const campusName = campus === "online" ? (locale === "fr" ? "en ligne" : "online") : campus ? catalog.flatMap(entry => entry.intakes.filter(atCampus).map(intake => intake.campus)).sort((left, right) => left.length - right.length)[0] ?? campus : undefined;
  const termName = term ? `${term.season[0]!.toUpperCase()}${term.season.slice(1)}${term.year ? ` ${term.year}` : ""}` : undefined;

  if (programs.length && wantsRequirements) {
    // Prefer pages that publish an intake at the requested campus, e.g. Practical Nursing in Yorkton.
    const campusPages = campus ? programs.filter(entry => entry.intakes.some(atCampus)) : [];
    const distinct = new Map<string, ProgramEntry>();
    for (const entry of campusPages.length ? campusPages : programs) {
      const key = entry.requirements?.replace(/^.*\n/, "");
      if (key && !distinct.has(key)) distinct.set(key, entry);
    }
    const chosen = [...distinct.values()].slice(0, 3);
    if (!chosen.length) return null;
    // Copy only a complete academic/language list, bounded by the page's explicit
    // acceptance-requirements notice. Historical application prose stays outside it.
    const entry = chosen.length === 1 ? chosen[0] : undefined;
    const academic = entry?.requirements?.match(/(?:^|\n)(- Grade \d+[^\n]*\n[\s\S]*?)(?=\n_?Click on the tab below,[^\n]*additional requirements upon acceptance)/i)?.[1]?.trim();
    if (locale === "en" && /^what (?:are|is) (?:the )?(?:(?:admission|entry|academic) )?(?:requirements?|prerequisites?) for .+[?.!]*$/i.test(question.trim())
      && !/\b(?:fees?|tuition|cost|start|deadlines?|duration|international|domestic|mature|transfer|my)\b/i.test(question)
      && entry && academic && /English Language Proficiency/i.test(academic) && /document deadline/i.test(academic)
      && academic.split(/\s+/).length <= 160
      && (!campus || entry.intakes.some(atCampus)) && (!term || currentIntakes(entry, now).some(intake => atCampus(intake) && inTerm(intake)))) {
      return { kind: "answer", answer: `${entry.title} — published academic and English-language requirements:\n${academic}\nThe page also lists additional requirements upon acceptance; please review the program page for those conditions.`, sources: [entry.url] };
    }
    return {
      kind: "evidence",
      passages: chosen.map(entry => {
        const intakes = currentIntakes(entry, now).filter(atCampus);
        return {
          chunkId: `catalog:${entry.url}`,
          title: entry.title,
          sourceUrl: entry.url,
          content: [`# ${entry.title}`, entry.requirements, intakes.length ? `Published intakes: ${intakes.map(intake => describeIntake(intake, now, "en")).join("; ")}.` : ""].filter(Boolean).join("\n"),
        };
      }),
    };
  }

  const amount = (value: string | undefined) => /\$[\d,]+(?:\.\d{2})?/.exec(value ?? "")?.[0];
  const differs = (intake: ProgramIntake) => Boolean(intake.domesticTuition && intake.feeTableTuition && amount(intake.feeTableTuition) !== amount(intake.domesticTuition));
  /** The page's own price caveat for these intakes, and a request to confirm when it applies. */
  const priceCaveats = (items: Array<{ entry: ProgramEntry; intake: ProgramIntake }>) => {
    // Campus tables repeat the same caveat with small wording differences; say it once.
    const sameNote = (note: string) => words(note).filter(word => word !== "etc").join(" ");
    const notes = [...new Map(items.map(({ entry, intake }) => priceCaveat(intake.fees) ?? entry.priceNote).filter((note): note is string => Boolean(note)).map(note => [sameNote(note), note])).values()];
    const fromFeeTable = items.some(({ intake }) => priceCaveat(intake.fees));
    const caveat = notes.length ? (locale === "fr" ? `La page précise : « ${notes.join(" ")} »` : `The ${fromFeeTable ? "fee table" : "page"} notes: "${notes.join(" ")}"`) : "";
    const confirm = items.some(({ intake }) => differs(intake)) || notes.some(note => /approximat|last year/i.test(note))
      ? (locale === "fr" ? "Veuillez confirmer le montant actuel auprès du collège." : "Please confirm the current amount with the college.")
      : "";
    return { caveat, confirm };
  };

  if (wantsCharges) {
    // A general fee question, or one naming a line the intake's fee table
    // publishes, is answered by copying those published lines; the model is
    // not asked to restate a table it could misquote or decline.
    const askedItems = words(question).filter(word => FEE_ITEMS.has(word)).map(stem);
    const tabled = programs.flatMap(entry => currentIntakes(entry, now).filter(intake => intake.fees && atCampus(intake) && inTerm(intake) && forCourse(intake)).map(intake => {
      const lines = feeItems(intake.fees!);
      return { entry, intake, lines: askedItems.length ? lines.filter(line => words(line.label).some(word => askedItems.some(item => word.includes(item) || stem(word) === item))) : lines };
    }));
    if (tabled.length && tabled.every(item => item.lines.length)) {
      const shown = tabled.slice(0, 2);
      const single = new Set(shown.map(item => item.entry.title)).size === 1;
      const listed = shown.map(({ entry, intake, lines }) => `${single ? "" : `${entry.title}, `}${intake.campus}, ${intake.term}${locale === "fr" ? " — tableau des frais" : " fee table"}: ${lines.map(line => `${line.label}: ${line.value}`).join("; ")}`).join(". ");
      const mismatches = shown.filter(({ intake }) => differs(intake)).map(({ intake }) => locale === "fr"
        ? `La session de ${intake.campus} indique des droits de scolarité de ${intake.domesticTuition}, alors que son tableau des frais indique ${intake.feeTableTuition}.`
        : `The ${intake.campus} intake lists domestic tuition ${intake.domesticTuition}, while its fee table lists ${intake.feeTableTuition}.`);
      const { caveat, confirm } = priceCaveats(shown);
      const answer = [`${single ? `${shown[0]!.entry.title}, ` : ""}${listed}.`, ...mismatches, caveat, confirm].filter(Boolean).join(" ");
      return { kind: "answer", answer, sources: [...new Set(shown.map(item => item.entry.url))] };
    }
    // Books, application and other fees: ground on the fee table of the intake
    // asked about (campuses publish different tables), plus requirements text
    // where application fees are usually stated.
    const application = /\bappl/i.test(question);
    const chosen = programs.map(entry => ({ entry, intakes: currentIntakes(entry, now).filter(intake => atCampus(intake) && inTerm(intake) && forCourse(intake)) }))
      .filter(item => item.intakes.some(intake => intake.fees) || (application && item.entry.requirements)).slice(0, 3);
    if (!chosen.length) return null;
    // The model may quote a fee table without its caveat; the server adds it.
    const priced = chosen.flatMap(({ entry, intakes }) => intakes.filter(intake => intake.fees).map(intake => ({ entry, intake })));
    const mismatches = priced.filter(({ intake }) => differs(intake)).map(({ intake }) => locale === "fr"
      ? `La session de ${intake.campus} indique des droits de scolarité de ${intake.domesticTuition}, alors que son tableau des frais indique ${intake.feeTableTuition}.`
      : `The ${intake.campus} intake lists domestic tuition ${intake.domesticTuition}, while its fee table lists ${intake.feeTableTuition}.`);
    const { caveat, confirm } = priceCaveats(priced);
    const notices = [...mismatches, caveat].filter(Boolean);
    return {
      kind: "evidence",
      ...(notices.length ? { notices } : {}),
      ...(confirm ? { confirm } : {}),
      passages: chosen.map(({ entry, intakes }) => ({
        chunkId: `catalog:${entry.url}`,
        title: entry.title,
        sourceUrl: entry.url,
        content: [
          `# ${entry.title}`,
          ...intakes.map(intake => [`Intake: ${describeIntake(intake, now, "en")}.`, intake.domesticTuition ? `Intake domestic tuition: ${intake.domesticTuition}.` : "", intake.fees ? `Fee table for this intake:\n${intake.fees}` : ""].filter(Boolean).join("\n")),
          application ? entry.requirements ?? "" : "",
          entry.priceNote && !intakes.some(intake => intake.fees?.includes(entry.priceNote!.slice(0, 40))) ? `Price note: ${entry.priceNote}` : "",
        ].filter(Boolean).join("\n"),
      })),
    };
  }

  if (wantsTuition) {
    // Tuition is published per intake and differs by campus, e.g. Practical
    // Nursing in Yorkton and Melfort. Answer only from intakes that state it,
    // and keep the page's own caveats and any different fee-table figure.
    const priced = programs.flatMap(entry => currentIntakes(entry, now).filter(intake => intake.domesticTuition && atCampus(intake) && inTerm(intake) && forCourse(intake)).map(intake => ({ entry, intake })));
    if (!priced.length) return null;
    const shown = priced.slice(0, 3);
    const more = priced.length - shown.length;
    const single = new Set(shown.map(item => item.entry.title)).size === 1;
    const price = (intake: ProgramIntake) => locale === "fr"
      ? `droits de scolarité ${intake.domesticTuition} (étudiants canadiens)${intake.internationalTuition ? `, ${intake.internationalTuition} (étudiants internationaux)` : ""}${differs(intake) ? ` (le tableau des frais de la même page indique ${intake.feeTableTuition})` : ""}`
      : `domestic tuition ${intake.domesticTuition}${intake.internationalTuition ? `, international tuition ${intake.internationalTuition}` : ""}${differs(intake) ? ` (the fee table on the same page lists ${intake.feeTableTuition})` : ""}`;
    const listed = shown.map(({ entry, intake }) => `${single ? "" : `${entry.title}, `}${intake.campus}, ${intake.term}${intake.course ? ` (${intake.course})` : ""}: ${price(intake)}`).join("; ");
    const caveats = Object.values(priceCaveats(shown)).filter(Boolean).join(" ");
    const answer = `${single ? `${shown[0]!.entry.title}, ` : ""}${listed}.${more > 0 ? (locale === "fr" ? ` Il y a ${more} autres offres publiées.` : ` There ${more === 1 ? "is 1 more published offering" : `are ${more} more published offerings`}.`) : ""}${caveats ? ` ${caveats}` : ""}`;
    return { kind: "answer", answer, sources: [...new Set(shown.map(item => item.entry.url))] };
  }

  if (programs.length) {
    const scheduled = programs.filter(entry => entry.intakes.length);
    // Pages without published intakes are described better by the page text itself.
    if (!scheduled.length) return null;
    const name = joinNames([...new Set(scheduled.map(entry => baseTitle(entry.title)))], locale);
    const matching = scheduled.map(entry => ({ entry, intakes: currentIntakes(entry, now).filter(intake => atCampus(intake) && inTerm(intake) && forCourse(intake)) })).filter(item => item.intakes.length);
    // Several programs: keep each program's own campuses rather than one merged list.
    const byProgram = (items: Array<{ entry: ProgramEntry; intakes: ProgramIntake[] }>) => {
      const groups = new Map<string, Map<string, Set<string>>>();
      for (const { entry, intakes } of items) {
        const places = groups.get(baseTitle(entry.title)) ?? new Map<string, Set<string>>();
        for (const intake of intakes) places.set(intake.campus, (places.get(intake.campus) ?? new Set()).add(intake.term));
        groups.set(baseTitle(entry.title), places);
      }
      return [...groups].filter(([, places]) => places.size).map(([program, places]) => `${program}: ${[...places].slice(0, 6).map(([place, terms]) => `${place} (${[...terms].join(", ")})`).join(", ")}`);
    };
    const programCount = new Set(scheduled.map(entry => baseTitle(entry.title))).size;
    if (!matching.length) {
      const elsewhere = programCount > 1
        ? byProgram(scheduled.map(entry => ({ entry, intakes: currentIntakes(entry, now) })))
        : [...new Set(scheduled.flatMap(entry => currentIntakes(entry, now).map(intake => `${intake.campus} (${intake.term})`)))];
      const where = [campusName, termName].filter(Boolean).join(", ");
      const answer = locale === "fr"
        ? `Je ne trouve aucune session publiée pour ${name}${where ? ` (${where})` : ""}.${elsewhere.length ? ` Sessions publiées : ${elsewhere.slice(0, 6).join(", ")}.` : ""}`
        : `I couldn't find a published ${name} intake${where ? ` for ${where}` : ""}.${elsewhere.length ? (programCount > 1 ? ` Published intakes are ${elsewhere.slice(0, 4).join("; ")}.` : ` Published intakes are ${joinNames(elsewhere.slice(0, 6), locale)}.`) : ""}`;
      return { kind: "answer", answer, sources: scheduled.map(entry => entry.url).slice(0, 3) };
    }
    const intakes = matching.flatMap(item => item.intakes.map(intake => ({ entry: item.entry, intake })));
    const sources = [...new Set(matching.map(item => item.entry.url))].slice(0, 3);
    const matchedPrograms = new Set(matching.map(item => baseTitle(item.entry.title)));
    if (!campus && matchedPrograms.size > 4) {
      const answer = locale === "fr"
        ? `Plusieurs programmes correspondent : ${joinNames([...matchedPrograms], locale)}. Lequel vous intéresse ?`
        : `Several programs match: ${joinNames([...matchedPrograms], locale)}. Which program do you mean?`;
      return { kind: "answer", answer, sources };
    }
    // Each detailed line names its program; larger answers are grouped by program.
    if (!campus && matchedPrograms.size > 1 && intakes.length > 3) {
      const answer = `${byProgram(matching).join("; ")}.${locale === "fr" ? " Quel programme vous intéresse ?" : " Which program are you interested in?"}`;
      return { kind: "answer", answer, sources };
    }
    if (!campus && intakes.length > 3) {
      // Many campus pages: summarise campuses and terms; the caller can narrow it down.
      const byCampus = new Map<string, Set<string>>();
      for (const { intake } of intakes) byCampus.set(intake.campus, (byCampus.get(intake.campus) ?? new Set()).add(intake.term));
      const places = [...byCampus].slice(0, 8).map(([place, terms]) => `${place} (${[...terms].join(", ")})`);
      const answer = locale === "fr"
        ? `${name} est offert à : ${places.join("; ")}. Quel campus vous intéresse ?`
        : `${name} has published offerings at ${joinNames(places, locale)}. Which campus are you interested in?`;
      return { kind: "answer", answer, sources };
    }
    const shown = intakes.slice(0, 3);
    const more = intakes.length - shown.length;
    const single = new Set(shown.map(item => item.entry.title)).size === 1;
    const listed = shown.map(({ entry, intake }) => `${single ? "" : `${entry.title}: `}${describeIntake(intake, now, locale)}`).join("; ");
    // A named program with nothing at this campus or term must not go unmentioned.
    const missing = [...new Set(scheduled.map(entry => baseTitle(entry.title)))].filter(program => !matchedPrograms.has(program));
    const where = [campusName, termName].filter(Boolean).join(", ");
    const absent = missing.length ? (locale === "fr" ? ` Aucune session publiée pour ${joinNames(missing, locale)}${where ? ` (${where})` : ""}.` : ` I couldn't find a published ${joinNames(missing, locale)} intake${where ? ` for ${where}` : ""}.`) : "";
    const answer = locale === "fr"
      ? `${single ? `${shown[0]!.entry.title} : ` : ""}${listed}.${more > 0 ? ` Il y a ${more} autres offres publiées.` : ""}${absent}`
      : `${single ? `${shown[0]!.entry.title}: ` : ""}${listed}.${more > 0 ? ` There ${more === 1 ? "is 1 more published offering" : `are ${more} more published offerings`}.` : ""}${absent}`;
    return { kind: "answer", answer, sources };
  }

  // No program named: list programs offered at a campus or in a term.
  if (!wantsRequirements && !wantsTuition && (campus || term) && CATALOG_LIST.test(question)) {
    const campusWords = new Set(catalog.flatMap(entry => entry.intakes.flatMap(intake => words(intake.campus))));
    const subject = words(question).filter(word => word.length > 3 && !GENERIC.has(word) && !SEASONS.has(word) && !QUESTION_WORDS.has(word) && !campusWords.has(word)).map(stem);
    const byArea = (entry: ProgramEntry) => words(`${entry.area ?? ""} ${baseTitle(entry.title)}`).some(word => subject.includes(stem(word)));
    let offered = catalog.filter(entry => currentIntakes(entry, now).some(intake => atCampus(intake) && inTerm(intake)));
    if (offered.some(byArea)) offered = offered.filter(byArea);
    if (!offered.length) return null;
    const titles = [...new Set(offered.map(entry => baseTitle(entry.title)))];
    const shown = titles.slice(0, 12);
    const more = titles.length - shown.length;
    const where = campusName && termName ? `${termName} intake ${campus === "online" ? "online" : `at ${campusName}`}` : campusName ? (campus === "online" ? "online intake" : `intake at ${campusName}`) : `${termName} intake`;
    const answer = locale === "fr"
      ? `Programmes avec une session publiée (${[campusName, termName].filter(Boolean).join(", ")}) : ${shown.join(", ")}${more > 0 ? `, et ${more} autres` : ""}.`
      : `Programs with a published ${where}: ${joinNames(more > 0 ? [...shown, `${more} more`] : shown, locale)}.`;
    return { kind: "answer", answer, sources: [...new Set(offered.map(entry => entry.url))].slice(0, 3) };
  }
  return null;
}
