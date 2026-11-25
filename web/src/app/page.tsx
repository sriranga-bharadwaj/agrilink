import Link from "next/link";
import { Stat } from "@/components/ui";
import { query } from "@/lib/db";
import { kg } from "@/lib/format";
import { getSession, homeFor } from "@/lib/session";

type Totals = { listings: number; supply_kg: number; farmers: number; requirements: number; buyers: number };

const STEPS = [
  { title: "Farmers list produce", body: "Crop, variety, quantity, price, quality grade, harvest date and how long it stays fresh." },
  { title: "Buyers post requirements", body: "How much they need, the most they will pay, minimum quality, distance and deadline." },
  { title: "AgriLink ranks matches", body: "A stored procedure filters and scores every listing on price, quantity, distance, freshness and quality." },
  { title: "Orders are transactional", body: "Stock is locked and reduced atomically, so two buyers can never buy the same kilo." },
];

export default async function Home() {
  const session = await getSession();
  const [totals] = await query<Totals>(
    `SELECT (SELECT COUNT(*) FROM v_active_listings)                  AS listings,
            (SELECT COALESCE(SUM(available_kg), 0) FROM v_active_listings) AS supply_kg,
            (SELECT COUNT(*) FROM farmers)                            AS farmers,
            (SELECT COUNT(*) FROM v_open_requirements)                AS requirements,
            (SELECT COUNT(*) FROM buyers)                             AS buyers`,
  );

  return (
    <>
      <section className="rounded-2xl bg-brand-900 px-6 py-14 text-white sm:px-12">
        <p className="text-sm font-medium uppercase tracking-widest text-brand-200">Farm to business, directly</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Fair prices for farmers. Reliable supply for business.
        </h1>
        <p className="mt-4 max-w-xl text-brand-100">
          AgriLink matches farm produce with the processors, hotels, retailers and exporters who need it, ranked by
          quality, price, distance and freshness.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {session ? (
            <Link href={homeFor(session.role)} className="btn bg-white text-brand-900 hover:bg-brand-50">Go to dashboard</Link>
          ) : (
            <>
              <Link href="/signup" className="btn bg-white text-brand-900 hover:bg-brand-50">Get started</Link>
              <Link href="/market" className="btn border border-brand-200 bg-transparent hover:bg-brand-700">Browse marketplace</Link>
            </>
          )}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active listings" value={totals.listings} />
        <Stat label="Produce available" value={kg(totals.supply_kg)} />
        <Stat label="Farmers" value={totals.farmers} />
        <Stat label="Open requirements" value={totals.requirements} hint={`from ${totals.buyers} buyers`} />
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {i + 1}
              </div>
              <h3 className="font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
