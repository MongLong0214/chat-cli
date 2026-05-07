import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const setHome = (dir) => {
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
};

const freshHome = () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-cli-lock-"));
  setHome(dir);
  return dir;
};

const importLock = async () => {
  const url = new URL(`../lib/lock.js?cb=${Math.random()}`, import.meta.url);
  return await import(url.href);
};

test("tokenLockPath: 결정성", async () => {
  freshHome();
  const { tokenLockPath } = await importLock();
  const a = tokenLockPath("room-A");
  const b = tokenLockPath("room-A");
  assert.equal(a, b);
});

test("tokenLockPath: 다른 token → 다른 경로", async () => {
  freshHome();
  const { tokenLockPath } = await importLock();
  assert.notEqual(tokenLockPath("a"), tokenLockPath("b"));
});

test("tokenLockPath: 16자 hex .lock 형식", async () => {
  freshHome();
  const { tokenLockPath } = await importLock();
  const p = tokenLockPath("foo");
  assert.match(p, /\/locks\/[0-9a-f]{16}\.lock$/);
});

test("isProcessAlive: 음수/0/non-int → false", async () => {
  const { isProcessAlive } = await importLock();
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(1.5), false);
  assert.equal(isProcessAlive("123"), false);
  assert.equal(isProcessAlive(null), false);
});

test("isProcessAlive: 자기 자신 → true", async () => {
  const { isProcessAlive } = await importLock();
  assert.equal(isProcessAlive(process.pid), true);
});

test("isProcessAlive: 존재하지 않는 PID → false", async () => {
  const { isProcessAlive } = await importLock();
  assert.equal(isProcessAlive(2147483646), false);
});

test("acquireLock: 빈 상태 → acquired:true + 파일 생성", async () => {
  const home = freshHome();
  const { acquireLock, tokenLockPath } = await importLock();
  const result = acquireLock("room-1", { log: () => {} });
  assert.equal(result.acquired, true);
  assert.ok(existsSync(tokenLockPath("room-1")));
  rmSync(home, { recursive: true, force: true });
});

test("acquireLock: 이미 살아있는 다른 PID → acquired:false", async () => {
  const home = freshHome();
  const otherAlivePid = process.ppid;
  assert.notEqual(otherAlivePid, process.pid);
  const { acquireLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("busy-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid: otherAlivePid, t: Date.now() }));
  const result = acquireLock("busy-room", { log: () => {} });
  assert.equal(result.acquired, false);
  assert.equal(result.pid, otherAlivePid);
  rmSync(home, { recursive: true, force: true });
});

test("acquireLock: stale lockfile (1h+ 오래됨) → 덮어쓰기 + acquired:true", async () => {
  const home = freshHome();
  const { acquireLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("stale-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, JSON.stringify({
    pid: process.pid,
    t: Date.now() - (60 * 60 * 1000 + 1),
  }));
  const result = acquireLock("stale-room", { log: () => {} });
  assert.equal(result.acquired, true);
  rmSync(home, { recursive: true, force: true });
});

test("acquireLock: 죽은 PID → 덮어쓰기", async () => {
  const home = freshHome();
  const { acquireLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("dead-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid: 2147483646, t: Date.now() }));
  const result = acquireLock("dead-room", { log: () => {} });
  assert.equal(result.acquired, true);
  rmSync(home, { recursive: true, force: true });
});

test("acquireLock: 손상된 JSON → 덮어쓰기", async () => {
  const home = freshHome();
  const { acquireLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("corrupt-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, "{not-valid-json");
  const result = acquireLock("corrupt-room", { log: () => {} });
  assert.equal(result.acquired, true);
  rmSync(home, { recursive: true, force: true });
});

test("acquireLock: --force-unlock 시 살아있는 PID 무시", async () => {
  const home = freshHome();
  const { acquireLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("force-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid: process.pid, t: Date.now() }));
  const result = acquireLock("force-room", { force: true, log: () => {} });
  assert.equal(result.acquired, true);
  rmSync(home, { recursive: true, force: true });
});

test("releaseLock: 자기 PID lockfile만 삭제", async () => {
  const home = freshHome();
  const { acquireLock, releaseLock, tokenLockPath } = await importLock();
  acquireLock("my-room", { log: () => {} });
  const path = tokenLockPath("my-room");
  assert.ok(existsSync(path));
  const ok = releaseLock("my-room");
  assert.equal(ok, true);
  assert.equal(existsSync(path), false);
  rmSync(home, { recursive: true, force: true });
});

test("releaseLock: 다른 PID lockfile 보호 (삭제 안 함)", async () => {
  const home = freshHome();
  const { releaseLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("other-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid: 2147483646, t: Date.now() }));
  const ok = releaseLock("other-room");
  assert.equal(ok, false);
  assert.ok(existsSync(path));
  rmSync(home, { recursive: true, force: true });
});

test("releaseLock: 파일 없음 → false (no-op)", async () => {
  freshHome();
  const { releaseLock } = await importLock();
  assert.equal(releaseLock("nonexistent"), false);
});

test("acquireLock: 같은 PID로 잠긴 lockfile은 같은 프로세스가 다시 획득 가능 (재진입)", async () => {
  const home = freshHome();
  const { acquireLock, tokenLockPath } = await importLock();
  const path = tokenLockPath("reentrant-room");
  mkdirSync(join(home, ".chat-cli", "locks"), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid: process.pid, t: Date.now() }));
  const result = acquireLock("reentrant-room", { log: () => {} });
  assert.equal(result.acquired, true);
  const written = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(written.pid, process.pid);
  rmSync(home, { recursive: true, force: true });
});
