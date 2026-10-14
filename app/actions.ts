"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, clearSession, readSession } from "@/lib/session";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { notify, notifyRole } from "@/lib/notify";
import { canAccessStudent, requireRole, type CurrentUser } from "@/lib/auth";
import { canConfirmPlacement, canTransition, canTransitionVerification } from "@/lib/workflow";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { validateUploadBytes } from "@/lib/files";

export type FormState = { error?: string; success?: string };
export async function loginAction(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return { error: "Invalid email or password" };
  await createSession(user.id);
  redirect(user.mustChangePassword ? "/change-password" : ({ COORDINATOR: "/coordinator", CO_COORDINATOR: "/co-coordinator", STUDENT: "/student", COMPANY: "/company", ATTORNEY: "/attorney" }[user.role]));
}
export async function registerAction(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({ name: form.get("name"), email: form.get("email"), studentNumber: form.get("studentNumber"), password: form.get("password") });
  if (!parsed.success) return { error: "Check each field. Passwords need at least 8 characters, a letter, and a number." };
  const data = parsed.data;
  try {
    const hash = await bcrypt.hash(data.password, 12);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: data.name, email: data.email.toLowerCase(), passwordHash: hash, role: "STUDENT" } });
      await tx.studentProfile.create({ data: { userId: user.id, studentNumber: data.studentNumber } });
    });
  } catch { return { error: "That email or student number is already registered." }; }
  return { success: "Registration submitted. A coordinator must approve your account before you can apply." };
}
export async function logoutAction() { await clearSession(); redirect("/login"); }
export async function markNotificationsReadAction() {
  const id = await readSession();
  if (!id) redirect("/login");
  await db.notification.updateMany({ where: { userId: id, read: false }, data: { read: true } });
}
export async function changePasswordAction(_state: FormState, form: FormData): Promise<FormState> {
  const id = await readSession();
  if (!id) redirect("/login");
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success) return { error: "Use at least 8 characters with a letter and a number." };
  const passwordHash = await bcrypt.hash(password.data, 12);
  const user = await db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: false }, select: { role: true } });
  await audit(id, "PASSWORD_CHANGED", "User", id);
  redirect(({ COORDINATOR: "/coordinator", CO_COORDINATOR: "/co-coordinator", STUDENT: "/student", COMPANY: "/company", ATTORNEY: "/attorney" }[user.role]));
}

const idSchema = z.string().trim().min(1).max(100);
const noteSchema = z.string().trim().max(2000).nullish();
const revalidateWorkspaces = (...paths: string[]) => paths.forEach((path) => revalidatePath(path));

export async function approveStudentAction(form: FormData) {
  const actor = await requireRole("COORDINATOR");
  const studentId = idSchema.safeParse(form.get("studentId"));
  const status = z.enum(["APPROVED", "REJECTED"]).safeParse(form.get("status"));
  const note = noteSchema.safeParse(form.get("note"));
  if (!studentId.success || !status.success || !note.success) return;
  const student = await db.studentProfile.findUnique({ where: { id: studentId.data }, select: { userId: true } });
  if (!student) return;
  await db.studentProfile.update({ where: { id: studentId.data }, data: { approval: status.data } });
  await audit(actor.id, `STUDENT_${status.data}`, "StudentProfile", studentId.data, note.data ?? undefined);
  await notify(student.userId, `Your student account was ${status.data.toLowerCase()}.`, "/student");
  revalidateWorkspaces("/coordinator/students", "/coordinator");
}

export async function assignStudentAction(form: FormData) {
  const actor = await requireRole("COORDINATOR");
  const input = z.object({ studentId: idSchema, assignedToId: z.string().trim().max(100) }).safeParse({ studentId: form.get("studentId"), assignedToId: form.get("assignedToId") });
  if (!input.success) return;
  const student = await db.studentProfile.findUnique({ where: { id: input.data.studentId }, select: { userId: true } });
  if (!student) return;
  if (input.data.assignedToId) {
    const assignee = await db.user.findFirst({ where: { id: input.data.assignedToId, role: "CO_COORDINATOR", isActive: true }, select: { id: true } });
    if (!assignee) return;
  }
  await db.studentProfile.update({ where: { id: input.data.studentId }, data: { assignedToId: input.data.assignedToId || null } });
  await audit(actor.id, "STUDENT_ASSIGNED", "StudentProfile", input.data.studentId);
  await notify(student.userId, input.data.assignedToId ? "A Co-OJT Coordinator has been assigned to support your placement." : "Your Co-OJT Coordinator assignment was removed.", "/student");
  revalidateWorkspaces("/coordinator/students", "/co-coordinator/students");
}

export async function saveStudentProfileAction(form: FormData) {
  const actor = await requireRole("STUDENT");
  const data = z.object({ headline: z.string().trim().max(160), about: z.string().trim().max(2000), phone: z.string().trim().max(40), location: z.string().trim().max(160), portfolioUrl: z.string().trim().max(500).url().or(z.literal("")) }).safeParse({ headline: form.get("headline"), about: form.get("about"), phone: form.get("phone"), location: form.get("location"), portfolioUrl: form.get("portfolioUrl") });
  if (!data.success) return;
  const profile = await db.studentProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!profile) return;
  await db.studentProfile.update({ where: { id: profile.id }, data: { ...data.data, portfolioUrl: data.data.portfolioUrl || null } });
  await audit(actor.id, "STUDENT_PROFILE_UPDATED", "StudentProfile", profile.id);
  revalidateWorkspaces("/student/profile", "/student");
}

export async function applyOpportunityAction(form: FormData) {
  const actor = await requireRole("STUDENT");
  const input = z.object({ opportunityId: idSchema, coverNote: z.string().trim().max(2000).optional() }).safeParse({ opportunityId: form.get("opportunityId"), coverNote: form.get("coverNote") });
  if (!input.success) return;
  const student = await db.studentProfile.findUnique({ where: { userId: actor.id }, include: { placements: { where: { status: "ACTIVE" }, select: { id: true } } } });
  const opportunity = await db.opportunity.findUnique({ where: { id: input.data.opportunityId }, include: { company: { include: { reps: { select: { id: true } } } }, applications: { where: { status: { in: ["PENDING", "UNDER_REVIEW", "ACCEPTED"] } }, select: { id: true } }, placements: { where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true } } } });
  if (!student || !opportunity) return;
  const visible = opportunity.status === "OPEN" && opportunity.company.verification === "VERIFIED" && (!opportunity.deadline || opportunity.deadline > new Date()) && opportunity.slots > opportunity.placements.length;
  const duplicate = !!(await db.application.findUnique({ where: { studentId_opportunityId: { studentId: student.id, opportunityId: opportunity.id } }, select: { id: true } }));
  const allowed = canTransition("STUDENT", null, "PENDING", { studentApproved: student.approval === "APPROVED", opportunityVisible: visible, duplicate, hasActivePlacement: student.placements.length > 0 });
  if (!allowed) return;
  const application = await db.application.create({ data: { studentId: student.id, opportunityId: opportunity.id, coverNote: input.data.coverNote || null } });
  await audit(actor.id, "APPLICATION_SUBMITTED", "Application", application.id);
  await Promise.all(opportunity.company.reps.map((rep) => notify(rep.id, `A student applied to ${opportunity.title}.`, `/company/applications/${application.id}`)));
  await notifyRole("COORDINATOR", `A student applied to ${opportunity.title}.`, "/coordinator/applications");
  revalidateWorkspaces("/student/opportunities", "/student/applications");
}

export async function studentApplicationAction(form: FormData) {
  const actor = await requireRole("STUDENT");
  const input = z.object({ applicationId: idSchema, intent: z.enum(["CONFIRM", "DECLINE", "WITHDRAW"]) }).safeParse({ applicationId: form.get("applicationId"), intent: form.get("intent") });
  if (!input.success) return;
  const application = await db.application.findFirst({
    where: { id: input.data.applicationId, student: { userId: actor.id } },
    include: { opportunity: { include: { company: { include: { reps: { select: { id: true } } } } } } }
  });
  if (!application) return;
  if (input.data.intent === "CONFIRM" && application.status === "ACCEPTED") {
    await db.application.update({ where: { id: application.id }, data: { studentConfirmed: true } });
    await Promise.all(application.opportunity.company.reps.map((rep) => notify(rep.id, "A student confirmed an accepted offer.", `/company/applications/${application.id}`)));
  } else if (input.data.intent === "DECLINE" && application.status === "ACCEPTED") {
    await db.application.update({ where: { id: application.id }, data: { status: "DECLINED", studentConfirmed: false } });
  } else if (input.data.intent === "WITHDRAW" && ["PENDING", "UNDER_REVIEW"].includes(application.status)) {
    await db.application.update({ where: { id: application.id }, data: { status: "WITHDRAWN" } });
  } else return;
  await audit(actor.id, `APPLICATION_${input.data.intent}`, "Application", application.id);
  revalidateWorkspaces("/student/applications", `/student/applications/${application.id}`, "/company/applicants");
}

export async function reviewApplicationAction(form: FormData) {
  const actor = await requireRole("COORDINATOR", "CO_COORDINATOR", "COMPANY");
  const input = z.object({ applicationId: idSchema, status: z.enum(["UNDER_REVIEW", "ACCEPTED", "DECLINED", "REJECTED"]), note: z.string().trim().max(2000) }).safeParse({ applicationId: form.get("applicationId"), status: form.get("status"), note: form.get("note") });
  if (!input.success) return;
  const application = await db.application.findUnique({ where: { id: input.data.applicationId }, include: { student: true, opportunity: { include: { company: true } } } });
  if (!application) return;
  const ownCompany = actor.role === "COMPANY" && actor.companyId === application.opportunity.companyId;
  const assigned = actor.role === "CO_COORDINATOR" && application.student.assignedToId === actor.id;
  if (actor.role === "COMPANY" && !ownCompany || actor.role === "CO_COORDINATOR" && !assigned) return;
  const needsStaffReason = actor.role !== "COMPANY" && input.data.status !== "UNDER_REVIEW";
  if (needsStaffReason && !input.data.note.trim()) return;
  const allowed = canTransition(actor.role, application.status, input.data.status, { isOwnCompany: ownCompany, isAssignedStudent: assigned, note: input.data.note });
  if (!allowed) return;
  await db.application.update({ where: { id: application.id }, data: { status: input.data.status, ...(ownCompany ? { companyNote: input.data.note || null } : { coordinatorNote: input.data.note || null }) } });
  await audit(actor.id, `APPLICATION_${input.data.status}`, "Application", application.id, input.data.note);
  await notify(application.student.userId, `Your application status changed to ${input.data.status.replaceAll("_", " ")}.`, `/student/applications/${application.id}`);
  revalidateWorkspaces("/coordinator/applications", "/co-coordinator/applications", "/company/applicants", `/student/applications/${application.id}`);
}

export async function verifyCompanyAction(form: FormData) {
  const actor = await requireRole("COORDINATOR");
  const input = z.object({ companyId: idSchema, verification: z.enum(["UNDER_REVIEW", "VERIFIED", "REJECTED", "PENDING"]), partnerType: z.enum(["EXISTING_PARTNER", "NEW_COMPANY"]), note: z.string().trim().max(2000) }).safeParse({ companyId: form.get("companyId"), verification: form.get("verification"), partnerType: form.get("partnerType"), note: form.get("note") });
  if (!input.success) return;
  const company = await db.company.findUnique({ where: { id: input.data.companyId }, select: { verification: true, reps: { select: { id: true } } } });
  if (!company || !canTransitionVerification(company.verification, input.data.verification)) return;
  await db.company.update({ where: { id: input.data.companyId }, data: { verification: input.data.verification, partnerType: input.data.partnerType, verificationNotes: input.data.note || null, verifiedAt: input.data.verification === "VERIFIED" ? new Date() : null } });
  await audit(actor.id, `COMPANY_${input.data.verification}`, "Company", input.data.companyId, input.data.note);
  await Promise.all(company.reps.map((rep) => notify(rep.id, `Company verification is now ${input.data.verification.toLowerCase().replaceAll("_", " ")}.`, "/company")));
  revalidateWorkspaces("/coordinator/companies", "/coordinator");
}

export async function createOpportunityAction(form: FormData) {
  const actor = await requireRole("COMPANY");
  const input = z.object({ title: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(5000), tasks: z.string().trim().max(3000), qualifications: z.string().trim().max(3000), slots: z.coerce.number().int().min(1).max(100), location: z.string().trim().max(200), workArrangement: z.enum(["ON_SITE", "REMOTE", "HYBRID"]), deadline: z.string().trim().max(30) }).safeParse({ title: form.get("title"), description: form.get("description"), tasks: form.get("tasks"), qualifications: form.get("qualifications"), slots: form.get("slots"), location: form.get("location"), workArrangement: form.get("workArrangement"), deadline: form.get("deadline") });
  if (!input.success || !actor.companyId) return;
  const company = await db.company.findUnique({ where: { id: actor.companyId }, select: { verification: true } });
  if (!company || company.verification !== "VERIFIED") return;
  const opportunity = await db.opportunity.create({ data: { companyId: actor.companyId, title: input.data.title, description: input.data.description, tasks: input.data.tasks || null, qualifications: input.data.qualifications || null, slots: input.data.slots, location: input.data.location || null, workArrangement: input.data.workArrangement, deadline: input.data.deadline ? new Date(input.data.deadline) : null } });
  await audit(actor.id, "OPPORTUNITY_CREATED", "Opportunity", opportunity.id);
  await notifyRole("COORDINATOR", `A new opportunity was posted by a verified company.`, "/coordinator/opportunities");
  revalidateWorkspaces("/company/opportunities", "/company");
  redirect(`/company/opportunities/${opportunity.id}`);
}

export async function reviewDocumentAction(form: FormData) {
  const actor = await requireRole("ATTORNEY");
  const input = z.object({ documentId: idSchema, action: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]), comment: z.string().trim().max(2000) }).safeParse({ documentId: form.get("documentId"), action: form.get("action"), comment: form.get("comment") });
  if (!input.success) return;
  const document = await db.document.findUnique({ where: { id: input.data.documentId }, select: { legalStatus: true, kind: true, uploadedById: true } });
  if (!document || document.legalStatus === "NOT_REQUIRED") return;
  await db.$transaction([db.document.update({ where: { id: input.data.documentId }, data: { legalStatus: input.data.action } }), db.documentReview.create({ data: { documentId: input.data.documentId, reviewerId: actor.id, action: input.data.action, comment: input.data.comment || null } })]);
  await audit(actor.id, `DOCUMENT_${input.data.action}`, "Document", input.data.documentId, input.data.comment);
  await notify(document.uploadedById, `Your ${document.kind.replaceAll("_", " ")} document was ${input.data.action.toLowerCase().replaceAll("_", " ")}.`, "/student/placement");
  revalidateWorkspaces("/attorney", "/attorney/history", "/coordinator");
}

export async function uploadDocumentAction(form: FormData) {
  const actor = await requireRole("COORDINATOR", "CO_COORDINATOR", "STUDENT", "COMPANY");
  const input = z.object({ kind: z.enum(["MOA", "SEC_REGISTRATION", "DTI_REGISTRATION", "BUSINESS_CERTIFICATE", "INTERNSHIP_CONTRACT", "COMPLETION_CERTIFICATE", "ACCOMPLISHMENT_REPORT", "WEEKLY_REPORT", "RESUME", "CERTIFICATION", "OTHER"]), applicationId: z.string().trim().max(100).optional(), note: z.string().trim().max(2000).optional() }).safeParse({ kind: form.get("kind"), applicationId: form.get("applicationId") || undefined, note: form.get("note") || undefined });
  const file = form.get("file");
  if (!input.success || !(file instanceof File)) return;
  const checked = await validateUploadBytes(file);
  if (!checked.ok) return;
  let studentId: string | null = null;
  let companyId: string | null = null;
  if (actor.role === "STUDENT") {
    const student = await db.studentProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!student) return;
    studentId = student.id;
  } else if (actor.role === "COMPANY") {
    companyId = actor.companyId;
    if (!companyId) return;
  }
  let applicationId: string | null = null;
  if (input.data.applicationId) {
    const app = await db.application.findUnique({ where: { id: input.data.applicationId }, select: { id: true, studentId: true, opportunity: { select: { companyId: true } } } });
    if (!app || actor.role === "STUDENT" && app.studentId !== studentId || actor.role === "COMPANY" && app.opportunity.companyId !== companyId || actor.role === "CO_COORDINATOR" && !(await canAccessStudent(actor as CurrentUser, app.studentId))) return;
    applicationId = app.id;
    studentId = app.studentId;
    companyId = app.opportunity.companyId;
  }
  const requiresLegal = ["MOA", "INTERNSHIP_CONTRACT", "SEC_REGISTRATION", "DTI_REGISTRATION", "BUSINESS_CERTIFICATE"].includes(input.data.kind);
  const doc = await db.document.create({ data: { kind: input.data.kind, fileName: file.name.slice(0, 255), mimeType: file.type, size: checked.bytes.length, data: checked.bytes, note: input.data.note || null, uploadedById: actor.id, studentId, companyId, applicationId, legalStatus: requiresLegal ? "PENDING_REVIEW" : "NOT_REQUIRED" } });
  await audit(actor.id, "DOCUMENT_UPLOADED", "Document", doc.id, input.data.kind);
  if (requiresLegal) await notifyRole("ATTORNEY", `A ${input.data.kind.replaceAll("_", " ")} document is ready for legal review.`, `/attorney/documents/${doc.id}`);
  revalidateWorkspaces("/student/placement", "/student/applications", "/company/applicants", "/coordinator/companies", "/attorney");
}

export async function confirmPlacementAction(form: FormData) {
  const actor = await requireRole("COORDINATOR", "CO_COORDINATOR");
  const input = z.object({ applicationId: idSchema, overrideReason: z.string().trim().max(2000).optional() }).safeParse({ applicationId: form.get("applicationId"), overrideReason: form.get("overrideReason") });
  if (!input.success) return;
  const application = await db.application.findUnique({ where: { id: input.data.applicationId }, include: { student: { include: { placements: { where: { status: "ACTIVE" }, select: { id: true } } } }, opportunity: { include: { company: true, placements: { where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true } }, applications: { select: { id: true, status: true } } } } } });
  if (!application || actor.role === "CO_COORDINATOR" && !(await canAccessStudent(actor as CurrentUser, application.studentId))) return;
  const activeCount = application.opportunity.placements.length;
  const freeSlots = Math.max(0, application.opportunity.slots - activeCount);
  const approvedMoa = !!(await db.document.findFirst({ where: { applicationId: application.id, kind: "MOA", legalStatus: "APPROVED" }, select: { id: true } }));
  const preconditions = { studentConfirmed: application.studentConfirmed, freeSlots, hasActivePlacement: application.student.placements.length > 0, approvedMoa, overrideReason: input.data.overrideReason };
  if (application.status !== "ACCEPTED" || !canConfirmPlacement(preconditions)) return;
  await db.$transaction(async (tx) => {
    await tx.placement.create({ data: { studentId: application.studentId, companyId: application.opportunity.companyId, opportunityId: application.opportunityId, applicationId: application.id, confirmedById: actor.id, overrideReason: approvedMoa ? null : input.data.overrideReason } });
    await tx.application.update({ where: { id: application.id }, data: { status: "PLACED" } });
  });
  await audit(actor.id, "PLACEMENT_CONFIRMED", "Application", application.id, input.data.overrideReason);
  await notify(application.student.userId, "Your OJT placement has been confirmed by the coordinator.", "/student/placement");
  revalidateWorkspaces("/coordinator/placements", "/co-coordinator/placements", "/student/placement", "/company/placements");
}
