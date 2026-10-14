import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { loginAction } from "@/app/actions";
export default function LoginPage() { return <main className="public"><h1>Log in to ConnectEd</h1><AuthForm action={loginAction} mode="login"/><p><Link href="/">Back to home</Link> · <Link href="/register">Register as a student</Link></p></main>; }
