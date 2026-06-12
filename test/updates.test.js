import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "../src/updates.js";

test("compares semantic release versions", () => {
  assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.equal(compareVersions("1.1.9", "1.2.0"), -1);
});

test("rejects malformed release versions", () => {
  assert.throws(() => compareVersions("latest", "1.0.0"));
});
