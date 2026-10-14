import { describe, expect, it } from "vitest";
import { recommend, sortOpportunitiesByMatch } from "../lib/matching";

describe("student opportunity recommendations", () => {
  it("returns transparent matched and missing skills", () => {
    expect(recommend({ required: [{ id: "1", name: "TypeScript" }, { id: "2", name: "SQL" }], studentSkillIds: ["1"] })).toEqual({ score: 50, matched: ["TypeScript"], missing: ["SQL"], label: "Partial match" });
  });
  it("labels opportunities with no specified skills without inventing a score", () => {
    expect(recommend({ required: [], studentSkillIds: [] })).toEqual({ score: null, matched: [], missing: [], label: "No skills specified" });
  });
  it("sorts opportunities only; applicant ranking is intentionally not implemented", () => {
    expect(sortOpportunitiesByMatch([{ score: 25 }, { score: 90 }])).toEqual([{ score: 90 }, { score: 25 }]);
  });
});
