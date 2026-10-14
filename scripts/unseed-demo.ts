import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const demoUserIds = (await db.user.findMany({ where: { email: { endsWith: "@connected.test" } }, select: { id: true } })).map((u) => u.id);
  await db.$transaction([
    db.notification.deleteMany({ where: { userId: { in: demoUserIds } } }),
    db.auditLog.deleteMany({ where: { actorId: { in: demoUserIds } } }),
    db.documentReview.deleteMany({ where: { reviewerId: { in: demoUserIds } } }),
    db.user.deleteMany({ where: { email: { endsWith: "@connected.test" } } }),
    db.company.deleteMany({ where: { id: { startsWith: "demo-company-" } } })
  ]);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "Unseed failed."); process.exitCode=1; }).finally(async () => db.$disconnect());
