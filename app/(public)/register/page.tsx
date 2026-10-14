import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { registerAction } from "@/app/actions";
export default function RegisterPage() { return <main className="public"><h1>Student registration</h1><p className="subtle">Your account starts pending. A coordinator must approve it before you can apply.</p><AuthForm action={registerAction} mode="register"/><p><Link href="/login">Back to log in</Link></p></main>; }
