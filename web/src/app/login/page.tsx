import Link from "next/link";
import { login } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold">Log in</h1>
      <p className="mb-6 text-sm text-stone-600">
        New here? <Link href="/signup" className="text-brand-700 underline">Create an account</Link>
      </p>
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <ActionForm action={login} submitLabel="Log in" submitClassName="btn w-full">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
        </ActionForm>
      </div>
      <p className="mt-4 text-xs text-stone-500">
        Demo accounts use password <code>password123</code>: farmer <code>ramesh@agrilink.test</code>, buyer{" "}
        <code>procure@freshbite.test</code>.
      </p>
    </div>
  );
}
