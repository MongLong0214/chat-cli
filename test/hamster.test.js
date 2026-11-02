import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHamsterScene, playHamster } from "../lib/hamster.js";

test("frame: rows만큼 커서 이동 + 각 행 cols개 셀", () => {
  const scene = createHamsterScene();
  scene.step(1 / 24);
  const out = scene.frame(80, 24);
  const rows = out.split(/\x1b\[\d+;1H/).slice(1);
  assert.equal(rows.length, 24);
  for (const row of rows) {
    const visible = row.replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal([...visible].length, 80);
  }
});

test("renderPixels: 중앙에 햄스터 털색(주황 계열) 픽셀 존재", () => {
  const scene = createHamsterScene();
  scene.step(2);
  const { buf } = scene.renderPixels(100, 80);
  let orange = 0;
  for (let i = 0; i < buf.length; i += 3) {
    if (buf[i] > 180 && buf[i + 1] > 90 && buf[i + 1] < 190 && buf[i + 2] < 120) orange++;
  }
  assert.ok(orange > 300, `orange pixels: ${orange}`);
});

test("playHamster: 기존 keypress 리스너 떼었다가 q 입력 시 원복 + 대체 화면 해제", async () => {
  const input = new EventEmitter();
  const writes = [];
  const output = { columns: 60, rows: 20, write: (s) => writes.push(s) };
  const original = () => {};
  input.on("keypress", original);

  const done = playHamster({ input, output });
  assert.deepEqual(input.listeners("keypress").includes(original), false);
  input.emit("keypress", "q", { name: "q" });
  await done;

  assert.deepEqual(input.listeners("keypress"), [original]);
  assert.ok(writes[0].includes("\x1b[?1049h"));
  assert.ok(writes.at(-1).includes("\x1b[?1049l"));
});
