import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import crypto from "node:crypto";

const LOCK_DIR = join(homedir(), ".chat-cli", "locks");
const LOCK_STALE_MS = 60 * 60 * 1000;

export const tokenLockPath = (t) => {
  const hash = crypto.createHash("sha256").update(t).digest("hex").slice(0, 16);
  return join(LOCK_DIR, `${hash}.lock`);
};

export const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
};

const isStale = (data) => {
  const t = Number(data?.t);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > LOCK_STALE_MS;
};

export const readLockFile = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const isHeldByOther = (data, force) =>
  !!(data && !force && data.pid !== process.pid && isProcessAlive(data.pid) && !isStale(data));

const reportConflict = (pid, suffix, log) => {
  log(`\x1b[31m이미 같은 방에 chat-cli가 실행 중입니다${suffix}.\x1b[0m`);
  log(`  PID: ${pid}`);
  log("  해당 창에서 /quit 으로 종료 후 다시 실행하세요.");
  log("  (PID가 잘못 잡혔다면: --force-unlock 플래그로 강제 해제)");
};

export const acquireLock = (token, { force = false, log = console.error } = {}) => {
  mkdirSync(LOCK_DIR, { recursive: true });
  const path = tokenLockPath(token);
  const data = readLockFile(path);

  if (isHeldByOther(data, force)) {
    reportConflict(data.pid, "", log);
    return { acquired: false, pid: data.pid };
  }

  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, t: Date.now() }), {
      flag: "wx",
    });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    const recheck = readLockFile(path);
    if (isHeldByOther(recheck, force)) {
      reportConflict(recheck.pid, " (race)", log);
      return { acquired: false, pid: recheck.pid };
    }
    writeFileSync(path, JSON.stringify({ pid: process.pid, t: Date.now() }));
  }
  return { acquired: true };
};

export const releaseLock = (token) => {
  try {
    const path = tokenLockPath(token);
    const data = readLockFile(path);
    if (data && data.pid === process.pid) {
      unlinkSync(path);
      return true;
    }
  } catch {}
  return false;
};
