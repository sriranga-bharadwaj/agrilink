// AgriLink MongoDB: collections, $jsonSchema validators and indexes.
// Usage (from web/): npm run mongo:setup
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.MONGODB_DB);

const COLLECTIONS = ["crop_quality_specs", "listing_quality", "requirement_specs"];
for (const name of COLLECTIONS) {
  await db.collection(name).drop().catch(() => {}); // ignore "ns not found"
}

// Reference data: which quality attributes each crop has. Different crops have
// different fields, which is why this lives in a document store.
await db.createCollection("crop_quality_specs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["crop", "attributes"],
      properties: {
        crop: { bsonType: "string" },
        attributes: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["key", "label", "type"],
            properties: {
              key: { bsonType: "string", pattern: "^[a-z_]+$" },
              label: { bsonType: "string" },
              type: { enum: ["number", "enum", "boolean"] },
              unit: { bsonType: "string" },
              min: { bsonType: ["int", "double"] },
              max: { bsonType: ["int", "double"] },
              values: { bsonType: "array", items: { bsonType: "string" } },
            },
          },
        },
      },
    },
  },
});

// One document per MySQL listing (linked by listing_id) holding the
// crop-specific measurements, certifications and the description embedding.
await db.createCollection("listing_quality", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["listing_id", "farmer_id", "crop", "grade", "attributes", "description", "embedding"],
      properties: {
        listing_id: { bsonType: ["int", "long"] },
        farmer_id: { bsonType: ["int", "long"] },
        crop: { bsonType: "string" },
        variety: { bsonType: ["string", "null"] },
        grade: { enum: ["A", "B", "C"] },
        is_organic: { bsonType: "bool" },
        attributes: { bsonType: "object" },
        certifications: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["name", "issuer", "valid_until"],
            properties: {
              name: { bsonType: "string" },
              issuer: { bsonType: "string" },
              valid_until: { bsonType: "date" },
            },
          },
        },
        inspection: {
          bsonType: "object",
          required: ["method", "inspected_on"],
          properties: {
            method: { enum: ["SELF", "LAB"] },
            inspected_on: { bsonType: "date" },
            inspector: { bsonType: "string" },
          },
        },
        description: { bsonType: "string", minLength: 10 },
        embedding: { bsonType: "array", minItems: 384, maxItems: 384, items: { bsonType: ["double", "int"] } },
      },
    },
  },
  validationAction: "error",
});

// Buyer quality constraints per MySQL requirement, plus an embedding of the notes.
await db.createCollection("requirement_specs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["requirement_id", "buyer_id", "crop", "constraints", "notes", "embedding"],
      properties: {
        requirement_id: { bsonType: ["int", "long"] },
        buyer_id: { bsonType: ["int", "long"] },
        crop: { bsonType: "string" },
        constraints: { bsonType: "object" },
        notes: { bsonType: "string" },
        embedding: { bsonType: "array", minItems: 384, maxItems: 384, items: { bsonType: ["double", "int"] } },
      },
    },
  },
});

await db.collection("crop_quality_specs").createIndex({ crop: 1 }, { unique: true });

const lq = db.collection("listing_quality");
await lq.createIndex({ listing_id: 1 }, { unique: true });
await lq.createIndex({ crop: 1, grade: 1 });
// Wildcard index: every crop-specific field under attributes is indexed
// without knowing the field names in advance.
await lq.createIndex({ "attributes.$**": 1 }, { name: "attributes_wildcard" });
await lq.createIndex({ "certifications.name": 1, "certifications.valid_until": 1 });
// Full-text search over descriptions (variety weighted higher).
await lq.createIndex(
  { description: "text", variety: "text" },
  { name: "description_text", weights: { variety: 3, description: 1 } },
);

await db.collection("requirement_specs").createIndex({ requirement_id: 1 }, { unique: true });

for (const name of COLLECTIONS) {
  const indexes = await db.collection(name).indexes();
  console.log(`${name}: ${indexes.map((i) => i.name).join(", ")}`);
}
await client.close();
