import readline from "readline";
import crypto from "crypto";
import { spawn } from "child_process";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  realpathSync,
  unlinkSync,
} from "fs";

if (typeof WebSocket === "undefined") {
  console.error(
    `Node.js 22 이상이 필요합니다 (현재: ${process.versions.node}).\n` +
      `최신 LTS: https://nodejs.org`
  );
  process.exit(1);
}

const VERSION = "1.4.7";
const REPO = "MongLong0214/chat-cli";
const REPO_RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const UPDATE_URL_CHAT = `${REPO_RAW}/chat.js`;
const UPDATE_URL_CHANGELOG = `${REPO_RAW}/CHANGELOG.md`;
const UPDATE_URL_PACKAGE = `${REPO_RAW}/package.json`;
const UPDATE_FETCH_TIMEOUT_MS = 5000;
const REQUIRED_LIB_FILES = ["bootstrap.js", "image.js", "render.js", "protocol.js", "lock.js"];

const fetchWithTimeout = async (url, ms = UPDATE_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const ensureLibFiles = async () => {
  const libDir = join(SCRIPT_DIR, "lib");
  mkdirSync(libDir, { recursive: true });
  const missing = REQUIRED_LIB_FILES.filter((f) => !existsSync(join(libDir, f)));
  if (missing.length === 0) return;
  console.log(`\x1b[33mlib/ 파일 자동 다운로드 중... (${missing.join(", ")})\x1b[0m`);
  await Promise.all(
    missing.map(async (f) => {
      const content = await fetchWithTimeout(`${REPO_RAW}/lib/${f}`, 10000);
      writeFileSync(join(libDir, f), content);
    })
  );
  console.log("\x1b[32m✓ lib/ 파일 준비 완료\x1b[0m");
};

try {
  await ensureLibFiles();
} catch (err) {
  console.error(`\x1b[31m❌ lib/ 다운로드 실패: ${err.message}\x1b[0m`);
  console.error(`\x1b[90m수동 해결: ${REPO_RAW}/lib/* 파일을 ${SCRIPT_DIR}/lib/ 에 저장\x1b[0m`);
  process.exit(1);
}

const [bootstrapMod, renderMod, protocolMod] = await Promise.all([
  import("./lib/bootstrap.js"),
  import("./lib/render.js"),
  import("./lib/protocol.js"),
]);
const { ensureDependencies } = bootstrapMod;
const { renderImage } = renderMod;
const { encodeImagePayload, decodeImagePayload, IMG_KIND } = protocolMod;

try {
  await ensureDependencies({
    fetchPackageJson: async () => JSON.parse(await fetchWithTimeout(UPDATE_URL_PACKAGE, 10000)),
    log: (msg) => console.log(msg),
  });
} catch {
  process.exit(1);
}

const { decodeAndResize } = await import("./lib/image.js");

const SERVER = process.env.CHAT_SERVER || "wss://chat-cli-7woy.onrender.com";
const MAX_LINE = 4096;
const MAX_NAME = 20;
const KEEPALIVE_MS = 10 * 60 * 1000;
const WAKEUP_TIMEOUT_MS = 90_000;
const MAX_LOG = 200;
const DEL_LIST_SIZE = 10;

const NOTIFY_TITLE = "Microsoft Outlook";
const NOTIFY_BODY = "새 메일이 도착했습니다";
const NOTIFY_THROTTLE_MS = 60_000;

const USE_COLOR = !process.env.NO_COLOR && process.stdout.isTTY;
const C = USE_COLOR
  ? {
      reset: "\x1b[0m",
      warn: "\x1b[33m",
      err: "\x1b[31m",
      gray: "\x1b[90m",
      link: "\x1b[4;94m",
    }
  : { reset: "", warn: "", err: "", gray: "", link: "" };

const VIVID_HUES = [
  "\x1b[31m",
  "\x1b[38;5;208m",
  "\x1b[33m",
  "\x1b[32m",
  "\x1b[36m",
  "\x1b[34m",
  "\x1b[35m",
];

const PASTEL_HUES = [
  "\x1b[38;5;211m",
  "\x1b[38;5;215m",
  "\x1b[38;5;228m",
  "\x1b[38;5;120m",
  "\x1b[38;5;87m",
  "\x1b[38;5;117m",
  "\x1b[38;5;177m",
];

const COLOR_CHOICES = [
  { key: "red", ko: "빨강", code: "\x1b[31m" },
  { key: "orange", ko: "주황", code: "\x1b[38;5;208m" },
  { key: "yellow", ko: "노랑", code: "\x1b[33m" },
  { key: "green", ko: "초록", code: "\x1b[32m" },
  { key: "blue", ko: "파랑", code: "\x1b[34m" },
  { key: "navy", ko: "남색", code: "\x1b[38;5;27m" },
  { key: "purple", ko: "보라", code: "\x1b[38;5;135m" },
  { key: "white", ko: "흰색", code: "\x1b[97m" },
  { key: "rainbow", ko: "레인보우", hues: VIVID_HUES },
  { key: "pastel", ko: "파스텔", hues: PASTEL_HUES },
];

const getColor = (key) => COLOR_CHOICES.find((c) => c.key === key);

const cycleHues = (text, offset, hues) => {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const idx = (((i + offset) % hues.length) + hues.length) % hues.length;
    out += hues[idx] + chars[i];
  }
  return out + "\x1b[0m";
};

const isAnimatedColor = (key) => !!getColor(key)?.hues;

const applyColor = (key, text, offset = 0) => {
  if (!USE_COLOR) return text;
  const c = getColor(key);
  if (!c) return text;
  if (c.hues) return cycleHues(text, offset, c.hues);
  if (!c.code) return text;
  return `${c.code}${text}\x1b[0m`;
};

const CONFIG_DIR = join(homedir(), ".chat-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const LEGACY_NAME_FILE = join(CONFIG_DIR, "name");
const DEFAULT_CONFIG = {
  name: null,
  myColor: "green",
  peerColor: "yellow",
  notify: false,
};

const isValidColor = (key) => COLOR_CHOICES.some((c) => c.key === key);

const cellWidth = (s) => {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    w += cp > 0x1100 ? 2 : 1;
  }
  return w;
};

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const loadConfig = () => {
  const sanitize = (cfg) => {
    const out = { ...DEFAULT_CONFIG, ...cfg };
    if (typeof out.name !== "string" || !out.name.trim()) out.name = null;
    else out.name = sanitizeDisplay(out.name).trim().slice(0, MAX_NAME) || null;
    if (!isValidColor(out.myColor)) out.myColor = DEFAULT_CONFIG.myColor;
    if (!isValidColor(out.peerColor)) out.peerColor = DEFAULT_CONFIG.peerColor;
    out.notify = !!out.notify;
    return out;
  };
  try {
    if (existsSync(CONFIG_FILE)) {
      return sanitize(JSON.parse(readFileSync(CONFIG_FILE, "utf8")));
    }
    if (existsSync(LEGACY_NAME_FILE)) {
      const name = readFileSync(LEGACY_NAME_FILE, "utf8").trim();
      return sanitize({ name: name || null });
    }
  } catch {}
  return sanitize({});
};

const saveConfig = (config) => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

const askName = () =>
  new Promise((resolve, reject) => {
    let answered = false;
    const tmp = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    tmp.on("close", () => {
      if (!answered) reject(new Error("이름 입력 취소됨"));
    });
    tmp.question("내 이름을 입력하세요: ", (input) => {
      answered = true;
      tmp.close();
      const clean =
        sanitizeDisplay(input || "").trim().slice(0, MAX_NAME) || "나";
      resolve(clean);
    });
  });

const urlRe = /(https?:\/\/[^\s]+)/g;
const highlightUrls = (text) =>
  text.replace(urlRe, `${C.link}$1${C.reset}`);

const sanitizeDisplay = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
};

const setTerminalTitle = (title) => {
  if (process.stdout.isTTY) process.stdout.write(`\x1b]0;${title}\x07`);
};

const trimForNotify = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

const buildNotifyArgs = (title, body) => {
  const oneLine = (s) => s.replace(/[\r\n\t]+/g, " ");
  const t = trimForNotify(oneLine(title), 40);
  const b = trimForNotify(oneLine(body), 200);
  if (process.platform === "darwin") {
    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `display notification "${esc(b)}" with title "${esc(t)}"`;
    return { cmd: "osascript", args: ["-e", script] };
  }
  if (process.platform === "linux") {
    return { cmd: "notify-send", args: ["-a", "chat-cli", t, b] };
  }
  if (process.platform === "win32") {
    const xmlEsc = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    const psEsc = (s) => s.replace(/'/g, "''");
    const ps =
      `$ErrorActionPreference = 'SilentlyContinue';` +
      `$AppId = 'chat-cli';` +
      `$RegPath = 'HKCU:\\SOFTWARE\\Classes\\AppUserModelId\\' + $AppId;` +
      `if (-not (Test-Path $RegPath)) { New-Item -Path $RegPath -Force | Out-Null; };` +
      `Set-ItemProperty -Path $RegPath -Name 'DisplayName' -Value '${NOTIFY_TITLE}' -Force;` +
      `Write-Host 'AppId DisplayName set to ${NOTIFY_TITLE}';` +
      `$shown = $false;` +
      `try {` +
      `  $ErrorActionPreference = 'Stop';` +
      `  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;` +
      `  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null;` +
      `  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument;` +
      `  $xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>${xmlEsc(
        t
      )}</text><text>${xmlEsc(
        b
      )}</text></binding></visual></toast>');` +
      `  $toast = New-Object Windows.UI.Notifications.ToastNotification $xml;` +
      `  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast);` +
      `  Write-Host 'WinRT Toast Show() called';` +
      `  $shown = $true;` +
      `} catch { Write-Host ('WinRT failed: ' + $_.Exception.Message); };` +
      `if (-not $shown) {` +
      `  try {` +
      `    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop;` +
      `    Add-Type -AssemblyName System.Drawing -ErrorAction Stop;` +
      `    $n = New-Object System.Windows.Forms.NotifyIcon;` +
      `    $n.Icon = [System.Drawing.SystemIcons]::Information;` +
      `    $n.BalloonTipTitle = '${psEsc(t)}';` +
      `    $n.BalloonTipText = '${psEsc(b)}';` +
      `    $n.Visible = $true;` +
      `    $n.ShowBalloonTip(5000);` +
      `    Write-Host 'NotifyIcon balloon shown';` +
      `    Start-Sleep -Seconds 1;` +
      `    $n.Dispose();` +
      `  } catch { Write-Host ('NotifyIcon failed: ' + $_.Exception.Message); };` +
      `};` +
      `[System.Media.SystemSounds]::Asterisk.Play();` +
      `Write-Host 'Sound played'`;
    return {
      cmd: "powershell",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        ps,
      ],
    };
  }
  return null;
};

const spawnOSNotification = (title, body) => {
  const built = buildNotifyArgs(title, body);
  if (!built) return;
  try {
    const child = spawn(built.cmd, built.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.on("error", () => {});
    if (child.stdout) child.stdout.on("data", () => {});
    if (child.stderr) child.stderr.on("data", () => {});
    child.unref();
  } catch {}
};

const testNotificationDiag = (title, body) =>
  new Promise((resolve) => {
    const built = buildNotifyArgs(title, body);
    if (!built) {
      resolve("이 OS는 알림 미지원");
      return;
    }
    let out = "";
    let err = "";
    let done = false;
    const finish = (extra) => {
      if (done) return;
      done = true;
      const result = (out + err).trim();
      resolve(extra ? `${extra}\n${result}` : result || "(출력 없음)");
    };
    try {
      const child = spawn(built.cmd, built.args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        finish("(10초 타임아웃)");
      }, 10_000);
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        finish(`spawn 실패: ${e.message} (${built.cmd} 명령어 PATH에 없음?)`);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        finish(`exit=${code}`);
      });
    } catch (e) {
      finish(`예외: ${e.message}`);
    }
  });

const extractVersion = (source) =>
  source.match(/const VERSION = "([^"]+)"/)?.[1] || null;

const isNewerVersion = (remote, current) => {
  const r = remote.split(".").map((n) => parseInt(n, 10) || 0);
  const c = current.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0;
    const cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
};

const parseChangelogSection = (markdown, version) => {
  const escaped = version.replace(/\./g, "\\.");
  const re = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  return markdown.match(re)?.[1]?.trim() || null;
};

const checkForUpdate = async () => {
  const [chatRaw, changelogRaw] = await Promise.allSettled([
    fetchWithTimeout(UPDATE_URL_CHAT),
    fetchWithTimeout(UPDATE_URL_CHANGELOG),
  ]);
  if (chatRaw.status !== "fulfilled") return null;
  const remoteVersion = extractVersion(chatRaw.value);
  if (!remoteVersion || !isNewerVersion(remoteVersion, VERSION)) return null;
  const changelog =
    changelogRaw.status === "fulfilled"
      ? parseChangelogSection(changelogRaw.value, remoteVersion)
      : null;
  return { remoteVersion, changelog };
};

const performUpdate = async () => {
  const source = await fetchWithTimeout(UPDATE_URL_CHAT);
  const remoteVersion = extractVersion(source);
  if (!remoteVersion) throw new Error("원격에서 버전 추출 실패");
  if (remoteVersion === VERSION) return { remoteVersion, same: true };
  if (
    source.length < 1000 ||
    !source.includes("import readline") ||
    !source.includes("const VERSION")
  ) {
    throw new Error("다운로드된 파일이 유효하지 않음 (손상/빈 응답)");
  }
  const [pkgRemote, ...libValues] = await Promise.all([
    fetchWithTimeout(UPDATE_URL_PACKAGE),
    ...REQUIRED_LIB_FILES.map((f) => fetchWithTimeout(`${REPO_RAW}/lib/${f}`)),
  ]);
  if (!pkgRemote.includes('"name"')) {
    throw new Error("package.json 응답이 유효하지 않음");
  }
  REQUIRED_LIB_FILES.forEach((f, i) => {
    if (libValues[i].length < 50) {
      throw new Error(`lib/${f} 응답이 너무 작음 (손상)`);
    }
  });

  const scriptPath = realpathSync(process.argv[1]);
  const scriptDir = dirname(scriptPath);
  const libDir = join(scriptDir, "lib");
  mkdirSync(libDir, { recursive: true });

  const backupPath = `${scriptPath}.bak`;
  try {
    writeFileSync(backupPath, readFileSync(scriptPath));
  } catch {}

  const writes = [
    { final: scriptPath, content: source },
    { final: join(scriptDir, "package.json"), content: pkgRemote },
    ...REQUIRED_LIB_FILES.map((f, i) => ({
      final: join(libDir, f),
      content: libValues[i],
    })),
  ];
  const tmpPaths = writes.map((w) => `${w.final}.new`);
  try {
    writes.forEach((w, i) => writeFileSync(tmpPaths[i], w.content));
    writes.forEach((w, i) => renameSync(tmpPaths[i], w.final));
  } catch (err) {
    for (const t of tmpPaths) {
      try {
        unlinkSync(t);
      } catch {}
    }
    throw new Error(`atomic swap 실패: ${err.message}`);
  }

  let depsInstalled = false;
  try {
    const result = await ensureDependencies({
      fetchPackageJson: async () => JSON.parse(pkgRemote),
      log: (msg) => console.log(msg),
    });
    depsInstalled = result.installed;
  } catch {}
  return { remoteVersion, same: false, backupPath, depsInstalled };
};

const { acquireLock, releaseLock } = await import("./lib/lock.js");

const FORCE_UNLOCK = process.argv.includes("--force-unlock");
const cliArgs = process.argv.slice(2).filter((a) => a !== "--force-unlock");
const arg = cliArgs[0];
const envRoom = process.env.CHAT_ROOM;
let token, host, wasGenerated;
if (!arg && !envRoom) {
  token = crypto.randomBytes(12).toString("hex");
  host = SERVER;
  wasGenerated = true;
} else if (arg && /^wss?:\/\//.test(arg)) {
  const i = arg.lastIndexOf("#");
  if (i < 0) {
    console.error(
      '잘못된 초대링크 형식 (# 없음). 따옴표로 감쌌는지 확인: node chat.js "wss://...#token"'
    );
    process.exit(1);
  }
  host = arg.slice(0, i);
  token = arg.slice(i + 1);
  if (!token) {
    console.error("토큰이 비었습니다.");
    process.exit(1);
  }
  wasGenerated = false;
} else {
  host = SERVER;
  token = arg || envRoom;
  wasGenerated = false;
}
host = host.replace(/\/+$/, "");

{
  const lockResult = acquireLock(token, { force: FORCE_UNLOCK });
  if (!lockResult.acquired) process.exit(1);
}
process.on("exit", () => releaseLock(token));

const main = async () => {
  const config = loadConfig();
  if (!config.name) {
    config.name = await askName();
    saveConfig(config);
  }
  let myName = config.name;
  let rainbowOffset = 0;
  let pendingColorTarget = null;

  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const myPkDer = publicKey.export({ type: "spki", format: "der" });
  const myPk = myPkDer.toString("base64url");

  if (wasGenerated) {
    console.log(
      `\n초대링크 (상대에게 전달):\n${host}#${token}\n\n서버 깨우는 중... (첫 연결 시 30~60초 소요 가능)`
    );
  } else {
    console.log(`서버 깨우는 중... (${host})`);
    console.log("(첫 연결 시 30~60초 소요 가능)");
  }

  const httpUrl = host.replace(/^ws(s?):/, "http$1:") + "/";
  const wakeStart = Date.now();
  const describeError = (err) => {
    const cause = err?.cause?.code || err?.cause?.message;
    return cause ? `${err.message} (${cause})` : err?.message || "timeout";
  };
  let wakeErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fetchWithTimeout(httpUrl, WAKEUP_TIMEOUT_MS);
      wakeErr = null;
      break;
    } catch (err) {
      wakeErr = err;
      if (attempt < 3) {
        console.log(
          `시도 ${attempt}/3 실패 (${describeError(err)}). 2초 후 재시도...`
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  if (!wakeErr) {
    const elapsed = Math.round((Date.now() - wakeStart) / 1000);
    if (elapsed >= 3) console.log(`서버 응답 OK (${elapsed}s)`);
  } else {
    console.log(
      `서버 응답 없음: ${describeError(wakeErr)}. 그래도 WS 연결 시도...`
    );
  }

  const wsUrl =
    `${host}/?token=${encodeURIComponent(token)}` +
    `&pk=${myPk}` +
    `&name=${encodeURIComponent(myName)}`;

  let ws = null;
  let keepalive = null;
  let reconnectAttempt = 0;
  const RECONNECT_BASE_MS = 2000;
  const RECONNECT_MAX_MS = 60000;
  const NO_PEER_MSG = "상대 재접속 대기 중. 메시지를 보낼 수 없습니다.";

  let sharedKey = null;
  let peerName = "상대";
  let peerNameConfirmed = false;

  let peerTyping = false;
  let typingAnimTimer = null;
  let typingRainbowOffset = 0;
  let typingAutoOffTimer = null;
  let myTypingActive = false;
  const TYPING_TEXT = "✨ 흠냐리 흠냥냐~";
  const TYPING_IDLE_OFF_MS = 1500;
  const TYPING_AUTO_OFF_MS = 5000;

  const resetPeerState = () => {
    sharedKey = null;
    peerName = "상대";
    peerNameConfirmed = false;
    stopPeerTypingAnim();
  };

  const startPeerTypingAnim = () => {
    peerTyping = true;
    if (typingAnimTimer) return;
    typingAnimTimer = setInterval(() => {
      typingRainbowOffset = (typingRainbowOffset + 1) % 360;
      rl.setPrompt(makePrompt());
      rl.prompt(true);
    }, 200);
  };

  const stopPeerTypingAnim = () => {
    if (typingAnimTimer) {
      clearInterval(typingAnimTimer);
      typingAnimTimer = null;
    }
    if (typingAutoOffTimer) {
      clearTimeout(typingAutoOffTimer);
      typingAutoOffTimer = null;
    }
    if (!peerTyping) return;
    peerTyping = false;
    rl.setPrompt(makePrompt());
    rl.prompt(true);
  };

  const onPeerTypingOn = () => {
    if (typingAutoOffTimer) clearTimeout(typingAutoOffTimer);
    startPeerTypingAnim();
    typingAutoOffTimer = setTimeout(stopPeerTypingAnim, TYPING_AUTO_OFF_MS);
  };

  const sendTyping = (on) => {
    if (!sharedKey) return;
    if (process.env.TYPING_DEBUG) console.error(`[typing-debug] send on=${on}`);
    try {
      sendEncrypted({ kind: "typing", n: myName, on });
    } catch {}
  };
  let bellEnabled = false;
  let pendingDelSelection = null;
  let unreadCount = 0;
  let lastNotifyTime = 0;
  const messageLog = [];

  const markRead = () => {
    if (unreadCount === 0) return;
    unreadCount = 0;
    setTerminalTitle("");
  };
  const onPeerActivity = () => {
    if (!config.notify) return;
    unreadCount++;
    setTerminalTitle(`${NOTIFY_TITLE} (${unreadCount})`);
    const t = Date.now();
    if (t - lastNotifyTime < NOTIFY_THROTTLE_MS) return;
    lastNotifyTime = t;
    spawnOSNotification(NOTIFY_TITLE, NOTIFY_BODY);
  };
  const clearTitleOnExit = () => {
    if (config.notify) setTerminalTitle("");
  };

  const genMsgId = () => crypto.randomBytes(4).toString("hex");
  const addMessage = (entry) => {
    messageLog.push({ ...entry, deleted: false });
    while (messageLog.length > MAX_LOG) messageLog.shift();
  };
  const redrawScreen = () => {
    const lines = [];
    for (const m of messageLog) {
      if (m.deleted) continue;
      const colorKey =
        m.sender === "me" ? config.myColor : config.peerColor;
      if (m.kind === IMG_KIND && m.rendered) {
        lines.push(formatImageBlock(m.name, m.rendered, colorKey, m.time));
      } else {
        lines.push(
          formatMsg(m.name, m.text, colorKey, rainbowOffset, m.time)
        );
      }
    }
    process.stdout.write(
      "\x1b[2J\x1b[3J\x1b[H" + (lines.length ? lines.join("\n") + "\n" : "")
    );
    rl.prevRows = 0;
    rl.prompt();
  };

  const makePrompt = () => {
    const typingPart = peerTyping
      ? `${cycleHues(TYPING_TEXT, typingRainbowOffset, VIVID_HUES)}  `
      : "";
    return `${typingPart}${applyColor(config.myColor, `[${myName}]`, rainbowOffset)} > `;
  };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: makePrompt(),
  });

  const printAbovePrompt = (line) => {
    const prevRows = rl.prevRows || 0;
    if (prevRows > 0) readline.moveCursor(process.stdout, 0, -prevRows);
    readline.cursorTo(process.stdout, 0);
    readline.clearScreenDown(process.stdout);
    process.stdout.write(line + "\n");
    rl.prevRows = 0;
    rl.prompt(true);
  };
  const above = {
    warn: (msg) => printAbovePrompt(`${C.warn}${msg}${C.reset}`),
    err: (msg) => printAbovePrompt(`${C.err}${msg}${C.reset}`),
    info: (msg) => printAbovePrompt(`${C.gray}${msg}${C.reset}`),
  };

  checkForUpdate()
    .then((update) => {
      if (!update) return;
      const lines = [
        `${C.warn}🔔 새 버전 v${update.remoteVersion} 사용 가능 (현재 v${VERSION})${C.reset}`,
      ];
      if (update.changelog) {
        const body = update.changelog
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n");
        lines.push(`${C.gray}업데이트 내역:\n${body}${C.reset}`);
      }
      lines.push(`${C.gray}업데이트: /update${C.reset}`);
      printAbovePrompt(lines.join("\n"));
    })
    .catch(() => {});

  const formatMsg = (name, text, colorKey, offset = 0, savedTime) => {
    const width = process.stdout.columns || 80;
    const time = savedTime || now();
    const prefix = `[${name}] `;
    const plainLen = cellWidth(prefix) + cellWidth(text);
    const timeLen = time.length;
    const coloredPrefix = applyColor(colorKey, prefix, offset);
    const colored = `${coloredPrefix}${highlightUrls(text)}`;
    if (plainLen + timeLen + 1 <= width) {
      const pad = width - plainLen - timeLen;
      return `${colored}${" ".repeat(pad)}${C.gray}${time}${C.reset}`;
    }
    return `${colored}  ${C.gray}${time}${C.reset}`;
  };

  const formatImageBlock = (name, ansi, colorKey, savedTime) => {
    const time = savedTime || now();
    const header = `${applyColor(colorKey, `[${name}] 🖼`, rainbowOffset)} ${C.gray}${time}${C.reset}`;
    return `${header}\n${ansi}`;
  };

  const replaceTypedLine = (typedLine, newContent) => {
    const width = process.stdout.columns || 80;
    const promptCells = cellWidth(`[${myName}] > `);
    const totalCells = promptCells + cellWidth(typedLine);
    const rows = Math.max(1, Math.ceil(totalCells / width));
    readline.moveCursor(process.stdout, 0, -rows);
    readline.cursorTo(process.stdout, 0);
    readline.clearScreenDown(process.stdout);
    process.stdout.write(newContent + "\n");
  };

  const handlePeer = (msg) => {
    if (typeof msg.pk !== "string") throw new Error("peer 형식 오류");
    const peerPkBuf = Buffer.from(msg.pk, "base64url");
    if (peerPkBuf.length !== myPkDer.length) {
      throw new Error("공개키 길이 비정상");
    }
    if (peerPkBuf.equals(myPkDer)) {
      throw new Error("공개키가 내 것과 동일");
    }
    const peerPub = crypto.createPublicKey({
      key: peerPkBuf,
      format: "der",
      type: "spki",
    });
    const secret = crypto.diffieHellman({ privateKey, publicKey: peerPub });
    if (secret.every((b) => b === 0)) {
      throw new Error("공유 시크릿이 0 (무효 공개키)");
    }
    sharedKey = crypto.createHash("sha256").update(secret).digest();
    if (typeof msg.name === "string") {
      const clean = sanitizeDisplay(msg.name).trim().slice(0, 40);
      if (clean) {
        peerName = clean;
        peerNameConfirmed = true;
      }
    }
    const fp = crypto
      .createHash("sha256")
      .update(sharedKey)
      .digest("base64url")
      .slice(0, 8);
    const info = [
      `${C.warn}✓ 연결됨: ${peerName}${C.reset}`,
      `${C.gray}세이프티 코드: ${fp}  (상대와 별도 채널로 대조)${C.reset}`,
      `${C.gray}명령어: /help${C.reset}`,
    ].join("\n");
    printAbovePrompt(info);
    syncRainbowAnimation();
  };

  const handleMsg = (msg) => {
    if (!sharedKey) return;
    if (typeof msg.iv !== "string" || typeof msg.ct !== "string") return;
    const iv = Buffer.from(msg.iv, "base64url");
    const full = Buffer.from(msg.ct, "base64url");
    if (iv.length !== 12 || full.length < 16) {
      throw new Error("프레임 형식 오류");
    }
    const enc = full.subarray(0, full.length - 16);
    const tag = full.subarray(full.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", sharedKey, iv);
    d.setAuthTag(tag);
    const pt = Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    let parsed;
    try {
      parsed = JSON.parse(pt);
    } catch {
      parsed = { t: pt };
    }
    if (typeof parsed.n === "string") {
      const cleanN = sanitizeDisplay(parsed.n).trim().slice(0, 40);
      if (cleanN && cleanN !== peerName) {
        const oldName = peerName;
        peerName = cleanN;
        if (peerNameConfirmed) {
          above.warn(`${oldName} → ${peerName} (으)로 이름 변경`);
        }
        peerNameConfirmed = true;
      }
    }
    if (parsed.kind === "typing") {
      if (process.env.TYPING_DEBUG) console.error(`[typing-debug] recv on=${!!parsed.on}`);
      if (parsed.on) onPeerTypingOn();
      else stopPeerTypingAnim();
      return;
    }
    if (parsed.kind === "del" && Array.isArray(parsed.ids)) {
      let count = 0;
      for (const id of parsed.ids) {
        if (typeof id !== "string") continue;
        const m = messageLog.find(
          (x) => x.id === id && x.sender === "peer" && !x.deleted
        );
        if (m) {
          m.deleted = true;
          count++;
        }
      }
      if (count > 0) {
        redrawScreen();
        above.warn(`${peerName}이(가) 메시지 ${count}개 삭제`);
      }
      return;
    }
    if (parsed.kind === IMG_KIND) {
      let payload;
      try {
        payload = decodeImagePayload(parsed);
      } catch (err) {
        above.warn(`이미지 수신 실패: ${err.message}`);
        return;
      }
      const ansi = renderImage(payload.rgb, payload.w, payload.h);
      addMessage({
        id: payload.id || genMsgId(),
        sender: "peer",
        name: peerName,
        kind: IMG_KIND,
        rendered: ansi,
        time: now(),
      });
      printAbovePrompt(
        formatImageBlock(peerName, ansi, config.peerColor)
      );
      if (bellEnabled) process.stdout.write("\x07");
      onPeerActivity();
      return;
    }
    const text =
      typeof parsed.t === "string" ? sanitizeDisplay(parsed.t) : "";
    if (!text) return;
    const msgId =
      typeof parsed.id === "string" && parsed.id ? parsed.id : genMsgId();
    addMessage({
      id: msgId,
      sender: "peer",
      name: peerName,
      text,
      time: now(),
    });
    printAbovePrompt(formatMsg(peerName, text, config.peerColor, rainbowOffset));
    if (bellEnabled) process.stdout.write("\x07");
    onPeerActivity();
  };

  const decodeFrame = (raw) => {
    if (typeof raw === "string") return raw;
    if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
    return String(raw);
  };

  const handleMessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(decodeFrame(event.data));
    } catch {
      above.warn("[경고] 서버에서 잘못된 메시지 수신 (무시)");
      return;
    }
    try {
      if (msg.type === "peer") handlePeer(msg);
      else if (msg.type === "bye") {
        above.warn(`${peerName}가 나갔습니다. 재접속 대기 중...`);
        resetPeerState();
      } else if (msg.type === "msg") handleMsg(msg);
    } catch (err) {
      above.err(`[오류] ${err.message}`);
    }
  };

  const handleError = (event) => {
    const err = event?.error;
    const msg = err ? describeError(err) : event?.message || "알 수 없는 오류";
    above.warn(`연결 오류: ${msg}`);
  };

  const scheduleReconnect = (code, reason) => {
    resetPeerState();
    reconnectAttempt++;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt - 1),
      RECONNECT_MAX_MS
    );
    above.warn(
      `연결 끊김 (code=${code || "?"}${reason ? ` reason="${reason}"` : ""}). ` +
        `${Math.round(delay / 1000)}초 후 재연결 시도 (${reconnectAttempt}회)...`
    );
    setTimeout(connectWs, delay);
  };

  const exitWith = (msg, code) => {
    console.log(msg);
    process.exit(code);
  };

  const handleClose = (event) => {
    clearTitleOnExit();
    clearInterval(keepalive);
    keepalive = null;
    const reason = event?.reason || "";
    const code = event?.code;

    if (reason === "bad token" || reason === "bad pk") {
      return exitWith(`${C.err}연결 거부: ${reason}${C.reset}`, 1);
    }
    if (reason === "room full" || (code === 1008 && !sharedKey)) {
      return exitWith(
        `${C.warn}방이 이미 2명으로 가득 찼습니다.${C.reset}\n` +
          `${C.gray}  - 다른 방 이름으로 접속: node chat.js <다른이름>\n` +
          `  - 또는 30초 정도 기다린 후 재시도${C.reset}`,
        1
      );
    }
    scheduleReconnect(code, reason);
  };

  const connectWs = () => {
    clearInterval(keepalive);
    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => {
      if (reconnectAttempt > 0) {
        above.warn(`재연결 성공 (${reconnectAttempt}회 시도 끝)`);
      }
      reconnectAttempt = 0;
    });
    ws.addEventListener("message", handleMessage);
    ws.addEventListener("error", handleError);
    ws.addEventListener("close", handleClose);
    keepalive = setInterval(() => {
      fetchWithTimeout(httpUrl, 15000).catch(() => {});
    }, KEEPALIVE_MS);
  };

  connectWs();

  const sendEncrypted = (payload) => {
    if (!sharedKey) {
      above.warn(NO_PEER_MSG);
      return;
    }
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", sharedKey, iv);
    const enc = Buffer.concat([
      c.update(JSON.stringify(payload), "utf8"),
      c.final(),
    ]);
    const ct = Buffer.concat([enc, c.getAuthTag()]);
    ws.send(
      JSON.stringify({
        type: "msg",
        iv: iv.toString("base64url"),
        ct: ct.toString("base64url"),
      })
    );
  };

  const commands = {
    help: () => {
      const lines = [
        `${C.gray}명령어 (v${VERSION}):`,
        "  /help                     도움말",
        "  /quit                     종료",
        "  /clear                    화면 + 스크롤백 비우기 (히스토리도 비움)",
        "  /del                      내가 보낸 최근 메시지 선택 삭제",
        "  /img <경로>               PNG/JPEG 이미지 64x64 모자이크 미리보기 송신",
        "  /diag                     진단 정보 출력 (디버깅용)",
        "  /name <새이름>            내 이름 변경",
        "  /color <me|peer>          내/상대 메시지 색 변경 (번호 선택)",
        `  /bell                     상대 메시지 알림음 (BEL 문자) 토글 (현재: ${bellEnabled ? "on" : "off"})`,
        `  /notify                   OS 데스크톱 알림 + 탭 제목 카운터 토글 (현재: ${config.notify ? "on" : "off"})`,
        `  /update                   최신 버전으로 자동 업데이트${C.reset}`,
      ];
      printAbovePrompt(lines.join("\n"));
    },
    quit: () => rl.close(),
    clear: () => {
      messageLog.length = 0;
      process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
      rl.prevRows = 0;
      rl.prompt();
    },
    del: () => {
      if (!sharedKey) return above.warn("연결되지 않음");
      const myMessages = messageLog
        .filter((m) => m.sender === "me" && !m.deleted)
        .slice(-DEL_LIST_SIZE);
      if (myMessages.length === 0) {
        return above.warn("삭제할 내 메시지가 없습니다");
      }
      pendingDelSelection = myMessages.map((m) => m.id);
      const lines = [
        `${C.gray}내가 보낸 최근 ${myMessages.length}개:${C.reset}`,
      ];
      myMessages.forEach((m, i) => {
        let preview;
        if (m.kind === IMG_KIND) preview = "🖼 (이미지)";
        else if (m.text.length > 50) preview = m.text.slice(0, 50) + "...";
        else preview = m.text;
        lines.push(
          `  ${i + 1}. ${preview}  ${C.gray}${m.time}${C.reset}`
        );
      });
      lines.push(
        `${C.gray}번호 입력 (예: "1 3 5" / "all" / 0=취소):${C.reset}`
      );
      printAbovePrompt(lines.join("\n"));
    },
    name: (rest) => {
      const newName = sanitizeDisplay(rest).trim().slice(0, MAX_NAME);
      if (!newName) return above.warn("사용법: /name <새이름>");
      myName = newName;
      config.name = newName;
      saveConfig(config);
      rl.setPrompt(makePrompt());
      above.warn(
        `이름을 '${newName}'(으)로 변경 (다음 메시지부터 상대에게 반영)`
      );
    },
    color: (rest) => {
      const target = rest.trim();
      if (target !== "me" && target !== "peer") {
        return above.warn(
          "사용법: /color me  (내 색)  또는  /color peer  (상대 색)"
        );
      }
      pendingColorTarget = target;
      const label = target === "me" ? "내" : "상대";
      const currentKey = target === "me" ? config.myColor : config.peerColor;
      const lines = [`${C.gray}${label} 메시지 색 선택 (현재: ${currentKey}):${C.reset}`];
      COLOR_CHOICES.forEach((c, i) => {
        const preview = c.hues
          ? cycleHues(c.ko, rainbowOffset, c.hues)
          : `${c.code}${c.ko}${C.reset}`;
        const mark = c.key === currentKey ? " ←" : "";
        lines.push(`  ${i + 1}. ${preview}${mark}`);
      });
      lines.push(
        `${C.gray}번호 (1-${COLOR_CHOICES.length}) 또는 0=취소:${C.reset}`
      );
      printAbovePrompt(lines.join("\n"));
    },
    bell: () => {
      bellEnabled = !bellEnabled;
      above.warn(`알림음 ${bellEnabled ? "켜짐" : "꺼짐"}`);
    },
    notify: async () => {
      config.notify = !config.notify;
      saveConfig(config);
      if (!config.notify) {
        markRead();
        above.warn("데스크톱 알림 꺼짐");
        return;
      }
      above.info("알림 테스트 발송 중... (최대 10초)");
      const diag = await testNotificationDiag(NOTIFY_TITLE, NOTIFY_BODY);
      above.warn(
        `데스크톱 알림 켜짐 (Outlook 위장 + 60초 throttle)\n` +
          `${C.gray}--- PowerShell 진단 ---\n${diag}\n--- end ---${C.reset}\n` +
          `${C.gray}팝업 안 보이면: Windows 설정 → 알림 ON, Focus Assist OFF${C.reset}`
      );
    },
    update: async () => {
      above.info("업데이트 확인 중...");
      try {
        const result = await performUpdate();
        if (result.same) {
          above.warn(`이미 최신 버전입니다 (v${VERSION})`);
        } else {
          const depsLine = result.depsInstalled
            ? "의존성 자동 설치 완료\n"
            : "";
          above.warn(
            `v${VERSION} → v${result.remoteVersion} 업데이트 완료.\n` +
              depsLine +
              `백업: ${result.backupPath}\n` +
              `/quit 후 다시 실행하면 새 버전이 적용됩니다.`
          );
        }
      } catch (err) {
        above.err(`업데이트 실패: ${err.message}`);
      }
    },
    img: async (pathArg) => {
      if (!sharedKey) return above.warn("연결되지 않음");
      const path = (pathArg || "").trim();
      if (!path) return above.warn("사용법: /img <이미지 경로>");
      let decoded;
      try {
        decoded = await decodeAndResize(path);
      } catch (err) {
        return above.err(`/img: ${err.message}`);
      }
      const id = genMsgId();
      const t = now();
      const ansi = renderImage(decoded.rgb, decoded.width, decoded.height);
      addMessage({
        id,
        sender: "me",
        name: myName,
        kind: IMG_KIND,
        rendered: ansi,
        time: t,
      });
      printAbovePrompt(formatImageBlock(myName, ansi, config.myColor, t));
      try {
        sendEncrypted(
          encodeImagePayload({
            id,
            name: myName,
            rgb: decoded.rgb,
            t: Date.now(),
            w: decoded.width,
            h: decoded.height,
          })
        );
      } catch (err) {
        above.err(`전송 실패: ${err.message}`);
      }
    },
    diag: () => {
      const scriptPath = (() => {
        try { return realpathSync(process.argv[1] || ""); } catch { return process.argv[1] || "?"; }
      })();
      const dt = lastNotifyTime ? Date.now() - lastNotifyTime : null;
      const throttleActive = dt !== null && dt < NOTIFY_THROTTLE_MS;
      const lines = [
        `${C.gray}--- 진단 (붙여서 보내주세요) ---`,
        `version: ${VERSION}`,
        `pid: ${process.pid}`,
        `script: ${scriptPath}`,
        `node: ${process.versions.node}`,
        `platform: ${process.platform}`,
        `config.notify: ${config.notify ? "on" : "off"}`,
        `bellEnabled: ${bellEnabled}`,
        `unreadCount: ${unreadCount}`,
        `lastNotifyTime: ${lastNotifyTime || "(아직 0)"}`,
        `now - lastNotifyTime: ${dt !== null ? dt + "ms" : "(없음)"}`,
        `NOTIFY_THROTTLE_MS: ${NOTIFY_THROTTLE_MS}`,
        `throttle 적용 중: ${throttleActive}`,
        `peerName: ${peerName}`,
        `peerNameConfirmed: ${peerNameConfirmed}`,
        `tokenHash16: ${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`,
        `------${C.reset}`,
      ];
      printAbovePrompt(lines.join("\n"));
    },
  };

  const handleDelSelection = (line) => {
    const ids = pendingDelSelection;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "0") {
      pendingDelSelection = null;
      above.warn("삭제 취소");
      return;
    }
    let toDelete;
    if (trimmed.toLowerCase() === "all") {
      toDelete = [...ids];
    } else {
      const numbers = trimmed.split(/[\s,]+/).map((s) => parseInt(s, 10));
      if (
        numbers.length === 0 ||
        numbers.some(
          (n) => !Number.isInteger(n) || n < 1 || n > ids.length
        )
      ) {
        above.warn(
          `유효하지 않은 번호. 1-${ids.length} 또는 0=취소. 다시 입력`
        );
        return;
      }
      toDelete = [...new Set(numbers)].map((n) => ids[n - 1]);
    }
    pendingDelSelection = null;
    let count = 0;
    for (const id of toDelete) {
      const m = messageLog.find(
        (x) => x.id === id && x.sender === "me" && !x.deleted
      );
      if (m) {
        m.deleted = true;
        count++;
      }
    }
    if (count === 0) return above.warn("삭제할 메시지 없음");
    try {
      sendEncrypted({ kind: "del", n: myName, ids: toDelete });
    } catch (err) {
      above.err(`상대에게 삭제 알림 실패: ${err.message}`);
    }
    redrawScreen();
    above.warn(`✓ 메시지 ${count}개 삭제됨`);
  };

  const handleColorSelection = (line) => {
    const target = pendingColorTarget;
    const label = target === "me" ? "내" : "상대";
    const trimmed = line.trim();
    if (trimmed === "0" || trimmed === "") {
      pendingColorTarget = null;
      above.warn("색 선택 취소");
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isInteger(n) || n < 1 || n > COLOR_CHOICES.length) {
      above.warn(
        `1-${COLOR_CHOICES.length} 번호만 입력 (0=취소). 다시 입력하세요`
      );
      return;
    }
    const choice = COLOR_CHOICES[n - 1];
    pendingColorTarget = null;
    if (target === "me") config.myColor = choice.key;
    else config.peerColor = choice.key;
    saveConfig(config);
    rl.setPrompt(makePrompt());
    syncRainbowAnimation();
    above.warn(`${label} 색을 ${choice.ko}(으)로 변경`);
  };

  let rainbowInterval = null;
  const syncRainbowAnimation = () => {
    const needed =
      USE_COLOR &&
      (isAnimatedColor(config.myColor) || isAnimatedColor(config.peerColor));
    if (needed && !rainbowInterval) {
      rainbowInterval = setInterval(() => {
        rainbowOffset = (rainbowOffset + 1) % 10000;
        if (
          sharedKey &&
          isAnimatedColor(config.myColor) &&
          rl.line.length === 0
        ) {
          rl.setPrompt(makePrompt());
          rl.prompt(true);
        }
      }, 200);
    } else if (!needed && rainbowInterval) {
      clearInterval(rainbowInterval);
      rainbowInterval = null;
    }
  };

  let typingBuffer = "";
  let typingIdleTimer = null;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on("keypress", (str, key) => {
    if (!str && !(key && key.name)) return;
    if (key && (key.name === "return" || key.name === "enter")) {
      typingBuffer = "";
      if (myTypingActive) {
        myTypingActive = false;
        sendTyping(false);
      }
      if (typingIdleTimer) {
        clearTimeout(typingIdleTimer);
        typingIdleTimer = null;
      }
      return;
    }
    if (key && key.ctrl) return;
    if (key && key.name === "backspace") {
      typingBuffer = typingBuffer.slice(0, -1);
    } else if (str) {
      typingBuffer += str;
    }
    if (typingBuffer.startsWith("/")) return;
    if (typingBuffer.length > 0 && !myTypingActive) {
      myTypingActive = true;
      sendTyping(true);
    } else if (typingBuffer.length === 0 && myTypingActive) {
      myTypingActive = false;
      sendTyping(false);
    }
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = setTimeout(() => {
      typingIdleTimer = null;
      if (myTypingActive) {
        myTypingActive = false;
        sendTyping(false);
      }
    }, TYPING_IDLE_OFF_MS);
  });

  process.on("exit", () => {
    if (rainbowInterval) clearInterval(rainbowInterval);
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    if (typingAnimTimer) clearInterval(typingAnimTimer);
    if (typingAutoOffTimer) clearTimeout(typingAutoOffTimer);
  });

  rl.on("line", (line) => {
    markRead();
    if (myTypingActive) {
      myTypingActive = false;
      sendTyping(false);
    }
    try {
      if (pendingDelSelection) {
        handleDelSelection(line);
        return;
      }
      if (pendingColorTarget) {
        handleColorSelection(line);
        return;
      }
      if (line.startsWith("/")) {
        const [cmd, ...rest] = line.slice(1).split(" ");
        const fn = Object.hasOwn(commands, cmd) ? commands[cmd] : null;
        if (fn) fn(rest.join(" "));
        else above.warn(`알 수 없는 명령: /${cmd}. /help`);
        return;
      }
      if (!sharedKey) {
        above.warn(NO_PEER_MSG);
        return rl.prompt();
      }
      if (!line.trim()) return rl.prompt();
      const truncated = line.length > MAX_LINE;
      const text = truncated ? line.slice(0, MAX_LINE) : line;
      replaceTypedLine(
        line,
        formatMsg(myName, text, config.myColor, rainbowOffset)
      );
      const id = genMsgId();
      addMessage({
        id,
        sender: "me",
        name: myName,
        text,
        time: now(),
      });
      sendEncrypted({ kind: "msg", n: myName, t: text, id });
      if (truncated) above.warn(`${MAX_LINE}자로 잘림`);
      rl.prompt();
    } catch (err) {
      above.err(`[내부 오류] ${err.message}`);
      rl.prompt();
    }
  });

  const gracefulExit = () => {
    clearTitleOnExit();
    releaseLock(token);
    try {
      if (ws) ws.close(1000);
    } catch {}
    process.exit(0);
  };
  rl.on("close", gracefulExit);
  process.on("SIGHUP", gracefulExit);
  process.on("SIGTERM", gracefulExit);
};

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
