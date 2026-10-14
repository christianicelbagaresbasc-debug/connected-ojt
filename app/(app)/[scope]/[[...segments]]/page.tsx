import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recommend } from "@/lib/matching";
import { phDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { markNotificationsReadAction, addSkillAction, approveStudentAction, applyOpportunityAction, assignStudentAction, confirmPlacementAction, createCompanyAction, createOpportunityAction, deactivateUserAction, removeSkillAction, reviewApplicationAction, reviewDocumentAction, saveCompanyProfileAction, saveStudentProfileAction, studentApplicationAction, suggestCompanyAction, uploadDocumentAction, verifyCompanyAction } from "@/app/actions";
import { canAccessStudent } from "@/lib/auth";
import { CreateUserForm } from "@/components/CreateUserForm";
import type { Role } from "@/lib/workflow";

const scopes: Record<string, Role> = { coordinator: "COORDINATOR", "co-coordinator": "CO_COORDINATOR", student: "STUDENT", company: "COMPANY", attorney: "ATTORNEY" };
const titles: Record<string, string> = { notifications: "Notifications", students: "Students", companies: "Companies", opportunities: "Opportunities", applications: "Applications", placements: "Placements", users: "Users", skills: "Skills", reports: "Reports", audit: "Audit log", profile: "My profile", "suggest-company": "Suggest a company", applicants: "Applicants", history: "Review history", documents: "Document review" };
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
  if (section === "applications" && segments[1]) return <ApplicationDetail role={role} userId={user.id} applicationId={segments[1]} />;
  if (section === "opportunities" && segments[1] === "new" && role === "COMPANY") return <CreateOpportunityPage />;
  if (section === "opportunities" && segments[1]) return <OpportunityDetail role={role} userId={user.id} opportunityId={segments[1]} />;
  if (section === "students" && segments[1] && role === "COORDINATOR") return <StudentAdminDetail studentId={segments[1]} />;
  if (section === "companies" && segments[1] === "new" && role === "COORDINATOR") return <CreateCompanyPage />;
  if (section === "companies" && segments[1] && role === "COORDINATOR") return <CompanyAdminDetail companyId={segments[1]} />;
  if (section === "documents" && segments[1] && role === "ATTORNEY") return <AttorneyDocumentDetail documentId={segments[1]} />;
  if (section === "suggest-company" && role === "STUDENT") return <SuggestCompanyPage />;
  if (section === "profile" && role === "COMPANY") return <CompanyProfilePage userId={user.id} />;
  if (section === "profile" && role === "STUDENT") return <StudentProfilePage userId={user.id} />;

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

async function StudentAdminDetail({ studentId }: { studentId: string }) {
  await requireRole("COORDINATOR");
  const student = await db.studentProfile.findUnique({ where: { id: studentId }, include: { user: true, skills: { include: { skill: true } }, applications: { include: { opportunity: { include: { company: true } } }, orderBy: { createdAt: "desc" } }, assignedTo: true, placements: { include: { company: true } } } });
  if (!student) notFound();
  const coCoordinators = await db.user.findMany({ where: { role: "CO_COORDINATOR", isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return <><p><Link href="/coordinator/students">← Students</Link></p><h1>{student.user.name}</h1><div className="panel"><p><strong>Email:</strong> {student.user.email}</p><p><strong>Student number:</strong> {student.studentNumber}</p><p><strong>Course:</strong> {student.course} · <strong>Year:</strong> {student.yearLevel || "—"} · <strong>Section:</strong> {student.section || "—"}</p><p><strong>Headline:</strong> {student.headline || "—"}</p><p><strong>About:</strong> {student.about || "—"}</p><p><strong>Skills:</strong> {student.skills.map((s) => s.skill.name).join(", ") || "—"}</p><p><strong>Profile approval:</strong> <StatusBadge value={student.approval} /></p></div><div className="panel"><h2>Approval decision</h2><form action={approveStudentAction} className="stack"><input type="hidden" name="studentId" value={student.id} /><label>Decision<select name="status"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label><label>Note<textarea name="note" rows={2} maxLength={2000} /></label><button>Save approval</button></form></div><div className="panel"><h2>Co-Coordinator assignment</h2><form action={assignStudentAction} className="stack"><input type="hidden" name="studentId" value={student.id} /><label>Assigned Co-Coordinator<select name="assignedToId" defaultValue={student.assignedToId || ""}><option value="">Unassigned</option>{coCoordinators.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button>Save assignment</button></form></div><section className="panel"><h2>Applications</h2>{student.applications.length ? student.applications.map((app) => <p key={app.id}><Link href={`/coordinator/applications/${app.id}`}>{app.opportunity.title}</Link> · {app.opportunity.company.name} · <StatusBadge value={app.status} /></p>) : <p className="empty">No applications.</p>}</section><section className="panel"><h2>Placements</h2>{student.placements.length ? student.placements.map((placement) => <p key={placement.id}>{placement.company.name} · <StatusBadge value={placement.status} /></p>) : <p className="empty">No placement records.</p>}</section></>;
}

async function CompanyAdminDetail({ companyId }: { companyId: string }) {
  await requireRole("COORDINATOR");
  const company = await db.company.findUnique({ where: { id: companyId }, include: { reps: true, documents: { select: { id: true, fileName: true, kind: true, legalStatus: true } }, opportunities: { orderBy: { createdAt: "desc" } } } });
  if (!company) notFound();
  return <><p><Link href="/coordinator/companies">← Companies</Link></p><h1>{company.name}</h1><div className="panel"><p><strong>Industry:</strong> {company.industry || "—"}</p><p><strong>Address:</strong> {company.address || "—"}</p><p><strong>Website:</strong> {company.website || "—"}</p><p><strong>Contact:</strong> {company.contactPerson || "—"} · {company.contactEmail || "—"}</p><p><strong>Partner type:</strong> {company.partnerType.replaceAll("_", " ")}</p><p><strong>Verification:</strong> <StatusBadge value={company.verification} /></p><p><strong>Notes:</strong> {company.verificationNotes || "—"}</p></div><div className="panel"><h2>Verification decision</h2><form action={verifyCompanyAction} className="stack"><input type="hidden" name="companyId" value={company.id} /><label>Verification<select name="verification" defaultValue={company.verification}>{["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED"].map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}</select></label><label>Partner type<select name="partnerType" defaultValue={company.partnerType}><option value="EXISTING_PARTNER">Existing Partner</option><option value="NEW_COMPANY">New Company</option></select></label><label>Notes or decision reason<textarea name="note" rows={3} maxLength={2000} defaultValue={company.verificationNotes || ""} /></label><button>Save verification</button></form></div><section className="panel"><h2>Company representatives</h2>{company.reps.length ? company.reps.map((rep) => <p key={rep.id}>{rep.name} · {rep.email} · {rep.isActive ? "Active" : "Inactive"}</p>) : <p className="empty">No company logins are linked yet.</p>}</section><section className="panel"><h2>Company documents</h2>{company.documents.length ? company.documents.map((doc) => <p key={doc.id}><Link href={`/api/documents/${doc.id}`}>{doc.fileName}</Link> · {doc.kind.replaceAll("_", " ")} · <StatusBadge value={doc.legalStatus} /></p>) : <p className="empty">No documents.</p>}</section><section className="panel"><h2>Opportunities</h2>{company.opportunities.length ? company.opportunities.map((o) => <p key={o.id}><Link href={`/coordinator/opportunities/${o.id}`}>{o.title}</Link> · <StatusBadge value={o.status} /></p>) : <p className="empty">No opportunities.</p>}</section></>;
}

async function ApplicationDetail({ role, userId, applicationId }: { role: Role; userId: string; applicationId: string }) {
  const application = await db.application.findUnique({ where: { id: applicationId }, include: { student: { include: { user: true } }, opportunity: { include: { company: { include: { reps: { select: { id: true } } } } } }, documents: { select: { id: true, fileName: true, kind: true, legalStatus: true } } } });
  if (!application) notFound();
  const ownStudent = role === "STUDENT" && application.student.userId === userId;
  const ownCompany = role === "COMPANY" && application.opportunity.company.reps.some((rep) => rep.id === userId);
  const staff = (role === "COORDINATOR" || role === "CO_COORDINATOR") && (role === "COORDINATOR" || await canAccessStudent({ id: userId, role, email: "", name: "", companyId: null, isActive: true, mustChangePassword: false }, application.studentId));
  if (!ownStudent && !ownCompany && !staff) notFound();
  const pathPrefix = role === "CO_COORDINATOR" ? "co-coordinator" : role.toLowerCase();
  return <><p><Link href={`/${pathPrefix}/applications`}>← Applications</Link></p><h1>{application.opportunity.title}</h1><div className="panel"><p><strong>Student:</strong> {application.student.user.name}</p><p><strong>Company:</strong> {application.opportunity.company.name}</p><p><strong>Status:</strong> <StatusBadge value={application.status} /></p><p><strong>Applied:</strong> {phDate(application.createdAt)}</p><p><strong>Cover note:</strong> {application.coverNote || "—"}</p><p><strong>Company note:</strong> {application.companyNote || "—"}</p><p><strong>Coordinator note:</strong> {application.coordinatorNote || "—"}</p><p><strong>Student confirmed:</strong> {application.studentConfirmed ? "Yes" : "No"}</p></div>
    {ownStudent && <div className="panel"><h2>Your response</h2>{application.status === "ACCEPTED" && <form action={studentApplicationAction}><input type="hidden" name="applicationId" value={application.id} /><button name="intent" value="CONFIRM">Confirm this offer</button> <button className="secondary" name="intent" value="DECLINE">Decline this offer</button></form>}{["PENDING", "UNDER_REVIEW"].includes(application.status) && <form action={studentApplicationAction}><input type="hidden" name="applicationId" value={application.id} /><button className="secondary" name="intent" value="WITHDRAW">Withdraw application</button></form>}</div>}
    {(ownCompany || staff) && <div className="panel"><h2>Record a decision</h2><form action={reviewApplicationAction} className="stack"><input type="hidden" name="applicationId" value={application.id} /><label>Status<select name="status">{(ownCompany ? ["UNDER_REVIEW", "ACCEPTED", "DECLINED"] : ["UNDER_REVIEW", "ACCEPTED", "DECLINED", "REJECTED"]).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><label>Note or reason<textarea name="note" rows={3} maxLength={2000} /></label><button>Save decision</button></form></div>}
    {staff && application.status === "ACCEPTED" && application.studentConfirmed && <div className="panel"><h2>Confirm placement</h2><p>Legal approval for an MOA is required unless you record an override reason.</p><form action={confirmPlacementAction} className="stack"><input type="hidden" name="applicationId" value={application.id} /><label>Override reason (required if no approved MOA)<textarea name="overrideReason" rows={3} maxLength={2000} /></label><button>Confirm placement</button></form></div>}
    <section className="panel"><h2>Application documents</h2>{application.documents.length ? application.documents.map((doc) => <p key={doc.id}><Link href={`/api/documents/${doc.id}`}>{doc.fileName}</Link> · {doc.kind.replaceAll("_", " ")} · <StatusBadge value={doc.legalStatus} /></p>) : <p className="empty">No documents have been uploaded for this application.</p>}{(ownStudent || ownCompany) && <form action={uploadDocumentAction} className="stack"><input type="hidden" name="applicationId" value={application.id} /><label>Document type<select name="kind">{(ownCompany ? ["MOA", "INTERNSHIP_CONTRACT", "OTHER"] : ["RESUME", "CERTIFICATION", "WEEKLY_REPORT", "OTHER"]).map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</select></label><label>Choose a PDF, PNG, JPEG, or DOCX file<input required type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx" /></label><label>Note<textarea name="note" rows={2} maxLength={2000} /></label><button>Upload document</button></form>}</section>
  </>;
}

async function AttorneyDocumentDetail({ documentId }: { documentId: string }) {
  await requireRole("ATTORNEY");
  const document = await db.document.findUnique({ where: { id: documentId }, select: { id: true, kind: true, fileName: true, legalStatus: true, note: true, createdAt: true, student: { select: { user: { select: { name: true } } } }, company: { select: { name: true } }, reviews: { include: { reviewer: { select: { name: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!document) notFound();
  return <><p><Link href="/attorney">← Review queue</Link></p><h1>{document.kind.replaceAll("_", " ")}</h1><div className="panel"><p><strong>File:</strong> <Link href={`/api/documents/${document.id}`}>{document.fileName}</Link></p><p><strong>Student:</strong> {document.student?.user.name || "—"}</p><p><strong>Company:</strong> {document.company?.name || "—"}</p><p><strong>Uploaded:</strong> {phDate(document.createdAt)}</p><p><strong>Note:</strong> {document.note || "—"}</p><p><strong>Status:</strong> <StatusBadge value={document.legalStatus} /></p></div><div className="panel"><h2>Legal decision</h2><form action={reviewDocumentAction} className="stack"><input type="hidden" name="documentId" value={document.id} /><label>Decision<select name="action"><option value="APPROVED">Approve</option><option value="CHANGES_REQUESTED">Request changes</option><option value="REJECTED">Reject</option></select></label><label>Comment<textarea name="comment" rows={4} maxLength={2000} /></label><button>Save review</button></form></div><section className="panel"><h2>Review history</h2>{document.reviews.length ? document.reviews.map((review) => <p key={review.id}>{review.reviewer.name} · {review.action.replaceAll("_", " ")} · {review.comment || "No comment"} · {phDate(review.createdAt)}</p>) : <p className="empty">No prior reviews.</p>}</section></>;
}

async function OpportunityDetail({ role, userId, opportunityId }: { role: Role; userId: string; opportunityId: string }) {
  const opportunity = await db.opportunity.findUnique({ where: { id: opportunityId }, include: { company: true, skills: { include: { skill: true } }, placements: { where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { id: true } } } });
  if (!opportunity) notFound();
  const allowed = role === "COORDINATOR" || role === "STUDENT" && opportunity.company.verification === "VERIFIED" || role === "COMPANY" && !!(await db.user.findFirst({ where: { id: userId, companyId: opportunity.companyId }, select: { id: true } }));
  if (!allowed) notFound();
  const student = role === "STUDENT" ? await db.studentProfile.findUnique({ where: { userId }, select: { id: true, approval: true, placements: { where: { status: "ACTIVE" }, select: { id: true } } } }) : null;
  const existing = student ? await db.application.findUnique({ where: { studentId_opportunityId: { studentId: student.id, opportunityId } }, select: { id: true } }) : null;
  return <><p><Link href={`/${role.toLowerCase()}/opportunities`}>← Opportunities</Link></p><h1>{opportunity.title}</h1><div className="panel"><p><strong>Company:</strong> {opportunity.company.name} · {opportunity.company.partnerType.replaceAll("_", " ")}</p><p><strong>Status:</strong> <StatusBadge value={opportunity.status} /></p><p><strong>Location:</strong> {opportunity.location || "Not specified"} · {opportunity.workArrangement.replaceAll("_", " ")}</p><p><strong>Deadline:</strong> {phDate(opportunity.deadline)}</p><p><strong>Available slots:</strong> {Math.max(0, opportunity.slots - opportunity.placements.length)}</p><p><strong>Required skills:</strong> {opportunity.skills.map((s) => s.skill.name).join(", ") || "Not specified"}</p><p>{opportunity.description}</p>{opportunity.tasks && <p><strong>Tasks:</strong> {opportunity.tasks}</p>}{opportunity.qualifications && <p><strong>Qualifications:</strong> {opportunity.qualifications}</p>}</div>
    {role === "STUDENT" && <div className="panel"><h2>Apply</h2>{student?.approval !== "APPROVED" ? <p>Your account must be approved before you can apply.</p> : student.placements.length ? <p>You already have an active placement.</p> : existing ? <p>You have already applied to this opportunity.</p> : opportunity.status !== "OPEN" || opportunity.company.verification !== "VERIFIED" ? <p>This opportunity is not accepting applications.</p> : <form action={applyOpportunityAction} className="stack"><input type="hidden" name="opportunityId" value={opportunity.id} /><label>Cover note<textarea name="coverNote" rows={4} maxLength={2000} placeholder="Briefly introduce yourself and your interest." /></label><button>Submit application</button></form>}</div>}
  </>;
}

async function StudentProfilePage({ userId }: { userId: string }) {
  const student = await db.studentProfile.findUnique({ where: { userId }, include: { skills: { include: { skill: true } } } });
  if (!student) notFound();
  return <><h1>My profile</h1><p className="subtle">Student number: {student.studentNumber} · Approval: <StatusBadge value={student.approval} /></p><form action={saveStudentProfileAction} className="panel stack"><label>Headline<input name="headline" maxLength={160} defaultValue={student.headline || ""} /></label><label>About<textarea name="about" rows={5} maxLength={2000} defaultValue={student.about || ""} /></label><label>Phone<input name="phone" maxLength={40} defaultValue={student.phone || ""} /></label><label>Location<input name="location" maxLength={160} defaultValue={student.location || ""} /></label><label>Portfolio URL<input type="url" name="portfolioUrl" maxLength={500} defaultValue={student.portfolioUrl || ""} /></label><button>Save profile</button></form></>;
}

async function CreateOpportunityPage() {
  await requireRole("COMPANY");
  return <><p><Link href="/company/opportunities">← Opportunities</Link></p><h1>Post an opportunity</h1><p className="subtle">Only university-verified companies can publish opportunities. Provide clear duties and qualifications.</p><form action={createOpportunityAction} className="panel stack"><label>Title<input required name="title" maxLength={160} /></label><label>Description<textarea required name="description" rows={5} maxLength={5000} /></label><label>Tasks<textarea name="tasks" rows={3} maxLength={3000} /></label><label>Qualifications<textarea name="qualifications" rows={3} maxLength={3000} /></label><label>Number of slots<input required type="number" name="slots" min={1} max={100} defaultValue={1} /></label><label>Location<input name="location" maxLength={200} /></label><label>Work arrangement<select name="workArrangement"><option value="ON_SITE">On site</option><option value="HYBRID">Hybrid</option><option value="REMOTE">Remote</option></select></label><label>Application deadline<input type="date" name="deadline" /></label><button>Publish opportunity</button></form></>;
}

async function CreateCompanyPage() {
  await requireRole("COORDINATOR");
  return <><p><Link href="/coordinator/companies">← Companies</Link></p><h1>Create a company record</h1><p className="subtle">New records begin pending and cannot publish opportunities until verified.</p><form action={createCompanyAction} className="panel stack"><label>Company name<input required name="name" maxLength={200} /></label><label>Industry<input name="industry" maxLength={160} /></label><label>Address<input name="address" maxLength={300} /></label><label>Contact person<input name="contactPerson" maxLength={160} /></label><label>Contact email<input type="email" name="contactEmail" maxLength={254} /></label><label>Contact phone<input name="contactPhone" maxLength={50} /></label><label>Description<textarea name="description" rows={4} maxLength={3000} /></label><button>Create record</button></form></>;
}

async function SuggestCompanyPage() {
  await requireRole("STUDENT");
  return <><h1>Suggest a company</h1><p className="subtle">The university will review the company before students can apply to its opportunities.</p><form action={suggestCompanyAction} className="panel stack"><label>Company name<input required name="name" maxLength={200} /></label><label>Industry<input name="industry" maxLength={160} /></label><label>Address<input name="address" maxLength={300} /></label><label>Contact email<input type="email" name="contactEmail" maxLength={254} /></label><label>What do you know about this company?<textarea name="description" rows={4} maxLength={3000} /></label><button>Send suggestion</button></form></>;
}

async function CompanyProfilePage({ userId }: { userId: string }) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { company: true } });
  if (!user?.company) return <><h1>Company profile</h1><p className="empty">No company record is linked to this account.</p></>;
  const company = user.company;
  return <><h1>Company profile</h1><div className="panel"><p><strong>Company:</strong> {company.name}</p><p><strong>Partner type:</strong> {company.partnerType.replaceAll("_", " ")}</p><p><strong>Verification:</strong> <StatusBadge value={company.verification} /></p><p><strong>University notes:</strong> {company.verificationNotes || "—"}</p></div><form action={saveCompanyProfileAction} className="panel stack"><h2>Contact details</h2><label>Contact person<input name="contactPerson" maxLength={160} defaultValue={company.contactPerson || ""} /></label><label>Contact email<input type="email" name="contactEmail" maxLength={254} defaultValue={company.contactEmail || ""} /></label><label>Contact phone<input name="contactPhone" maxLength={50} defaultValue={company.contactPhone || ""} /></label><label>Website<input type="url" name="website" maxLength={500} defaultValue={company.website || ""} /></label><label>Description<textarea name="description" rows={4} maxLength={3000} defaultValue={company.description || ""} /></label><button>Save profile</button></form></>;
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
    return <><h1>{heading}</h1><p className="subtle">Verified companies are visible to students.</p>{role === "COORDINATOR" && <p><Link className="button-link" href="/coordinator/companies/new">Create company record</Link></p>}<Table headers={["Company", "Industry", "Partner type", "Verification"]} rows={rows.map((c) => [role === "COORDINATOR" ? <Link href={`/coordinator/companies/${c.id}`}>{c.name}</Link> : c.name, c.industry ?? "—", c.partnerType.replaceAll("_", " "), <StatusBadge value={c.verification} />])} empty="No companies to show yet." /></>;
  }
  if (section === "opportunities" && ["STUDENT", "COMPANY", "COORDINATOR"].includes(role)) {
    const where = role === "STUDENT" ? { status: "OPEN" as const, company: { verification: "VERIFIED" as const } } : role === "COMPANY" ? { companyId: (await db.user.findUnique({ where: { id: userId }, select: { companyId: true } }))?.companyId ?? "" } : {};
    const rows = await db.opportunity.findMany({ where, include: { company: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Browse current training opportunities.</p>{role === "COMPANY" && <p><Link className="button-link" href="/company/opportunities/new">Post an opportunity</Link></p>}<Table headers={["Opportunity", "Company", "Work arrangement", "Status", "Deadline"]} rows={rows.map((o) => [<Link href={`/${role === "COORDINATOR" ? "coordinator" : role.toLowerCase()}/opportunities/${o.id}`}>{o.title}</Link>, o.company.name, o.workArrangement.replaceAll("_", " "), <StatusBadge value={o.status} />, phDate(o.deadline)])} empty="No opportunities are available yet." /></>;
  }
  if (section === "applications") {
    const where = role === "STUDENT" ? { student: { userId } } : role === "COMPANY" ? { opportunity: { company: { reps: { some: { id: userId } } } } } : role === "CO_COORDINATOR" ? { student: { assignedToId: userId } } : {};
    const rows = await db.application.findMany({ where, include: { student: { include: { user: true } }, opportunity: { include: { company: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return <><h1>{heading}</h1><p className="subtle">Applications are listed by date. No applicant skill ranking is used.</p><Table headers={["Student", "Opportunity", "Company", "Status", "Applied"]} rows={rows.map((a) => [<Link href={`/${role === "CO_COORDINATOR" ? "co-coordinator" : role.toLowerCase()}/applications/${a.id}`}>{a.student.user.name}</Link>, a.opportunity.title, a.opportunity.company.name, <StatusBadge value={a.status} />, phDate(a.createdAt)])} empty="No applications yet." /></>;
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
  if (section === "users" && role === "COORDINATOR") {
    const [users, companies] = await Promise.all([db.user.findMany({ where: { role: { not: "COORDINATOR" } }, include: { company: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }), db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
    return <><h1>{heading}</h1><section className="panel"><h2>Create a staff or company login</h2><p>A temporary password will be shown once after creation. The new user must change it at first login.</p><CreateUserForm companies={companies} /></section><section className="panel"><h2>Accounts</h2><Table headers={["Name", "Email", "Role", "Company", "Status", "Action"]} rows={users.map((account) => [account.name, account.email, account.role.replaceAll("_", " "), account.company?.name || "—", account.isActive ? "Active" : "Inactive", account.isActive ? <form action={deactivateUserAction}><input type="hidden" name="userId" value={account.id} /><label className="check"><input required type="checkbox" name="confirm" value="yes" /> Confirm deactivate</label><button className="secondary">Deactivate</button></form> : "—"])} empty="No staff or company accounts yet." /></section></>;
  }
  if (section === "skills" && role === "COORDINATOR") {
    const skills = await db.skill.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
    return <><h1>{heading}</h1><form action={addSkillAction} className="panel stack"><h2>Add a skill</h2><label>Skill name<input required name="name" maxLength={100} /></label><label>Category<input name="category" maxLength={100} /></label><button>Add skill</button></form><section className="panel"><h2>Catalog ({skills.length})</h2>{skills.map((skill) => <form key={skill.id} action={removeSkillAction} className="inline-form"><input type="hidden" name="skillId" value={skill.id} /><span>{skill.name} · {skill.category || "Uncategorized"}</span><label className="check"><input required type="checkbox" name="confirm" value="yes" /> Confirm remove</label><button className="secondary">Remove</button></form>)}</section></>;
  }
  if (section === "audit" && role === "COORDINATOR") {
    const entries = await db.auditLog.findMany({ include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return <><h1>{heading}</h1><Table headers={["When", "Actor", "Action", "Record", "Detail"]} rows={entries.map((entry) => [phDate(entry.createdAt), entry.actor?.name || "System", entry.action, `${entry.entity}${entry.entityId ? ` · ${entry.entityId}` : ""}`, entry.detail || "—"])} empty="No audit entries yet." /></>;
  }
  if (section === "reports" && role === "COORDINATOR") {
    const [students, pendingStudents, companies, verifiedCompanies, opportunities, applications, placements] = await Promise.all([db.studentProfile.count(), db.studentProfile.count({ where: { approval: "PENDING" } }), db.company.count(), db.company.count({ where: { verification: "VERIFIED" } }), db.opportunity.count(), db.application.count(), db.placement.count({ where: { status: "ACTIVE" } })]);
    return <><h1>{heading}</h1><div className="grid"><Metric label="Students" value={students} /><Metric label="Pending student approvals" value={pendingStudents} /><Metric label="Companies" value={companies} /><Metric label="Verified companies" value={verifiedCompanies} /><Metric label="Opportunities" value={opportunities} /><Metric label="Applications" value={applications} /><Metric label="Active placements" value={placements} /></div><p><Link className="button-link" href="/api/reports" prefetch={false}>Download CSV report</Link></p></>;
  }
  return <><h1>{heading}</h1><p className="empty">This section is ready for your records. No records are available yet.</p></>;
}
