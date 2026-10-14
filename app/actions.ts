"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, clearSession, readSession } from "@/lib/session";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; success?: string };
export async function loginAction(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return { error: "Invalid email or password" };
  await createSession(user.id);
  redirect(user.mustChangePassword ? "/change-password" : ({ COORDINATOR: "/coordinator", CO_COORDINATOR: "/co-coordinator", STUDENT: "/student", COMPANY: "/company", ATTORNEY: "/attorney" }[user.role]));
}
export async function registerAction(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({ name: form.get("name"), email: form.get("email"), studentNumber: form.get("studentNumber"), password: form.get("password") });
  if (!parsed.success) return { error: "Check each field. Passwords need at least 8 characters, a letter, and a number." };
  const data = parsed.data;
  try {
    const hash = await bcrypt.hash(data.password, 12);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: data.name, email: data.email.toLowerCase(), passwordHash: hash, role: "STUDENT" } });
      await tx.studentProfile.create({ data: { userId: user.id, studentNumber: data.studentNumber } });
    });
  } catch { return { error: "That email or student number is already registered." }; }
  return { success: "Registration submitted. A coordinator must approve your account before you can apply." };
}
export async function logoutAction() { await clearSession(); redirect("/login"); }
export async function markNotificationsReadAction() {
  const id = await readSession();
  if (!id) redirect("/login");
  await db.notification.updateMany({ where: { userId: id, read: false }, data: { read: true } });
}
export async function changePasswordAction(_state: FormState, form: FormData): Promise<FormState> {
  const id = await readSession();
  if (!id) redirect("/login");
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success) return { error: "Use at least 8 characters with a letter and a number." };
  const passwordHash = await bcrypt.hash(password.data, 12);
  await db.user.update({ where: { id }, data: { passwordHash, mustChangePassword: false } });
  await audit(id, "PASSWORD_CHANGED", "User", id);
  redirect("/");
}
