import { db } from "@/lib/db";
export async function notify(userId: string, message: string, href?: string) {
  await db.notification.create({ data: { userId, message, href } });
}
export async function notifyRole(role: "COORDINATOR" | "CO_COORDINATOR" | "STUDENT" | "COMPANY" | "ATTORNEY", message: string, href?: string) {
  const users = await db.user.findMany({ where: { role, isActive: true }, select: { id: true } });
  if (users.length) await db.notification.createMany({ data: users.map(({ id }) => ({ userId: id, message, href })) });
}
