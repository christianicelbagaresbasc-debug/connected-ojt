import { describe, expect, it } from "vitest";
import { canConfirmPlacement, canTransition, canViewDocument, canTransitionVerification } from "../lib/workflow";

describe("workflow rules", () => {
  it("only approved students can apply to visible opportunities without placement or duplicate", () => {
    const ctx = { studentApproved: true, opportunityVisible: true };
    expect(canTransition("STUDENT", null, "PENDING", ctx)).toBe(true);
    expect(canTransition("STUDENT", null, "PENDING", { ...ctx, hasActivePlacement: true })).toBe(false);
  });
  it("requires staff notes for decisions recorded on a company's behalf", () => {
    expect(canTransition("COORDINATOR", "PENDING", "ACCEPTED", { note: "Called" })).toBe(true);
    expect(canTransition("COORDINATOR", "PENDING", "ACCEPTED", {})).toBe(false);
  });
  it("requires an approved MOA or reason plus all placement conditions", () => {
    expect(canConfirmPlacement({ studentConfirmed: true, freeSlots: 1, hasActivePlacement: false, approvedMoa: true })).toBe(true);
    expect(canConfirmPlacement({ studentConfirmed: true, freeSlots: 0, hasActivePlacement: false, approvedMoa: true })).toBe(false);
    expect(canConfirmPlacement({ studentConfirmed: true, freeSlots: 1, hasActivePlacement: false, approvedMoa: false, overrideReason: "Urgent paper approval" })).toBe(true);
  });
  it("publishes MOAs only after attorney approval to students and companies", () => {
    const doc = { kind: "MOA", legalStatus: "PENDING_REVIEW", uploadedById: "staff", studentId: "student", companyId: "co", studentOwnerId: "student", ownCompany: true };
    expect(canViewDocument("STUDENT", "student", doc)).toBe(false);
    expect(canViewDocument("COMPANY", "rep", doc)).toBe(false);
    expect(canViewDocument("ATTORNEY", "law", doc)).toBe(true);
    expect(canViewDocument("COORDINATOR", "staff", doc)).toBe(true);
  });
  it("allows coordinator verification state changes through the documented path", () => {
    expect(canTransitionVerification("PENDING", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionVerification("PENDING", "VERIFIED")).toBe(false);
    expect(canTransitionVerification("UNDER_REVIEW", "VERIFIED")).toBe(true);
  });
});
