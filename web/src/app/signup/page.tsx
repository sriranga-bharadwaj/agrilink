import Link from "next/link";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold">Create an account</h1>
      <p className="mb-6 text-sm text-stone-600">
        Already registered? <Link href="/login" className="text-brand-700 underline">Log in</Link>
      </p>
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <SignupForm />
      </div>
    </div>
  );
}
