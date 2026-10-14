import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";
import { canViewDocument as documentRule, type DocAccess, type Role } from "@/lib/workflow";
import type { Document, User } from "@prisma/client";

export type CurrentUser = Pick<User, "id" | "email" | "name" | "role" | "companyId" | "isActive" | "mustChangePassword">;
export async function requireUser(): Promise<CurrentUser> {
  const id = await readSession();
  if (!id) redirect("/login");
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, companyId: true, isActive: true, mustChangePassword: true } });
  if (!user?.isActive) redirect("/login");
  const { headers } = await import("next/headers");
  if (user.mustChangePassword && (await headers()).get("x-pathname") !== "/change-password") redirect("/change-password");
  return user;
}
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role as Role)) redirect(dashboardFor(user.role as Role));
  return user;
}
export function dashboardFor(role: Role): string {
  return ({ COORDINATOR: "/coordinator", CO_COORDINATOR: "/co-coordinator", STUDENT: "/student", COMPANY: "/company", ATTORNEY: "/attorney" })[role];
}
export async function canAccessStudent(user: CurrentUser, studentId: string): Promise<boolean> {
  if (user.role === "COORDINATOR") return true;
  if (user.role === "CO_COORDINATOR") return !!(await db.studentProfile.findFirst({ where: { id: studentId, assignedToId: user.id }, select: { id: true } }));
  return user.role === "STUDENT" && !!(await db.studentProfile.findFirst({ where: { id: studentId, userId: user.id }, select: { id: true } }));
}
export async function canViewDocument(user: CurrentUser, doc: Document & { application?: { opportunity: { companyId: string } } | null }): Promise<boolean> {
  const student = doc.studentId ? await db.studentProfile.findUnique({ where: { id: doc.studentId }, select: { userId: true, assignedToId: true } }) : null;
  const applicationCompanyId = doc.application?.opportunity.companyId;
  const studentApplied = !!(applicationCompanyId && student && await db.application.findFirst({ where: { studentId: doc.studentId!, opportunity: { companyId: applicationCompanyId } }, select: { id: true } }));
  const shape: DocAccess = { kind: doc.kind, legalStatus: doc.legalStatus, uploadedById: doc.uploadedById, studentId: doc.studentId, companyId: doc.companyId, applicationCompanyId, studentOwnerId: student?.userId, assignedStudent: student?.assignedToId === user.id, ownCompany: !!user.companyId && (doc.companyId === user.companyId || applicationCompanyId === user.companyId), studentApplied };
  return documentRule(user.role as Role, user.id, shape);
}
