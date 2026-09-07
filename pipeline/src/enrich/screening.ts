/**
 * AGENT I owns this module.
 *
 * Deterministic backstop for post screening. The classification prompt in
 * `index.ts` asks the model to flag `unsuitable` posts (toxic/harassing/
 * sexual/discriminatory/spam/promotional, or about a person's misfortune
 * rather than about the place), but model judgement varies run to run — the
 * same borderline post can come back `unsuitable: false` on one run and
 * `true` on the next. `isDenylisted` is applied AFTER classification and can
 * only ever tighten the model's call, never loosen it: `index.ts` forces
 * `unsuitable = true` whenever it matches, regardless of what the model said.
 * A model that returns confident nonsense (`unsuitable: false` on a post that
 * is plainly spam) cannot get that post into synthesis or a quote, because
 * this check does not consult the model's answer at all.
 *
 * This is a stopgap, not a moderation system. The categories below are chosen
 * because regex is actually reliable for them (advertising/solicitation
 * boilerplate, sexual-content signposting, and the vocabulary of death/
 * violence/victimhood that marks a post as being about a person's misfortune
 * rather than about a destination). General hate speech and discriminatory
 * language is NOT hand-rolled here — a short word list is a poor substitute
 * for a maintained moderation service and tends to both miss obfuscated slurs
 * and false-positive on reclaimed language, so that category is left to the
 * model's `unsuitable` classification instead. See `docs/content-guidelines.md`
 * for the recommended follow-up (a maintained profanity/moderation library or
 * API) before this needs to scale past MVP.
 */

export type DenylistCategory = 'promotional' | 'sexual' | 'misfortune' | 'harassment';

export type DenylistMatch = { category: DenylistCategory; pattern: string };

// Advertising/solicitation boilerplate. Genuine travel posts essentially never
// contain these phrases, so this category carries very low false-positive risk.
const PROMOTIONAL_PATTERNS: RegExp[] = [
  /\bdm me\b/i,
  /\blink in bio\b/i,
  /\buse code\b/i,
  /\bdiscount code\b/i,
  /\bpromo code\b/i,
  /\d{1,2}\s*%\s*off\b/i,
  /\bswipe up\b/i,
  /\bfollow for follow\b/i,
  /\bcheck out my\b/i,
  /\bclick (the )?link\b/i,
  /\bwhatsapp me\b/i,
  /\btelegram me\b/i,
  /\bfree airdrop\b/i,
  /\bcrypto giveaway\b/i,
  /\blimited time offer\b/i,
  /\bbook (your|now).{0,20}\bcommission\b/i,
];

// Sexual content/solicitation signposting. Kept to unambiguous terms that
// virtually never appear in a genuine post about visiting a place.
const SEXUAL_PATTERNS: RegExp[] = [
  /\bnsfw\b/i,
  /\bonlyfans\b/i,
  /\bescorts?\b/i,
  /\bhookup app\b/i,
  /\bxxx\b/i,
  /\bnudes?\b/i,
];

// Vocabulary that overwhelmingly signals a post is about a person's death,
// injury, or victimisation rather than about the destination as a place to
// visit — exactly the "quoting someone's personal misfortune" failure mode
// this exists to catch, regardless of how the model classified the post.
const MISFORTUNE_PATTERNS: RegExp[] = [
  /\bpassed away\b/i,
  /\br\.?i\.?p\.?\b/i,
  /\bfuneral\b/i,
  /\bobituary\b/i,
  /\bwas (killed|murdered|stabbed|shot|raped|assaulted|kidnapped)\b/i,
  /\bwent missing\b/i,
  /\bmissing person\b/i,
  /\btragic accident\b/i,
  /\bhospitali[sz]ed after\b/i,
  /\bdied (in|at|while)\b/i,
];

// Direct threats and self-harm incitement — a real, mechanically-detectable
// slice of "toxic/harassing" that doesn't require a slur list to catch.
const HARASSMENT_PATTERNS: RegExp[] = [
  /\bkill (yourself|urself)\b/i,
  /\bkys\b/,
  /\bi hope you die\b/i,
  /\bi('| a)?m going to kill you\b/i,
  /\bi will kill you\b/i,
];

const CATEGORY_PATTERNS: Record<DenylistCategory, RegExp[]> = {
  promotional: PROMOTIONAL_PATTERNS,
  sexual: SEXUAL_PATTERNS,
  misfortune: MISFORTUNE_PATTERNS,
  harassment: HARASSMENT_PATTERNS,
};

/** Every deterministic denylist match for `text` — empty if none. */
export function findDenylistMatches(text: string): DenylistMatch[] {
  const matches: DenylistMatch[] = [];
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as [
    DenylistCategory,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(text)) matches.push({ category, pattern: pattern.source });
    }
  }
  return matches;
}

/** True if `text` matches any deterministic denylist rule. */
export function isDenylisted(text: string): boolean {
  for (const patterns of Object.values(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}
