export type MatchInput = { required: { id: string; name: string }[]; studentSkillIds: string[] };
export type MatchResult = { score: number | null; matched: string[]; missing: string[]; label: string };

export function recommend(input: MatchInput): MatchResult {
  const have = new Set(input.studentSkillIds);
  const matched = input.required.filter((s) => have.has(s.id)).map((s) => s.name);
  const missing = input.required.filter((s) => !have.has(s.id)).map((s) => s.name);
  if (input.required.length === 0) return { score: null, matched, missing, label: "No skills specified" };
  const score = Math.round((100 * matched.length) / input.required.length);
  return { score, matched, missing, label: score >= 75 ? "Strong match" : score >= 40 ? "Partial match" : "Low match" };
}

// Applicant ranking is intentionally unsupported: recommendations are student-facing only.
export function sortOpportunitiesByMatch<T extends { score: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
