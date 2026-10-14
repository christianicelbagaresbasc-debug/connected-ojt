import { db } from "@/lib/db";
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string, detail?: string) {
  await db.auditLog.create({ data: { actorId, action, entity, entityId, detail } });
}
