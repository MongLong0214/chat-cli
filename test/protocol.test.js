import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeImagePayload,
  decodeImagePayload,
  IMG_KIND,
  MAX_IMG_PAYLOAD_BYTES,
} from "../lib/protocol.js";

const makeRgb = (size) => {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 7) & 0xff;
  return buf;
};

test("constants exposed", () => {
  assert.equal(IMG_KIND, "img");
  assert.equal(MAX_IMG_PAYLOAD_BYTES, 30 * 1024);
});

test("encodeImagePayload produces correct shape", () => {
  const rgb = makeRgb(12288);
  const p = encodeImagePayload({ id: "abc12345", name: "isaac", rgb, t: 1700000000000, w: 64, h: 64 });
  assert.equal(p.kind, "img");
  assert.equal(p.id, "abc12345");
  assert.equal(p.n, "isaac");
  assert.equal(p.t, 1700000000000);
  assert.equal(p.w, 64);
  assert.equal(p.h, 64);
  assert.equal(typeof p.rgb, "string");
});

test("rgb base64 roundtrip is byte-identical", () => {
  const rgb = makeRgb(12288);
  const encoded = encodeImagePayload({ id: "id", name: "n", rgb, t: 0, w: 64, h: 64 });
  const json = JSON.parse(JSON.stringify(encoded));
  const decoded = decodeImagePayload(json);
  assert.equal(decoded.rgb.length, rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    assert.equal(decoded.rgb[i], rgb[i]);
  }
});

test("decodeImagePayload extracts metadata", () => {
  const rgb = makeRgb(12288);
  const encoded = encodeImagePayload({ id: "deadbeef", name: "짓뚜", rgb, t: 1234, w: 64, h: 64 });
  const decoded = decodeImagePayload(JSON.parse(JSON.stringify(encoded)));
  assert.equal(decoded.id, "deadbeef");
  assert.equal(decoded.w, 64);
  assert.equal(decoded.h, 64);
});

test("decodeImagePayload: invalid kind → throws", () => {
  assert.throws(
    () => decodeImagePayload({ kind: "msg", rgb: "x", w: 64, h: 64 }),
    /kind/
  );
});

test("decodeImagePayload: rgb length mismatch → throws", () => {
  const small = Buffer.alloc(100).toString("base64");
  assert.throws(
    () => decodeImagePayload({ kind: "img", id: "x", rgb: small, w: 64, h: 64 }),
    /길이|length/i
  );
});

test("decodeImagePayload: missing rgb → throws", () => {
  assert.throws(
    () => decodeImagePayload({ kind: "img", id: "x", w: 64, h: 64 }),
    /rgb/
  );
});

test("decodeImagePayload: invalid w/h → throws (only 64x64 allowed)", () => {
  const rgb = makeRgb(12288).toString("base64");
  assert.throws(
    () => decodeImagePayload({ kind: "img", id: "x", rgb, w: 64, h: 65 }),
    /허용되지 않은|크기/
  );
  assert.throws(
    () => decodeImagePayload({ kind: "img", id: "x", rgb, w: 184, h: 64 }),
    /허용되지 않은|크기/
  );
  assert.throws(
    () => decodeImagePayload({ kind: "img", id: "x", rgb, w: 0, h: 0 }),
    /허용되지 않은|크기/
  );
});

test("payload JSON size < 30KB for 64x64", () => {
  const rgb = makeRgb(12288);
  const encoded = encodeImagePayload({ id: "abc", name: "isaac", rgb, t: Date.now(), w: 64, h: 64 });
  const size = Buffer.byteLength(JSON.stringify(encoded), "utf8");
  assert.ok(size < MAX_IMG_PAYLOAD_BYTES, `payload size ${size} exceeds ${MAX_IMG_PAYLOAD_BYTES}`);
});
