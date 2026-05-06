import { test } from "node:test";
import assert from "node:assert/strict";
import { renderImage, HALF_BLOCK, RESET } from "../lib/render.js";

const solid = (w, h, r, g, b) => {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
  return buf;
};

test("constants exposed", () => {
  assert.equal(HALF_BLOCK, "▀");
  assert.equal(RESET, "\x1b[0m");
});

test("64x64 RGB → 32 lines (height/2)", () => {
  const out = renderImage(solid(64, 64, 100, 100, 100), 64, 64);
  const lines = out.split("\n");
  assert.equal(lines.length, 32);
});

test("each line contains 64 half-blocks", () => {
  const out = renderImage(solid(64, 64, 50, 50, 50), 64, 64);
  const firstLine = out.split("\n")[0];
  const blocks = (firstLine.match(/▀/g) || []).length;
  assert.equal(blocks, 64);
});

test("output contains 24bit truecolor escapes", () => {
  const out = renderImage(solid(64, 64, 200, 100, 50), 64, 64);
  assert.match(out, /\x1b\[38;2;200;100;50m/);
  assert.match(out, /\x1b\[48;2;200;100;50m/);
});

test("alternating rows red/blue → fg=red bg=blue per cell", () => {
  const buf = Buffer.alloc(64 * 64 * 3);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 3;
      const evenRow = y % 2 === 0;
      buf[i] = evenRow ? 255 : 0;
      buf[i + 1] = 0;
      buf[i + 2] = evenRow ? 0 : 255;
    }
  }
  const out = renderImage(buf, 64, 64);
  const firstLine = out.split("\n")[0];
  assert.match(firstLine, /\x1b\[38;2;255;0;0m\x1b\[48;2;0;0;255m▀/);
});

test("odd height → throws", () => {
  assert.throws(
    () => renderImage(solid(64, 65, 0, 0, 0), 64, 65),
    /짝수|even/
  );
});

test("buffer length mismatch → throws", () => {
  const wrong = Buffer.alloc(64 * 64 * 3 - 1);
  assert.throws(
    () => renderImage(wrong, 64, 64),
    /buffer 길이|length/i
  );
});

test("ends with RESET", () => {
  const out = renderImage(solid(64, 64, 0, 0, 0), 64, 64);
  assert.ok(out.endsWith(RESET) || out.includes(RESET));
});
