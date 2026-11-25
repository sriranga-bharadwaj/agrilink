import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      {title && (
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="font-semibold text-stone-800">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  ACTIVE: "bg-brand-100 text-brand-700",
  OPEN: "bg-brand-100 text-brand-700",
  SUGGESTED: "bg-sky-100 text-sky-700",
  ACCEPTED: "bg-brand-100 text-brand-700",
  PLACED: "bg-sky-100 text-sky-700",
  CONFIRMED: "bg-indigo-100 text-indigo-700",
  SHIPPED: "bg-amber-100 text-amber-800",
  DELIVERED: "bg-brand-100 text-brand-700",
  FULFILLED: "bg-brand-100 text-brand-700",
  SOLD_OUT: "bg-stone-200 text-stone-700",
  CANCELLED: "bg-red-100 text-red-700",
  EXPIRED: "bg-stone-200 text-stone-600",
  WITHDRAWN: "bg-stone-200 text-stone-600",
  REJECTED: "bg-stone-200 text-stone-600",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[value] ?? "bg-stone-100 text-stone-700"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export function Grade({ grade, organic }: { grade: string; organic?: number | boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded bg-soil-100 px-1.5 py-0.5 text-xs font-semibold text-soil-500">Grade {grade}</span>
      {organic ? <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">Organic</span> : null}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-stone-500">{children}</p>;
}
