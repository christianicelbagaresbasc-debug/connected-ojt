import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recommend } from "@/lib/matching";
import { phDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { markNotificationsReadAction } from "@/app/actions";
import type { Role } from "@/lib/workflow";

const scopes: Record<string, Role> = { coordinator: "COORDINATOR", "co-coordinator": "CO_COORDINATOR", student: "STUDENT", company: "COMPANY", attorney: "ATTORNEY" };
const titles: Record<string, string> = { notifications: "Notifications", students: "Students", companies: "Companies", opportunities: "Opportunities", applications: "Applications", placements: "Placements", users: "Users", skills: "Skills", reports: "Reports", audit: "Audit log", profile: "My profile", "suggest-company": "Suggest a company", applicants: "Applicants", history: "Review history" };
function Table({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return <div className="panel" style={{ overflowX: "auto" }}><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
export default async function WorkspacePage({ params }: { params: Promise<{ scope: string; segments?: string[] }> }) {
  const { scope, segments = [] } = await params;
  const role = scopes[scope];
  if (!role) notFound();
  const user = await requireRole(role);
  const section = segments[0];
  const heading = section ? titles[section] : "Dashboard";
  if (section && !titles[section] && section !== "notifications") notFound();

  if (role === "COMPANY" && section !== "notifications" && user.companyId) {
    const company = await db.company.findUnique({ where: { id: user.companyId }, select: { name: true, verification: true } });
    if (!company || company.verification !== "VERIFIED") return <><h1>Verification pending</h1><p className="panel">Your company account is waiting for university verification. Opportunity and applicant tools will appear after approval.</p></>;
  }

  if (section === "notifications") {
    const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">In-app updates for your ConnectEd account.</p><form action={markNotificationsReadAction}><button>Mark all as read</button></form><div className="panel">{items.length ? items.map((n) => <p key={n.id}><StatusBadge value={n.read ? "READ" : "UNREAD"} /> {n.href ? <Link href={n.href}>{n.message}</Link> : n.message} <span className="subtle">· {phDate(n.createdAt)}</span></p>) : <p className="empty">You have no notifications yet.</p>}</div></>;
  }

  if (section) return <GenericList role={role} userId={user.id} section={section} heading={heading} />;
  if (role === "STUDENT") return <StudentDashboard userId={user.id} />;
  if (role === "COORDINATOR" || role === "CO_COORDINATOR") return <StaffDashboard role={role} userId={user.id} />;
  if (role === "COMPANY") return <CompanyDashboard companyId={user.companyId} />;
  return <AttorneyDashboard />;
}

async function StudentDashboard({ userId }: { userId: string }) {
  const student = await db.studentProfile.findUnique({ where: { userId }, include: { skills: { include: { skill: true } }, applications: true, placements: { where: { status: "ACTIVE" }, include: { company: true } } } });
  if (!student) return <><h1>Student dashboard</h1><p className="empty">Your student profile is not set up yet.</p></>;
  const ops = await db.opportunity.findMany({ where: { status: "OPEN", company: { verification: "VERIFIED" }, OR: [{ deadline: null }, { deadline: { gt: new Date() } }] }, include: { company: true, skills: { include: { skill: true } }, placements: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } }, take: 40 });
  const recommended = ops.filter((o) => o.slots - o.placements.length > 0).map((o) => ({ o, match: recommend({ required: o.skills.map((s) => ({ id: s.skill.id, name: s.skill.name })), studentSkillIds: student.skills.map((s) => s.skillId) }) })).sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1)).slice(0, 5);
  const completeness = [student.headline, student.about, student.phone, student.location, student.portfolioUrl, student.skills.length ? "skills" : null].filter(Boolean).length / 6 * 100;
  return <><h1>Student dashboard</h1><p className="subtle">Your OJT progress and recommended opportunities.</p><div className="grid"><Metric label="Account approval" value={<StatusBadge value={student.approval} />} /><Metric label="Profile completeness" value={`${Math.round(completeness)}%`} /><Metric label="Applications" value={String(student.applications.length)} /><Metric label="Current placement" value={student.placements[0]?.company.name ?? "None yet"} /></div><section className="panel"><h2>Recommended opportunities</h2>{recommended.length ? <Table headers={["Opportunity", "Company", "Match", "Skills"]} rows={recommended.map(({ o, match }) => [<Link href={`/student/opportunities/${o.id}`}>{o.title}</Link>, o.company.name, match.label, `${match.matched.join(", ") || "—"}${match.missing.length ? ` · Missing: ${match.missing.join(", ")}` : ""}`])} empty="No opportunities are available right now." /> : <p className="empty">No opportunities are available right now.</p>}</section></>;
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div className="panel"><div className="subtle">{label}</div><div className="metric">{value}</div></div>; }

async function StaffDashboard({ role, userId }: { role: Role; userId: string }) {
  const studentScope = role === "CO_COORDINATOR" ? { assignedToId: userId } : {};
  const studentsWithoutPlacement = await db.studentProfile.findMany({ where: { ...studentScope, approval: "APPROVED", placements: { none: { status: { in: ["ACTIVE", "COMPLETED"] } } } }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 20 });
  const [pendingStudents, companies, moas, applications, activePlacements] = await Promise.all([
    role === "COORDINATOR" ? db.studentProfile.count({ where: { approval: "PENDING" } }) : Promise.resolve(0),
    role === "COORDINATOR" ? db.company.count({ where: { verification: { in: ["PENDING", "UNDER_REVIEW"] } } }) : Promise.resolve(0),
    db.document.count({ where: { legalStatus: "PENDING_REVIEW" } }),
    db.application.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW", "ACCEPTED"] }, ...(role === "CO_COORDINATOR" ? { student: studentScope } : {}) } }),
    db.placement.count({ where: { status: "ACTIVE", ...(role === "CO_COORDINATOR" ? { student: studentScope } : {}) } })
  ]);
  return <><h1>{role === "COORDINATOR" ? "Coordinator dashboard" : "Co-Coordinator dashboard"}</h1><p className="subtle">Students without a current company are shown first.</p><section className="panel"><h2>Students without a company</h2><Table headers={["Student", "Student number", "Approval"]} rows={studentsWithoutPlacement.map((s) => [<Link href={`/${role === "COORDINATOR" ? "coordinator" : "co-coordinator"}/students/${s.id}`}>{s.user.name}</Link>, s.studentNumber, <StatusBadge value={s.approval} />])} empty="Every approved student has an active or completed placement, or there are no approved students yet." /></section><div className="grid">{role === "COORDINATOR" && <Metric label="Pending student approvals" value={pendingStudents} />}<Metric label="Companies awaiting verification" value={companies} /><Metric label="MOAs awaiting legal review" value={moas} /><Metric label="Applications needing attention" value={applications} /><Metric label="Active placements" value={activePlacements} /></div></>;
}
async function CompanyDashboard({ companyId }: { companyId: string | null }) {
  if (!companyId) return <><h1>Company dashboard</h1><p className="empty">No company record is linked to this account.</p></>;
  const [opportunities, applicants, placements] = await Promise.all([db.opportunity.count({ where: { companyId } }), db.application.count({ where: { opportunity: { companyId }, status: { in: ["PENDING", "UNDER_REVIEW"] } } }), db.placement.count({ where: { companyId, status: "ACTIVE" } })]);
  return <><h1>Company dashboard</h1><p className="subtle">Manage opportunities and review applicants. Applicant lists are ordered by application date.</p><div className="grid"><Metric label="Opportunities" value={opportunities} /><Metric label="Applications needing review" value={applicants} /><Metric label="Active placements" value={placements} /></div></>;
}
async function AttorneyDashboard() {
  const queue = await db.document.findMany({ where: { legalStatus: "PENDING_REVIEW" }, select: { id: true, kind: true, fileName: true, createdAt: true, student: { select: { user: { select: { name: true } } } }, company: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 50 });
  return <><h1>Attorney review queue</h1><p className="subtle">Documents are reviewed in the order they arrive.</p><Table headers={["Document", "Kind", "Student", "Company", "Uploaded"]} rows={queue.map((d) => [<Link href={`/attorney/documents/${d.id}`}>{d.fileName}</Link>, d.kind, d.student?.user.name ?? "—", d.company?.name ?? "—", phDate(d.createdAt)])} empty="No documents are waiting for review." /></>;
}
async function GenericList({ role, userId, section, heading }: { role: Role; userId: string; section: string; heading: string }) {
  if (section === "students" && ["COORDINATOR", "CO_COORDINATOR"].includes(role)) {
    const rows = await db.studentProfile.findMany({ where: role === "CO_COORDINATOR" ? { assignedToId: userId } : {}, include: { user: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Student records and approval status.</p><Table headers={["Student", "Number", "Course", "Approval"]} rows={rows.map((s) => [<Link href={`/${role === "COORDINATOR" ? "coordinator" : "co-coordinator"}/students/${s.id}`}>{s.user.name}</Link>, s.studentNumber, s.course, <StatusBadge value={s.approval} />])} empty="No student records yet." /></>;
  }
  if (section === "companies" && role !== "ATTORNEY") {
    const rows = await db.company.findMany({ where: role === "STUDENT" ? { verification: "VERIFIED" } : {}, orderBy: { name: "asc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Verified companies are visible to students.</p><Table headers={["Company", "Industry", "Partner type", "Verification"]} rows={rows.map((c) => [c.name, c.industry ?? "—", c.partnerType.replaceAll("_", " "), <StatusBadge value={c.verification} />])} empty="No companies to show yet." /></>;
  }
  if (section === "opportunities" && ["STUDENT", "COMPANY", "COORDINATOR"].includes(role)) {
    const where = role === "STUDENT" ? { status: "OPEN" as const, company: { verification: "VERIFIED" as const } } : role === "COMPANY" ? { companyId: (await db.user.findUnique({ where: { id: userId }, select: { companyId: true } }))?.companyId ?? "" } : {};
    const rows = await db.opportunity.findMany({ where, include: { company: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Browse current training opportunities.</p><Table headers={["Opportunity", "Company", "Work arrangement", "Status", "Deadline"]} rows={rows.map((o) => [o.title, o.company.name, o.workArrangement.replaceAll("_", " "), <StatusBadge value={o.status} />, phDate(o.deadline)])} empty="No opportunities are available yet." /></>;
  }
  if (section === "applications") {
    const where = role === "STUDENT" ? { student: { userId } } : role === "COMPANY" ? { opportunity: { company: { reps: { some: { id: userId } } } } } : role === "CO_COORDINATOR" ? { student: { assignedToId: userId } } : {};
    const rows = await db.application.findMany({ where, include: { student: { include: { user: true } }, opportunity: { include: { company: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Applications are listed by date. No applicant skill ranking is used.</p><Table headers={["Student", "Opportunity", "Company", "Status", "Applied"]} rows={rows.map((a) => [a.student.user.name, a.opportunity.title, a.opportunity.company.name, <StatusBadge value={a.status} />, phDate(a.createdAt)])} empty="No applications yet." /></>;
  }
  if (section === "placements" && role !== "ATTORNEY") {
    const where = role === "STUDENT" ? { student: { userId } } : role === "CO_COORDINATOR" ? { student: { assignedToId: userId } } : role === "COMPANY" ? { company: { reps: { some: { id: userId } } } } : {};
    const rows = await db.placement.findMany({ where, include: { student: { include: { user: true } }, company: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Placement records require coordinator confirmation.</p><Table headers={["Student", "Company", "Status", "Start date"]} rows={rows.map((p) => [p.student.user.name, p.company.name, <StatusBadge value={p.status} />, phDate(p.startDate)])} empty="No placement records yet." /></>;
  }
  if (section === "history" && role === "ATTORNEY") {
    const rows = await db.documentReview.findMany({ where: { reviewerId: userId }, include: { document: { select: { fileName: true, kind: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><Table headers={["Document", "Kind", "Decision", "Comment", "Date"]} rows={rows.map((r) => [r.document.fileName, r.document.kind, <StatusBadge value={r.action} />, r.comment ?? "—", phDate(r.createdAt)])} empty="No documents have been reviewed." /></>;
  }
  return <><h1>{heading}</h1><p className="empty">This section is ready for your records. No records are available yet.</p></>;
}
