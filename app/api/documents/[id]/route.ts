import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";
import { canViewDocument } from "@/lib/auth";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await readSession();
  if (!id) return new NextResponse("Unauthorized", { status: 401 });
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, companyId: true, isActive: true, mustChangePassword: true } });
  if (!user?.isActive) return new NextResponse("Unauthorized", { status: 401 });
  const { id: documentId } = await params;
  const doc = await db.document.findUnique({ where: { id: documentId }, include: { application: { include: { opportunity: { select: { companyId: true } } } } } });
  if (!doc || !(await canViewDocument(user, doc))) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(doc.data), { headers: { "Content-Type": doc.mimeType, "Content-Disposition": `attachment; filename="${doc.fileName.replace(/[\r\n"\\]/g, "_")}"`, "X-Content-Type-Options": "nosniff" } });
}
