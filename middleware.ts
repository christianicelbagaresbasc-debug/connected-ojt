import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get("connected_session")?.value;
  const secret = process.env.SESSION_SECRET;
  let signedIn = false;
  if (token && secret) {
    try { await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] }); signedIn = true; } catch { /* invalid cookies are handled as signed out */ }
  }
  const isPublic = ["/", "/login", "/register"].includes(path) || path.startsWith("/api/");
  if (!isPublic && !signedIn) return NextResponse.redirect(new URL("/login", request.url));
  const headers = new Headers(request.headers);
  headers.set("x-pathname", path);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
