"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";

type Action = (state: FormState, form: FormData) => Promise<FormState>;
export function AuthForm({ action, mode }: { action: Action; mode: "login" | "register" | "password" }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const register = mode === "register";
  return <form action={formAction} className="form-card">
    {register && <label>Full name<input name="name" autoComplete="name" required maxLength={100} /></label>}
    {mode !== "password" && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
    {register && <label>Student number<input name="studentNumber" required maxLength={40} /></label>}
    <label>{mode === "password" ? "New password" : "Password"}<input name={mode === "password" ? "password" : "password"} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={register || mode === "password" ? 8 : 1} /></label>
    {state.error && <p className="error" role="alert">{state.error}</p>}{state.success && <p className="success" role="status">{state.success}</p>}
    <button disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Log in" : mode === "register" ? "Create student account" : "Change password"}</button>
  </form>;
}
