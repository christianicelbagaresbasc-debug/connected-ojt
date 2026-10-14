export type Role = "COORDINATOR" | "CO_COORDINATOR" | "STUDENT" | "COMPANY" | "ATTORNEY";
export type AppStatus = "PENDING" | "UNDER_REVIEW" | "ACCEPTED" | "DECLINED" | "REJECTED" | "WITHDRAWN" | "PLACED";
export type ApplicationContext = {
  isOwnCompany?: boolean; isAssignedStudent?: boolean; note?: string;
  studentApproved?: boolean; opportunityVisible?: boolean; duplicate?: boolean;
  hasActivePlacement?: boolean; studentConfirmed?: boolean; freeSlots?: number;
  approvedMoa?: boolean; overrideReason?: string;
};

const staff = (role: Role, ctx: ApplicationContext) => role === "COORDINATOR" || (role === "CO_COORDINATOR" && !!ctx.isAssignedStudent);
const final = new Set<AppStatus>(["DECLINED", "REJECTED", "WITHDRAWN", "PLACED"]);

export function canTransition(actorRole: Role, from: AppStatus | null, to: AppStatus, ctx: ApplicationContext = {}): boolean {
  if (from === null && to === "PENDING") return actorRole === "STUDENT" && !!ctx.studentApproved && !!ctx.opportunityVisible && !ctx.duplicate && !ctx.hasActivePlacement;
  if (from === null || final.has(from)) return false;
  if (from === "PENDING" && to === "UNDER_REVIEW") return (actorRole === "COMPANY" && !!ctx.isOwnCompany) || staff(actorRole, ctx);
  if ((from === "PENDING" || from === "UNDER_REVIEW") && (to === "ACCEPTED" || to === "DECLINED"))
    return (actorRole === "COMPANY" && !!ctx.isOwnCompany) || (staff(actorRole, ctx) && !!ctx.note?.trim());
  if (["PENDING", "UNDER_REVIEW", "ACCEPTED"].includes(from) && to === "REJECTED") return staff(actorRole, ctx) && !!ctx.note?.trim();
  if (["PENDING", "UNDER_REVIEW", "ACCEPTED"].includes(from) && to === "WITHDRAWN") return actorRole === "STUDENT";
  if (from === "ACCEPTED" && to === "PLACED") return staff(actorRole, ctx) && !!ctx.studentConfirmed && (ctx.freeSlots ?? 0) > 0 && !ctx.hasActivePlacement && (!!ctx.approvedMoa || !!ctx.overrideReason?.trim());
  return false;
}

export type DocAccess = { id?: string; kind: string; legalStatus: string; uploadedById: string; studentId?: string | null; companyId?: string | null; applicationCompanyId?: string | null; studentOwnerId?: string | null; assignedStudent?: boolean; ownCompany?: boolean; studentApplied?: boolean };
export function canViewDocument(role: Role, userId: string, doc: DocAccess): boolean {
  if (role === "COORDINATOR") return true;
  if (doc.uploadedById === userId) return true;
  if (role === "CO_COORDINATOR") return !!doc.assignedStudent;
  if (role === "ATTORNEY") return doc.legalStatus !== "NOT_REQUIRED";
  const publishedMoa = doc.kind !== "MOA" || doc.legalStatus === "APPROVED";
  if (role === "STUDENT") return doc.studentOwnerId === userId && publishedMoa;
  if (role === "COMPANY") {
    if (doc.ownCompany || doc.applicationCompanyId === doc.companyId) return publishedMoa;
    return !!doc.studentApplied && ["RESUME", "CERTIFICATION"].includes(doc.kind);
  }
  return false;
}

export function canConfirmPlacement(input: { studentConfirmed: boolean; freeSlots: number; hasActivePlacement: boolean; approvedMoa: boolean; overrideReason?: string | null }): boolean {
  return input.studentConfirmed && input.freeSlots > 0 && !input.hasActivePlacement && (input.approvedMoa || !!input.overrideReason?.trim());
}

export function canTransitionVerification(from: string, to: string): boolean {
  if (from === to) return true;
  return from === "PENDING" ? to === "UNDER_REVIEW" || to === "REJECTED" : from === "UNDER_REVIEW" && ["VERIFIED", "REJECTED", "PENDING"].includes(to);
}
