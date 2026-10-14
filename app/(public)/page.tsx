import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { db } from "@/lib/db";
import { dashboardFor } from "@/lib/auth";
export default async function HomePage() {
  const id = await readSession();
  if (id) { const user = await db.user.findUnique({ where: { id }, select: { role: true, isActive: true } }); if (user?.isActive) redirect(dashboardFor(user.role)); }
  return <main className="public"><section className="hero"><p className="subtle">Bulacan State Agricultural University</p><h1>ConnectEd</h1><p>Connect BSIT students with verified OJT opportunities and university-approved partner companies. Coordinators keep the final say on verification and placement.</p><div className="actions"><Link href="/login"><button>Log in</button></Link><Link href="/register">Create a student account</Link></div></section><footer>BSAU Institute of Computer Studies, Pinaod, San Ildefonso, Bulacan</footer></main>;
}
