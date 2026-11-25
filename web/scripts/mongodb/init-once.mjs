// Creates and seeds the MongoDB collections only if they are empty, so restarting
// Docker Compose never wipes quality documents created through the app.
// Usage: node scripts/mongodb/init-once.mjs
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
const count = await client.db(process.env.MONGODB_DB).collection("listing_quality").estimatedDocumentCount();
await client.close();

if (count > 0) {
  console.log(`MongoDB already has ${count} listing_quality documents; skipping setup and seed.`);
} else {
  await import("./setup.mjs");
  await import("./seed.mjs");
}
