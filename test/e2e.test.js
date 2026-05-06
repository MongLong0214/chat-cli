import { test, before } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { decodeAndResize } from "../lib/image.js";
import { renderImage } from "../lib/render.js";
import {
  encodeImagePayload,
  decodeImagePayload,
} from "../lib/protocol.js";

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

test("E2E: PNG → encode → JSON → decode → render produces valid ANSI", async () => {
  const decoded = await decodeAndResize(fx("red-64.png"));
  const payload = encodeImagePayload({
    id: "abc12345",
    name: "isaac",
    rgb: decoded.rgb,
    t: 1700000000000,
    w: decoded.width,
    h: decoded.height,
  });
  const wireBytes = JSON.stringify(payload);
  const received = JSON.parse(wireBytes);
  const rebuilt = decodeImagePayload(received);
  const ansi = renderImage(rebuilt.rgb, rebuilt.w, rebuilt.h);
  assert.equal(rebuilt.rgb.length, decoded.rgb.length);
  for (let i = 0; i < decoded.rgb.length; i++) {
    assert.equal(rebuilt.rgb[i], decoded.rgb[i]);
  }
  assert.equal(ansi.split("\n").length, 32);
  assert.match(ansi, /\x1b\[38;2;255;0;0m/);
});

test("E2E: JPEG → encode → decode preserves pixel approximation", async () => {
  const decoded = await decodeAndResize(fx("green-800x600.jpg"));
  const payload = encodeImagePayload({
    id: "x",
    name: "n",
    rgb: decoded.rgb,
    t: 0,
    w: decoded.width,
    h: decoded.height,
  });
  const rebuilt = decodeImagePayload(JSON.parse(JSON.stringify(payload)));
  assert.ok(rebuilt.rgb[1] > 100);
});

test("E2E: WS message size budget — JSON < 30KB", async () => {
  const decoded = await decodeAndResize(fx("red-64.png"));
  const payload = encodeImagePayload({
    id: "deadbeef",
    name: "긴이름테스트짓뚜와이작",
    rgb: decoded.rgb,
    t: Date.now(),
    w: 64,
    h: 64,
  });
  const wire = JSON.stringify(payload);
  const wireBytes = Buffer.byteLength(wire, "utf8");
  assert.ok(wireBytes < 30 * 1024, `wire size ${wireBytes} exceeds 30KB`);
});

test("E2E: split-row image preserves spatial info through pipeline", async () => {
  const decoded = await decodeAndResize(fx("split-top-red-bot-blue.png"));
  const ansi = renderImage(decoded.rgb, 64, 64);
  const lines = ansi.split("\n");
  assert.match(lines[0], /\x1b\[38;2;255;0;0m/);
  assert.match(lines[lines.length - 1], /\x1b\[38;2;0;0;255m/);
});

test("E2E: payload.kind === 'img' regardless of message content", async () => {
  const decoded = await decodeAndResize(fx("red-64.png"));
  const payload = encodeImagePayload({
    id: "x",
    name: "n",
    rgb: decoded.rgb,
    t: 0,
    w: 64,
    h: 64,
  });
  assert.equal(payload.kind, "img");
});

test("E2E: id roundtrip survives encode/JSON/decode for /del compatibility", async () => {
  const decoded = await decodeAndResize(fx("red-64.png"));
  const ids = ["aabbccdd", "11223344", "ff00ff00"];
  for (const id of ids) {
    const p = encodeImagePayload({
      id,
      name: "n",
      rgb: decoded.rgb,
      t: 0,
      w: 64,
      h: 64,
    });
    const back = decodeImagePayload(JSON.parse(JSON.stringify(p)));
    assert.equal(back.id, id);
  }
});
