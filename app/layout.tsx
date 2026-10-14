import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ConnectEd | BSAU OJT", description: "OJT placement and partner verification system for Bulacan State Agricultural University." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
