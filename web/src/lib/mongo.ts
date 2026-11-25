import "server-only";
import { MongoClient } from "mongodb";
import type { CropSpec, ListingQuality, RequirementSpec } from "@/lib/quality";

// Reuse one client across hot reloads in development. The driver connects lazily.
const globalForMongo = globalThis as unknown as { agrilinkMongo?: MongoClient };

const client = globalForMongo.agrilinkMongo ?? new MongoClient(process.env.MONGODB_URI!);
if (process.env.NODE_ENV !== "production") globalForMongo.agrilinkMongo = client;

const db = client.db(process.env.MONGODB_DB);

export const cropSpecs = db.collection<CropSpec>("crop_quality_specs");
export const listingQuality = db.collection<ListingQuality>("listing_quality");
export const requirementSpecs = db.collection<RequirementSpec>("requirement_specs");
