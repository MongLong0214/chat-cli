import { test, before } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  decodeAndResize,
  normalizePath,
  SUPPORTED_EXTS,
  MAX_FILE_SIZE,
  TARGET_SIZE,
} from "../lib/image.js";
import { homedir } from "node:os";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);
const fx = (name) => join(fixturesDir, name);

before(() => {
  if (!existsSync(fx("red-64.png"))) {
    const r = spawnSync("node", [join(fixturesDir, "generate.js")], {
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error("fixture 생성 실패");
  }
});

test("constants exposed", () => {
  assert.deepEqual(SUPPORTED_EXTS, [".png", ".jpg", ".jpeg"]);
  assert.equal(MAX_FILE_SIZE, 20 * 1024 * 1024);
  assert.equal(TARGET_SIZE, 64);
});

test("PNG 64x64 → rgb buffer length 12288", async () => {
  const r = await decodeAndResize(fx("red-64.png"));
  assert.equal(r.width, 64);
  assert.equal(r.height, 64);
  assert.equal(r.rgb.length, 64 * 64 * 3);
});

test("PNG solid red — every pixel (255,0,0)", async () => {
  const r = await decodeAndResize(fx("red-64.png"));
  for (let i = 0; i < r.rgb.length; i += 3) {
    assert.equal(r.rgb[i], 255);
    assert.equal(r.rgb[i + 1], 0);
    assert.equal(r.rgb[i + 2], 0);
  }
});

test("JPEG 800x600 downsamples to 64x64", async () => {
  const r = await decodeAndResize(fx("green-800x600.jpg"));
  assert.equal(r.width, 64);
  assert.equal(r.height, 64);
  assert.equal(r.rgb.length, 12288);
  assert.ok(r.rgb[1] > 100, "green channel should be high");
});

test("PNG 32x32 boundary → upsamples to 64x64", async () => {
  const r = await decodeAndResize(fx("blue-32.png"));
  assert.equal(r.width, 64);
  assert.equal(r.height, 64);
  for (let i = 0; i < r.rgb.length; i += 3) {
    assert.equal(r.rgb[i + 2], 255);
  }
});

test("PNG 31x31 → throws (too small)", async () => {
  await assert.rejects(
    () => decodeAndResize(fx("tiny-31.png")),
    /너무 작음|too small/i
  );
});

test("Top-red bottom-blue split → rgb mapping correct", async () => {
  const r = await decodeAndResize(fx("split-top-red-bot-blue.png"));
  const topPx = r.rgb.subarray(0, 3);
  assert.equal(topPx[0], 255);
  assert.equal(topPx[2], 0);
  const botStart = 64 * 60 * 3;
  const botPx = r.rgb.subarray(botStart, botStart + 3);
  assert.equal(botPx[0], 0);
  assert.equal(botPx[2], 255);
});

test("Unsupported extension (.bmp) → throws", async () => {
  await assert.rejects(
    () => decodeAndResize(fx("fake.bmp")),
    /PNG\/JPEG|지원/
  );
});

test("Missing file → throws", async () => {
  await assert.rejects(
    () => decodeAndResize(fx("nonexistent.png")),
    /찾을 수 없|not found|ENOENT/i
  );
});

test("File > 20MB → throws", async () => {
  await assert.rejects(
    () => decodeAndResize(fx("huge-21mb.png")),
    /20MB|크기 초과/
  );
});

test("Corrupted PNG → throws decode error", async () => {
  await assert.rejects(
    () => decodeAndResize(fx("corrupted.png")),
    /디코드 실패|decode/i
  );
});

test("normalizePath strips surrounding double quotes", () => {
  assert.equal(normalizePath('"C:\\foo\\bar.png"'), "C:\\foo\\bar.png");
  assert.equal(normalizePath("'/tmp/x.png'"), "/tmp/x.png");
  assert.equal(normalizePath("plain/path.png"), "plain/path.png");
});

test("normalizePath expands tilde", () => {
  assert.equal(normalizePath("~"), homedir());
  assert.equal(normalizePath("~/Pictures/x.png"), homedir() + "/Pictures/x.png");
});

test("normalizePath trims whitespace + handles empty", () => {
  assert.equal(normalizePath("  /path  "), "/path");
  assert.equal(normalizePath(""), "");
  assert.equal(normalizePath(null), "");
});

test("decodeAndResize accepts quoted Windows-style path", async () => {
  const r = await decodeAndResize(`"${fx("red-64.png")}"`);
  assert.equal(r.width, 64);
});
