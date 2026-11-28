import Link from "next/link";
import { Grade, Stat } from "@/components/ui";
import { query } from "@/lib/db";
import { kg, num, perKg } from "@/lib/format";
import { getSession, homeFor } from "@/lib/session";

type Totals = { listings: number; supply_kg: number; farmers: number; requirements: number; buyers: number };
type Fresh = {
  listing_id: number; crop_name: string; variety: string | null; farm_name: string; district: string;
  price_per_kg: number; quality_grade: string; is_organic: number; freshness_pct: number;
};

const STEPS = [
  { title: "Farmers list produce", body: "Crop, variety, quantity, price, quality grade, harvest date and how long it stays fresh." },
  { title: "Buyers post requirements", body: "How much they need, the most they will pay, minimum quality, distance and deadline." },
  { title: "AgriLink ranks matches", body: "A stored procedure filters and scores every listing on price, quantity, distance, freshness and quality." },
  { title: "Orders are transactional", body: "Stock is locked and reduced atomically, so two buyers can never buy the same kilo." },
];

const FEATURES = [
  { title: "Quality-aware matching", body: "Each crop has its own quality measures, like Brix for tomatoes or moisture for rice. Buyers set limits and see which listings meet them." },
  { title: "No overselling", body: "Orders run as one locked database transaction. In a test of 500 simultaneous orders, not a single kilo was oversold." },
  { title: "Search by meaning", body: "Type “potatoes for making chips” and find the right variety, even when the words don't match the listing." },
  { title: "Price suggestions", body: "Farmers get a suggested price and an 80% range based on government mandi prices from their own district." },
];

export default async function Home() {
  const session = await getSession();
  const [[totals], fresh] = await Promise.all([
    query<Totals>(
      `SELECT (SELECT COUNT(*) FROM v_active_listings)                  AS listings,
              (SELECT COALESCE(SUM(available_kg), 0) FROM v_active_listings) AS supply_kg,
              (SELECT COUNT(*) FROM farmers)                            AS farmers,
              (SELECT COUNT(*) FROM v_open_requirements)                AS requirements,
              (SELECT COUNT(*) FROM buyers)                             AS buyers`,
    ),
    query<Fresh>(
      `SELECT listing_id, crop_name, variety, farm_name, district, price_per_kg, quality_grade, is_organic, freshness_pct
         FROM v_active_listings ORDER BY freshness_pct DESC, listing_id DESC LIMIT 4`,
    ),
  ]);

  return (
    <>
      <section className="grid gap-8 rounded-2xl bg-brand-900 px-6 py-12 text-white sm:px-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-200">Farm to business, directly</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
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
        </div>

        <div className="min-w-0 rounded-xl bg-white/95 p-4 text-stone-800 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Fresh on AgriLink</h2>
            <Link href="/market" className="text-xs font-medium text-brand-700 hover:underline">See all</Link>
          </div>
          {fresh.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">No active listings right now.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {fresh.map((l) => (
                <li key={l.listing_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {l.crop_name} <span className="font-normal text-stone-500">{l.variety}</span>
                    </div>
                    <div className="truncate text-xs text-stone-500">{l.farm_name} · {l.district}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold">{perKg(l.price_per_kg)}</div>
                    <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-stone-500">
                      <Grade grade={l.quality_grade} organic={l.is_organic} /> {num(l.freshness_pct)}% fresh
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">What makes it different</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="font-medium text-brand-700">{f.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
