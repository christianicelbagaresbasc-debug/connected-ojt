"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/workflow";
import { nav } from "@/lib/nav";
import { logoutAction } from "@/app/actions";
export function AppShell({ user, unread, children }: { user: { name: string; role: Role }; unread: number; children: React.ReactNode }) {
  const path = usePathname();
  const prefix = user.role === "CO_COORDINATOR" ? "co-coordinator" : user.role.toLowerCase();
  return <div className="app-shell"><header className="topbar"><Link className="brand" href={`/${prefix}`}>ConnectEd</Link><div className="top-user"><span>{user.name} · {user.role.replaceAll("_", " ")}</span><Link href={`/${prefix}/notifications`}>Notifications {unread > 0 && <span className="badge pending">{unread}</span>}</Link><form action={logoutAction}><button type="submit">Log out</button></form></div></header><div className="layout"><nav className="sidebar" aria-label="Main navigation">{nav[user.role].map((item) => <Link className={path === item.href || (item.href !== `/${prefix}` && path.startsWith(`${item.href}/`)) ? "active" : ""} key={item.href} href={item.href}>{item.label}</Link>)}</nav><main className="content">{children}</main></div><footer>BSAU Institute of Computer Studies, Pinaod, San Ildefonso, Bulacan</footer></div>;
}
