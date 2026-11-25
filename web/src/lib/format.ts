const inrFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const numFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const inr = (n: number | null) => (n == null ? "–" : inrFormat.format(n));
export const kg = (n: number | null) => (n == null ? "–" : `${numFormat.format(n)} kg`);
export const perKg = (n: number | null) => (n == null ? "–" : `₹${numFormat.format(n)}/kg`);
export const num = (n: number | null) => (n == null ? "–" : numFormat.format(n));

export function date(s: string | null) {
  if (!s) return "–";
  return new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
