import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeDeps,
  classifyNpmError,
  REQUIRED_DEPS,
  NPM_INSTALL_TIMEOUT_MS,
} from "../lib/bootstrap.js";

test("constants exposed", () => {
  assert.deepEqual(REQUIRED_DEPS, { pngjs: "^7.0.0", "jpeg-js": "^0.4.4" });
  assert.equal(NPM_INSTALL_TIMEOUT_MS, 90_000);
});

test("mergeDeps: empty → adds all required", () => {
  const merged = mergeDeps({}, REQUIRED_DEPS);
  assert.deepEqual(merged, { pngjs: "^7.0.0", "jpeg-js": "^0.4.4" });
});

test("mergeDeps: partial → adds only missing", () => {
  const merged = mergeDeps({ pngjs: "^7.0.0", ws: "^8.18.0" }, REQUIRED_DEPS);
  assert.deepEqual(merged, {
    pngjs: "^7.0.0",
    ws: "^8.18.0",
    "jpeg-js": "^0.4.4",
  });
});

test("mergeDeps: idempotent — no change when all present", () => {
  const local = {
    pngjs: "^7.0.0",
    "jpeg-js": "^0.4.4",
    ws: "^8.18.0",
  };
  assert.deepEqual(mergeDeps(local, REQUIRED_DEPS), local);
});

test("mergeDeps: preserves user version even if higher than required", () => {
  const merged = mergeDeps({ pngjs: "^7.5.0" }, REQUIRED_DEPS);
  assert.equal(merged.pngjs, "^7.5.0");
  assert.equal(merged["jpeg-js"], "^0.4.4");
});

test("classifyNpmError: ENOENT → NPM_NOT_FOUND", () => {
  const err = Object.assign(new Error("spawn npm ENOENT"), { code: "ENOENT" });
  assert.equal(classifyNpmError(err), "NPM_NOT_FOUND");
});

test("classifyNpmError: EACCES → PERMISSION", () => {
  const err = Object.assign(new Error("permission denied"), { code: "EACCES" });
  assert.equal(classifyNpmError(err), "PERMISSION");
});

test("classifyNpmError: timeout flag → TIMEOUT", () => {
  const err = Object.assign(new Error("killed"), { timedOut: true });
  assert.equal(classifyNpmError(err), "TIMEOUT");
});

test("classifyNpmError: unknown → UNKNOWN", () => {
  assert.equal(classifyNpmError(new Error("something")), "UNKNOWN");
});
