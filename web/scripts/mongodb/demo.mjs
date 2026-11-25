// AgriLink MongoDB walkthrough: the NoSQL / vector commands used by the app
// (good for report screenshots). Usage (from web/): npm run mongo:demo
import { MongoClient } from "mongodb";
import { embed } from "../../src/lib/embed.ts";
import { constraintsToFilter, cosineSimilarityExpr } from "../../src/lib/quality.ts";

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.MONGODB_DB);
const specs = db.collection("crop_quality_specs");
const quality = db.collection("listing_quality");
const reqSpecs = db.collection("requirement_specs");

const noVector = { _id: 0, embedding: 0 };
function show(title, value) {
  console.log(`\n=== ${title} ===`);
  console.dir(value, { depth: null, colors: false });
}

// 1. Flexible schema: each crop defines its own quality attributes
show("1. Quality attributes defined for Tomato",
  await specs.findOne({ crop: "Tomato" }, { projection: { _id: 0 } }));

// 2. Two listings, two different shapes of attributes
show("2. Quality document for a rice listing vs a tomato listing",
  await quality.find({ listing_id: { $in: [1, 8] } }, { projection: { ...noVector, description: 0 } }).toArray());

// 3. Query on crop-specific fields (served by the attributes wildcard index)
const redHighBrix = { crop: "Tomato", "attributes.ripeness": "red", "attributes.brix": { $gte: 4.5 } };
show("3. Red tomatoes with Brix >= 4.5",
  await quality.find(redHighBrix, { projection: { _id: 0, listing_id: 1, variety: 1, grade: 1, attributes: 1 } }).toArray());
const plan = await quality.find(redHighBrix).explain("queryPlanner");
show("   Index used", JSON.stringify(plan.queryPlanner.winningPlan).match(/"indexName":"([^"]+)"/)?.[1]);

// 4. Array query: listings with a valid organic certificate
show("4. Listings with an organic certificate valid beyond 6 months",
  await quality.find(
    { certifications: { $elemMatch: { name: /organic/i, valid_until: { $gte: new Date(Date.now() + 182 * 86_400_000) } } } },
    { projection: { _id: 0, listing_id: 1, crop: 1, variety: 1, "certifications.issuer": 1, "certifications.valid_until": 1 } },
  ).toArray());

// 5. Full-text search on descriptions
show("5. $text search: 'sauce ketchup pulp'",
  await quality.find({ $text: { $search: "sauce ketchup pulp" } },
    { projection: { _id: 0, listing_id: 1, variety: 1, score: { $meta: "textScore" } } })
    .sort({ score: { $meta: "textScore" } }).toArray());

// 6. Aggregation: tomato quality by grade
show("6. Tomato quality summary per grade ($group)",
  await quality.aggregate([
    { $match: { crop: "Tomato" } },
    { $group: {
      _id: "$grade",
      listings: { $sum: 1 },
      avg_brix: { $avg: "$attributes.brix" },
      avg_defects_pct: { $avg: "$attributes.defects_pct" },
      lab_tested: { $sum: { $cond: [{ $eq: ["$inspection.method", "LAB"] }, 1, 0] } },
    } },
    { $sort: { _id: 1 } },
  ]).toArray());

// 7. Buyer quality spec -> MongoDB filter (used on the matches page)
const req1 = await reqSpecs.findOne({ requirement_id: 1 });
const specFilter = { crop: req1.crop, ...constraintsToFilter(req1.constraints) };
show("7. Requirement #1 constraints", req1.constraints);
show("   Generated filter", specFilter);
show("   Listings meeting the spec",
  await quality.find(specFilter, { projection: { _id: 0, listing_id: 1, variety: 1, attributes: 1 } }).toArray());

// 8. Vector similarity: requirement notes vs listing descriptions (cosine via $zip/$reduce)
show("8. Semantic similarity of requirement #1 to tomato listings",
  await quality.aggregate([
    { $match: { crop: "Tomato" } },
    { $project: { _id: 0, listing_id: 1, variety: 1, similarity: cosineSimilarityExpr("$embedding", req1.embedding) } },
    { $sort: { similarity: -1 } },
  ]).toArray());

// 9. Free-text semantic search across all crops
const q = "something for making chips and french fries";
const qVec = await embed(q);
show(`9. Semantic search: "${q}"`,
  await quality.aggregate([
    { $project: { _id: 0, listing_id: 1, crop: 1, variety: 1, similarity: cosineSimilarityExpr("$embedding", qVec) } },
    { $sort: { similarity: -1 } },
    { $limit: 3 },
  ]).toArray());

// 10. Update a nested attribute and push a certification
await quality.updateOne(
  { listing_id: 2 },
  {
    $set: { "attributes.defects_pct": 4, "inspection.method": "LAB", "inspection.inspector": "Kolar District Produce Lab" },
    $push: { certifications: { name: "GAP Certified", issuer: "IndGAP", valid_until: new Date("2027-12-31") } },
    $currentDate: { updated_at: true },
  },
);
show("10. Listing 2 after $set / $push / $currentDate",
  await quality.findOne({ listing_id: 2 }, { projection: { ...noVector, description: 0 } }));

// 11. Schema validation rejects a bad document
try {
  await quality.insertOne({ listing_id: 99, farmer_id: 1, crop: "Tomato", grade: "Z", attributes: {}, description: "bad", embedding: [] });
} catch (e) {
  show("11. $jsonSchema validation error (expected)", `${e.codeName ?? "DocumentValidationFailure"} (code ${e.code}): ${e.errInfo?.details?.schemaRulesNotSatisfied?.map((r) => r.operatorName + " " + JSON.stringify(r.propertiesNotSatisfied?.map((p) => p.propertyName) ?? r.missingProperties)).join("; ")}`);
}

await client.close();
