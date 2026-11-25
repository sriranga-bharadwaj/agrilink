// Unit tests for the crop-quality helpers (no database needed).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attributesFromForm, constraintsFromForm, constraintsToFilter, describeConstraint, formatAttr, unmetConstraints,
} from "../src/lib/quality.ts";

const tomato = {
  crop: "Tomato",
  attributes: [
    { key: "ripeness", label: "Ripeness", type: "enum", values: ["green", "pink", "red"] },
    { key: "brix", label: "Brix", type: "number", unit: "°Bx" },
    { key: "defects_pct", label: "Defects", type: "number", unit: "%" },
    { key: "organic_seed", label: "Organic seed", type: "boolean" },
  ],
};

const form = (entries) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

describe("constraintsToFilter", () => {
  it("maps min/max/in/eq onto attributes.* MongoDB operators", () => {
    assert.deepEqual(
      constraintsToFilter({
        brix: { min: 4.5 }, defects_pct: { max: 5 }, ripeness: { in: ["red"] }, organic_seed: { eq: true },
      }),
      {
        "attributes.brix": { $gte: 4.5 },
        "attributes.defects_pct": { $lte: 5 },
        "attributes.ripeness": { $in: ["red"] },
        "attributes.organic_seed": { $eq: true },
      },
    );
  });

  it("combines a range on one attribute and skips empty constraints", () => {
    assert.deepEqual(constraintsToFilter({ brix: { min: 4, max: 6 }, ripeness: { in: [] } }), {
      "attributes.brix": { $gte: 4, $lte: 6 },
    });
  });
});

describe("unmetConstraints", () => {
  const constraints = { ripeness: { in: ["red"] }, brix: { min: 4.5 }, defects_pct: { max: 5 } };

  it("returns nothing when every limit is met", () => {
    assert.deepEqual(unmetConstraints({ ripeness: "red", brix: 4.8, defects_pct: 2 }, constraints, tomato), []);
  });

  it("names each failed attribute with its value", () => {
    assert.deepEqual(unmetConstraints({ ripeness: "pink", brix: 4.2, defects_pct: 6 }, constraints, tomato), [
      "Ripeness: pink", "Brix: 4.2", "Defects: 6",
    ]);
  });

  it("treats a missing attribute as not reported", () => {
    assert.deepEqual(unmetConstraints({ ripeness: "red", defects_pct: 1 }, constraints, tomato), ["Brix: not reported"]);
  });
});

describe("describeConstraint and formatAttr", () => {
  it("renders limits with labels and units", () => {
    assert.equal(describeConstraint("brix", { min: 4.5 }, tomato), "Brix ≥ 4.5 °Bx");
    assert.equal(describeConstraint("defects_pct", { max: 5 }, tomato), "Defects ≤ 5 %");
    assert.equal(describeConstraint("brix", { min: 4, max: 6 }, tomato), "Brix 4–6 °Bx");
    assert.equal(describeConstraint("ripeness", { in: ["red", "pink"] }, tomato), "Ripeness: red / pink");
    assert.equal(describeConstraint("organic_seed", { eq: false }, tomato), "Organic seed: no");
  });

  it("renders attribute values", () => {
    assert.equal(formatAttr(tomato.attributes[1], "brix", 4.8), "Brix: 4.8 °Bx");
    assert.equal(formatAttr(tomato.attributes[3], "organic_seed", true), "Organic seed: yes");
    assert.equal(formatAttr(undefined, "unknown_key", "x"), "unknown_key: x");
  });
});

describe("form readers", () => {
  it("attributesFromForm converts types and skips blanks", () => {
    const attrs = attributesFromForm(tomato, form([
      ["attr_ripeness", "red"], ["attr_brix", "4.8"], ["attr_defects_pct", ""], ["attr_organic_seed", "true"],
    ]));
    assert.deepEqual(attrs, { ripeness: "red", brix: 4.8, organic_seed: true });
  });

  it("constraintsFromForm reads min/max, multi-select and yes/no inputs", () => {
    const constraints = constraintsFromForm(tomato, form([
      ["min_brix", "4.5"], ["max_defects_pct", "5"], ["in_ripeness", "red"], ["in_ripeness", "pink"],
      ["eq_organic_seed", "false"],
    ]));
    assert.deepEqual(constraints, {
      ripeness: { in: ["red", "pink"] }, brix: { min: 4.5 }, defects_pct: { max: 5 }, organic_seed: { eq: false },
    });
  });
});
