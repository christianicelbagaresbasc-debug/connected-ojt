import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { changePasswordAction } from "@/app/actions";
import { readSession } from "@/lib/session";
export default async function ChangePasswordPage() { if (!(await readSession())) redirect("/login"); return <main className="public"><h1>Change your temporary password</h1><p>Choose a new password with at least eight characters, including a letter and a number.</p><AuthForm action={changePasswordAction} mode="password"/></main>; }
