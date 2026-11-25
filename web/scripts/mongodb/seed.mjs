// AgriLink MongoDB sample data, aligned with database/mysql/05_seed.sql
// (listing_id / requirement_id match the MySQL rows).
// Usage (from web/): npm run mongo:seed
import { MongoClient } from "mongodb";
import { embedMany } from "../../src/lib/embed.ts";

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.MONGODB_DB);

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const date = (s) => new Date(`${s}T00:00:00Z`);

const specs = [
  { crop: "Tomato", attributes: [
    { key: "ripeness", label: "Ripeness", type: "enum", values: ["green", "breaker", "turning", "pink", "red"] },
    { key: "firmness", label: "Firmness", type: "enum", values: ["firm", "medium", "soft"] },
    { key: "avg_weight_g", label: "Avg fruit weight", type: "number", unit: "g", min: 20, max: 300 },
    { key: "brix", label: "Brix (sweetness)", type: "number", unit: "°Bx", min: 2, max: 10 },
    { key: "defects_pct", label: "Defects", type: "number", unit: "%", min: 0, max: 50 },
  ] },
  { crop: "Onion", attributes: [
    { key: "bulb_size_mm", label: "Bulb size", type: "number", unit: "mm", min: 20, max: 100 },
    { key: "skin_color", label: "Skin colour", type: "enum", values: ["red", "pink", "white"] },
    { key: "pungency", label: "Pungency", type: "enum", values: ["low", "medium", "high"] },
    { key: "sprouting_pct", label: "Sprouting", type: "number", unit: "%", min: 0, max: 30 },
  ] },
  { crop: "Potato", attributes: [
    { key: "tuber_size_mm", label: "Tuber size", type: "number", unit: "mm", min: 20, max: 100 },
    { key: "dry_matter_pct", label: "Dry matter", type: "number", unit: "%", min: 10, max: 30 },
    { key: "reducing_sugar_pct", label: "Reducing sugar", type: "number", unit: "%", min: 0, max: 1 },
    { key: "greening_pct", label: "Greening", type: "number", unit: "%", min: 0, max: 20 },
  ] },
  { crop: "Rice", attributes: [
    { key: "moisture_pct", label: "Moisture", type: "number", unit: "%", min: 8, max: 20 },
    { key: "broken_pct", label: "Broken grains", type: "number", unit: "%", min: 0, max: 50 },
    { key: "grain_length_mm", label: "Grain length", type: "number", unit: "mm", min: 3, max: 9 },
    { key: "aromatic", label: "Aromatic", type: "boolean" },
    { key: "polish", label: "Polish", type: "enum", values: ["raw", "single", "double"] },
  ] },
  { crop: "Ragi", attributes: [
    { key: "moisture_pct", label: "Moisture", type: "number", unit: "%", min: 8, max: 20 },
    { key: "foreign_matter_pct", label: "Foreign matter", type: "number", unit: "%", min: 0, max: 10 },
    { key: "grain_color", label: "Grain colour", type: "enum", values: ["brown", "red", "white"] },
  ] },
  { crop: "Banana", attributes: [
    { key: "ripeness_stage", label: "Ripeness stage (1-7)", type: "number", min: 1, max: 7 },
    { key: "finger_length_cm", label: "Finger length", type: "number", unit: "cm", min: 5, max: 30 },
    { key: "blemish_pct", label: "Blemishes", type: "number", unit: "%", min: 0, max: 50 },
  ] },
  { crop: "Grapes", attributes: [
    { key: "brix", label: "Brix (sweetness)", type: "number", unit: "°Bx", min: 10, max: 28 },
    { key: "berry_size_mm", label: "Berry size", type: "number", unit: "mm", min: 8, max: 30 },
    { key: "seedless", label: "Seedless", type: "boolean" },
    { key: "color", label: "Colour", type: "enum", values: ["green", "black", "red"] },
  ] },
  { crop: "Toor Dal", attributes: [
    { key: "moisture_pct", label: "Moisture", type: "number", unit: "%", min: 6, max: 16 },
    { key: "broken_pct", label: "Broken", type: "number", unit: "%", min: 0, max: 30 },
    { key: "polish", label: "Polish", type: "enum", values: ["unpolished", "oil", "water"] },
  ] },
  { crop: "Turmeric", attributes: [
    { key: "curcumin_pct", label: "Curcumin", type: "number", unit: "%", min: 1, max: 9 },
    { key: "moisture_pct", label: "Moisture", type: "number", unit: "%", min: 6, max: 16 },
    { key: "form", label: "Form", type: "enum", values: ["finger", "bulb", "powder"] },
  ] },
  { crop: "Groundnut", attributes: [
    { key: "oil_content_pct", label: "Oil content", type: "number", unit: "%", min: 35, max: 60 },
    { key: "moisture_pct", label: "Moisture", type: "number", unit: "%", min: 4, max: 12 },
    { key: "count_per_oz", label: "Count per ounce", type: "number", min: 30, max: 120 },
    { key: "aflatoxin_ppb", label: "Aflatoxin", type: "number", unit: "ppb", min: 0, max: 50 },
  ] },
];

const organicCert = (issuer, until) => [{ name: "NPOP Organic", issuer, valid_until: date(until) }];

const listings = [
  { listing_id: 1, farmer_id: 1, crop: "Tomato", variety: "Arka Rakshak", grade: "A", is_organic: false,
    attributes: { ripeness: "red", firmness: "firm", avg_weight_g: 90, brix: 4.8, defects_pct: 2 },
    certifications: [], inspection: { method: "LAB", inspected_on: daysAgo(1), inspector: "Kolar District Produce Lab" },
    description: "Deep red, firm Arka Rakshak tomatoes harvested yesterday. Thick walls and high pulp, good for sauce, ketchup and puree. Graded and packed in 25 kg crates." },
  { listing_id: 2, farmer_id: 1, crop: "Tomato", variety: "Local Desi", grade: "B", is_organic: false,
    attributes: { ripeness: "pink", firmness: "medium", avg_weight_g: 60, brix: 4.2, defects_pct: 6 },
    certifications: [], inspection: { method: "SELF", inspected_on: daysAgo(3) },
    description: "Local desi tomatoes, slightly tangy, mixed sizes. Suitable for curries, chutney and bulk processing." },
  { listing_id: 3, farmer_id: 2, crop: "Tomato", variety: "Arka Samrat", grade: "A", is_organic: true,
    attributes: { ripeness: "red", firmness: "firm", avg_weight_g: 110, brix: 5.2, defects_pct: 1 },
    certifications: organicCert("Karnataka State Organic Certification Agency", "2027-03-31"),
    inspection: { method: "LAB", inspected_on: daysAgo(1), inspector: "Chikkaballapur Agri Testing Lab" },
    description: "Certified organic, pesticide-free tomatoes of uniform size and bright red colour. Ideal for hotel kitchens and fresh salads." },
  { listing_id: 4, farmer_id: 2, crop: "Onion", variety: "Bellary Red", grade: "B", is_organic: false,
    attributes: { bulb_size_mm: 55, skin_color: "red", pungency: "high", sprouting_pct: 1 },
    certifications: [], inspection: { method: "SELF", inspected_on: daysAgo(9) },
    description: "Bellary red onions, medium size, strong pungency, well cured with dry outer skin. Good storage life for retail shelves." },
  { listing_id: 5, farmer_id: 6, crop: "Onion", variety: "Nashik Red", grade: "A", is_organic: false,
    attributes: { bulb_size_mm: 65, skin_color: "red", pungency: "medium", sprouting_pct: 0 },
    certifications: [], inspection: { method: "LAB", inspected_on: daysAgo(6), inspector: "Lasalgaon Onion Grading Centre" },
    description: "Export quality Nashik red onions, 55 to 70 mm, uniform colour, fully cured and sorted." },
  { listing_id: 6, farmer_id: 3, crop: "Potato", variety: "Kufri Jyoti", grade: "B", is_organic: false,
    attributes: { tuber_size_mm: 50, dry_matter_pct: 17, reducing_sugar_pct: 0.25, greening_pct: 3 },
    certifications: [], inspection: { method: "SELF", inspected_on: daysAgo(5) },
    description: "Table potatoes for household and restaurant cooking, mixed sizes, washed." },
  { listing_id: 7, farmer_id: 5, crop: "Potato", variety: "Kufri Chipsona", grade: "A", is_organic: false,
    attributes: { tuber_size_mm: 60, dry_matter_pct: 22, reducing_sugar_pct: 0.08, greening_pct: 0.5 },
    certifications: [], inspection: { method: "LAB", inspected_on: daysAgo(4), inspector: "Hassan Horticulture Lab" },
    description: "Processing grade Kufri Chipsona potatoes with high dry matter and low reducing sugar, ideal for chips and french fries." },
  { listing_id: 8, farmer_id: 4, crop: "Rice", variety: "Sona Masuri", grade: "A", is_organic: false,
    attributes: { moisture_pct: 12.5, broken_pct: 3, grain_length_mm: 5.2, aromatic: false, polish: "double" },
    certifications: [], inspection: { method: "LAB", inspected_on: daysAgo(18), inspector: "Mandya Grain Quality Lab" },
    description: "Aged Sona Masuri raw rice, lightweight grains, low broken percentage, export ready in 25 kg bags." },
  { listing_id: 9, farmer_id: 4, crop: "Ragi", variety: "GPU-28", grade: "A", is_organic: true,
    attributes: { moisture_pct: 11, foreign_matter_pct: 0.5, grain_color: "brown" },
    certifications: organicCert("PGS-India Regional Council", "2027-06-30"),
    inspection: { method: "LAB", inspected_on: daysAgo(14), inspector: "Mandya Grain Quality Lab" },
    description: "Organic finger millet (ragi), machine cleaned and sun dried, rich in calcium. Good for flour mills and health foods." },
  { listing_id: 10, farmer_id: 5, crop: "Banana", variety: "Yelakki", grade: "A", is_organic: true,
    attributes: { ripeness_stage: 3, finger_length_cm: 10, blemish_pct: 2 },
    certifications: organicCert("Karnataka State Organic Certification Agency", "2026-12-31"),
    inspection: { method: "SELF", inspected_on: daysAgo(1) },
    description: "Yelakki small sweet bananas, organically grown, ripening stage 3, suitable for hotels, juice bars and retail." },
  { listing_id: 11, farmer_id: 2, crop: "Grapes", variety: "Sharad Seedless", grade: "A", is_organic: false,
    attributes: { brix: 19, berry_size_mm: 18, seedless: true, color: "black" },
    certifications: [], inspection: { method: "LAB", inspected_on: daysAgo(2), inspector: "Chikkaballapur Agri Testing Lab" },
    description: "Sharad seedless black grapes, crisp and sweet, pre-cooled and cold-chain ready." },
  { listing_id: 12, farmer_id: 3, crop: "Turmeric", variety: "Salem", grade: "B", is_organic: false,
    attributes: { curcumin_pct: 3.5, moisture_pct: 10, form: "finger" },
    certifications: [], inspection: { method: "SELF", inspected_on: daysAgo(28) },
    description: "Salem turmeric fingers, boiled and polished, medium curcumin content, for spice processors." },
  { listing_id: 13, farmer_id: 1, crop: "Tomato", variety: "Arka Rakshak", grade: "C", is_organic: false,
    attributes: { ripeness: "red", firmness: "soft", avg_weight_g: 70, brix: 4.5, defects_pct: 15 },
    certifications: [], inspection: { method: "SELF", inspected_on: daysAgo(14) },
    description: "Overripe soft tomatoes at a discount, only for immediate processing into paste." },
  { listing_id: 14, farmer_id: 4, crop: "Toor Dal", variety: "BSMR-736", grade: "A", is_organic: false,
    attributes: { moisture_pct: 10, broken_pct: 2, polish: "unpolished" },
    certifications: [], inspection: { method: "LAB", inspected_on: daysAgo(20), inspector: "Mandya Grain Quality Lab" },
    description: "Unpolished toor dal, clean and uniform split, high protein, packed in 50 kg bags." },
];

const requirements = [
  { requirement_id: 1, buyer_id: 7, crop: "Tomato",
    constraints: { ripeness: { in: ["red"] }, brix: { min: 4.5 }, defects_pct: { max: 5 } },
    notes: "Need fully red, high pulp tomatoes for our sauce and ketchup line." },
  { requirement_id: 2, buyer_id: 8, crop: "Tomato",
    constraints: { firmness: { in: ["firm"] }, avg_weight_g: { min: 80 } },
    notes: "Organic salad tomatoes, firm and uniform for the hotel kitchen." },
  { requirement_id: 3, buyer_id: 9, crop: "Onion",
    constraints: { bulb_size_mm: { min: 50 }, sprouting_pct: { max: 2 } },
    notes: "Medium to large red onions with good storage life for retail shelves." },
  { requirement_id: 4, buyer_id: 7, crop: "Potato",
    constraints: { dry_matter_pct: { min: 20 }, reducing_sugar_pct: { max: 0.1 } },
    notes: "Chip-grade potatoes with high dry matter and low reducing sugar for frying." },
  { requirement_id: 5, buyer_id: 10, crop: "Rice",
    constraints: { moisture_pct: { max: 14 }, broken_pct: { max: 5 } },
    notes: "Export quality Sona Masuri, low moisture and minimal broken grains." },
  { requirement_id: 6, buyer_id: 10, crop: "Ragi",
    constraints: { moisture_pct: { max: 12 }, foreign_matter_pct: { max: 1 } },
    notes: "Clean organic ragi for a health food export order." },
];

console.log("Embedding descriptions with the local model…");
const listingVectors = await embedMany(listings.map((l) => `${l.crop} ${l.variety}. ${l.description}`));
const requirementVectors = await embedMany(requirements.map((r) => `${r.crop}. ${r.notes}`));

await db.collection("crop_quality_specs").deleteMany({});
await db.collection("listing_quality").deleteMany({});
await db.collection("requirement_specs").deleteMany({});

const now = new Date();
await db.collection("crop_quality_specs").insertMany(specs);
await db.collection("listing_quality").insertMany(
  listings.map((l, i) => ({ ...l, embedding: listingVectors[i], updated_at: now })),
);
await db.collection("requirement_specs").insertMany(
  requirements.map((r, i) => ({ ...r, embedding: requirementVectors[i], updated_at: now })),
);

for (const name of ["crop_quality_specs", "listing_quality", "requirement_specs"]) {
  console.log(`${name}: ${await db.collection(name).countDocuments()} documents`);
}
await client.close();
