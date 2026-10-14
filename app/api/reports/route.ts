import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

function csv(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  await requireRole("COORDINATOR");
  const [students, companies, placements] = await Promise.all([
    db.studentProfile.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { studentNumber: "asc" } }),
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.placement.findMany({ include: { student: { include: { user: { select: { name: true, email: true } } } }, company: { select: { name: true } } }, orderBy: { createdAt: "desc" } })
  ]);
  const lines = [
    ["Record type", "Name", "Email", "Status", "Company or student number"],
    ...students.map((item) => ["Student", item.user.name, item.user.email, item.approval, item.studentNumber]),
    ...companies.map((item) => ["Company", item.name, item.contactEmail || "", item.verification, item.partnerType]),
    ...placements.map((item) => ["Placement", item.student.user.name, item.student.user.email, item.status, item.company.name])
  ];
  const body = lines.map((row) => row.map(csv).join(",")).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=connected-ojt-report.csv", "Cache-Control": "no-store" } });
}
