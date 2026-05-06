import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";

export const REQUIRED_DEPS = {
  pngjs: "^7.0.0",
  "jpeg-js": "^0.4.4",
};
export const NPM_INSTALL_TIMEOUT_MS = 90_000;

export const mergeDeps = (local, required) => {
  const out = { ...local };
  for (const [name, version] of Object.entries(required)) {
    if (!(name in out)) out[name] = version;
  }
  return out;
};

export const classifyNpmError = (err) => {
  if (err.code === "ENOENT") return "NPM_NOT_FOUND";
  if (err.code === "EACCES" || err.code === "EPERM") return "PERMISSION";
  if (err.timedOut) return "TIMEOUT";
  return "UNKNOWN";
};

const NPM_NOT_FOUND_MSG = `\x1b[31m❌ npm을 찾을 수 없음\x1b[0m

Node.js가 설치되어 있지 않거나 PATH에 등록되지 않았습니다.

[Windows]
1. https://nodejs.org/ko/download 접속
2. "Windows Installer (.msi)" 64-bit 다운로드 (LTS 권장)
3. 설치 시 "Add to PATH" 옵션 체크 (기본값)
4. PowerShell 완전히 닫고 새로 열기
5. \x1b[36mnode -v && npm -v\x1b[0m 입력해 버전 확인
6. 다시 chat.js 실행

[macOS]
방법 A — Homebrew (권장):
  \x1b[36mbrew install node\x1b[0m
방법 B — 공식 인스톨러:
  https://nodejs.org/ko/download → "macOS Installer (.pkg)"

[Linux]
  \x1b[36msudo apt install nodejs npm\x1b[0m       (Ubuntu/Debian)
  \x1b[36msudo dnf install nodejs npm\x1b[0m       (Fedora)
  \x1b[36msudo pacman -S nodejs npm\x1b[0m         (Arch)

설치 후 안 되면: \x1b[36mwhich npm\x1b[0m (mac/linux) / \x1b[36mwhere npm\x1b[0m (windows) 로 PATH 확인.`;

const PERMISSION_MSG = (dir) => `\x1b[31m❌ 권한 부족 — npm install 실패\x1b[0m

[Mac/Linux]
  \x1b[36msudo chown -R $(whoami) ${dir}\x1b[0m

[Windows]
  폴더 우클릭 → 속성 → 보안 → 사용자 권한 확인`;

const NETWORK_OR_TIMEOUT_MSG = (dir) => `\x1b[31m❌ npm install 실패 — 네트워크 또는 타임아웃\x1b[0m

[수동 실행]
  \x1b[36mcd ${dir}\x1b[0m
  \x1b[36mnpm install\x1b[0m`;

const getScriptDir = () => {
  const entry = process.argv[1];
  if (entry) {
    try {
      return dirname(realpathSync(entry));
    } catch {}
  }
  return process.cwd();
};

const ensurePackageJson = async (dir, fetchPackageJson) => {
  const path = join(dir, "package.json");
  let pkg;
  if (existsSync(path)) {
    try {
      pkg = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      pkg = {};
    }
  } else {
    pkg = fetchPackageJson ? await fetchPackageJson() : { name: "chat-cli", version: "1.4.0", type: "module" };
  }
  pkg.dependencies = mergeDeps(pkg.dependencies || {}, REQUIRED_DEPS);
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  return pkg;
};

const runNpmInstall = (cwd) =>
  new Promise((resolve, reject) => {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const proc = spawn(npmCmd, ["install", "--no-audit", "--no-fund"], {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    const timer = setTimeout(() => {
      proc.kill();
      const err = new Error("npm install timeout");
      err.timedOut = true;
      reject(err);
    }, NPM_INSTALL_TIMEOUT_MS);
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
  });

const tryResolveAll = (req) => {
  for (const name of Object.keys(REQUIRED_DEPS)) {
    try {
      req.resolve(name);
    } catch {
      return false;
    }
  }
  return true;
};

export const ensureDependencies = async ({ fetchPackageJson, log = console.log } = {}) => {
  const req = createRequire(import.meta.url);
  if (tryResolveAll(req)) return { installed: false };

  const dir = getScriptDir();
  log("\x1b[33m의존성 자동 설치 중... (pngjs, jpeg-js)\x1b[0m");
  await ensurePackageJson(dir, fetchPackageJson);

  try {
    await runNpmInstall(dir);
  } catch (err) {
    const kind = classifyNpmError(err);
    if (kind === "NPM_NOT_FOUND") {
      log(NPM_NOT_FOUND_MSG);
    } else if (kind === "PERMISSION") {
      log(PERMISSION_MSG(dir));
    } else {
      log(NETWORK_OR_TIMEOUT_MSG(dir));
      log(`\x1b[90m원인: ${err.message}\x1b[0m`);
    }
    throw err;
  }

  if (!tryResolveAll(req)) {
    throw new Error("npm install 후에도 의존성 resolve 실패");
  }
  log("\x1b[32m✓ 의존성 설치 완료\x1b[0m");
  return { installed: true };
};
