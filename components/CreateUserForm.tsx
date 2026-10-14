"use client";
import { useActionState } from "react";
import { createUserAction, type FormState } from "@/app/actions";

const initial: FormState = {};
export function CreateUserForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createUserAction, initial);
  return <form action={action} className="stack"><label>Name<input name="name" required maxLength={100} /></label><label>Email<input name="email" required type="email" maxLength={254} /></label><label>Role<select name="role"><option value="CO_COORDINATOR">Co-OJT Coordinator</option><option value="ATTORNEY">Attorney</option><option value="COMPANY">Company representative</option></select></label><label>Company for representative<select name="companyId"><option value="">Choose a company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><button disabled={pending}>{pending ? "Creating…" : "Create account"}</button>{state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status" className="success">{state.success}</p>}</form>;
}
