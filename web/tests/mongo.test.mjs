// Integration tests for the MongoDB quality store and vector search. Read-only against seed data.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { embed } from "../src/lib/embed.ts";
import { constraintsToFilter, cosineSimilarityExpr } from "../src/lib/quality.ts";
import { connectMongo } from "./helpers.mjs";

let client;
let lq;
let specs;
before(() => {
  const mongo = connectMongo();
  client = mongo.client;
  lq = mongo.db.collection("listing_quality");
  specs = mongo.db.collection("requirement_specs");
});
after(() => client.close());

describe("$jsonSchema validation and indexes", () => {
  it("rejects a document with a bad grade or a short embedding", async () => {
    const base = await lq.findOne({ listing_id: 1 }, { projection: { _id: 0 } });
    for (const bad of [{ grade: "Z" }, { embedding: [0.1, 0.2] }]) {
      await assert.rejects(lq.insertOne({ ...base, listing_id: 999_001, ...bad }), (e) => e.code === 121);
    }
  });

  it("enforces one quality document per MySQL listing", async () => {
    const base = await lq.findOne({ listing_id: 1 }, { projection: { _id: 0 } });
    await assert.rejects(lq.insertOne(base), (e) => e.code === 11000);
  });

  it("answers crop-specific attribute queries from the wildcard index", async () => {
    const plan = await lq.find({ "attributes.brix": { $gte: 4.5 } }).explain();
    assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /attributes_wildcard/);
  });
});

describe("buyer quality spec", () => {
  it("passes listing 1 and fails listing 2 for requirement 1", async () => {
    const spec = await specs.findOne({ requirement_id: 1 });
    const meeting = await lq
      .find({ listing_id: { $in: [1, 2] }, ...constraintsToFilter(spec.constraints) }, { projection: { listing_id: 1 } })
      .toArray();
    assert.deepEqual(meeting.map((d) => d.listing_id), [1]);
  });
});

describe("vector search", () => {
  const similarities = (vector) =>
    lq.aggregate([
      { $project: { _id: 0, listing_id: 1, crop: 1, variety: 1, similarity: cosineSimilarityExpr("$embedding", vector) } },
      { $sort: { similarity: -1 } },
    ]).toArray();

  it("scores a listing's own embedding as ~1 and all others lower", async () => {
    const own = await lq.findOne({ listing_id: 1 });
    const hits = await similarities(own.embedding);
    assert.equal(hits[0].listing_id, 1);
    assert.ok(Math.abs(hits[0].similarity - 1) < 1e-6);
    assert.ok(hits.slice(1).every((h) => h.similarity < hits[0].similarity && h.similarity >= -1));
  });

  it("finds chip-grade potatoes from a plain-language query", async () => {
    const [top] = await similarities(await embed("potatoes for making chips"));
    assert.equal(top.crop, "Potato");
    assert.equal(top.variety, "Kufri Chipsona");
  });
});
