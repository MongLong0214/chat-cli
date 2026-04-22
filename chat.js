import WebSocket from "ws";
import readline from "readline";
import crypto from "crypto";
import { homedir } from "os";
import { join } from "path";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "fs";

const SERVER = process.env.CHAT_SERVER || "wss://chat-cli-7woy.onrender.com";
const MAX_LINE = 4096;
const MAX_PAYLOAD = 64 * 1024;
const MAX_NAME = 20;
const KEEPALIVE_MS = 10 * 60 * 1000;
const WS_PING_MS = 30 * 1000;

const USE_COLOR = !process.env.NO_COLOR && process.stdout.isTTY;
const C = USE_COLOR
  ? {
      reset: "\x1b[0m",
      me: "\x1b[32m",
      peer: "\x1b[36m",
      warn: "\x1b[33m",
      err: "\x1b[31m",
      gray: "\x1b[90m",
      link: "\x1b[4;94m",
    }
  : {
      reset: "",
      me: "",
      peer: "",
      warn: "",
      err: "",
      gray: "",
      link: "",
    };

const CONFIG_DIR = join(homedir(), ".chat-cli");
const NAME_FILE = join(CONFIG_DIR, "name");

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

const saveName = (name) => {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(NAME_FILE, name);
};

const loadName = () => {
  try {
    if (existsSync(NAME_FILE)) {
      return readFileSync(NAME_FILE, "utf8").trim() || null;
    }
  } catch {}
  return null;
};

const askName = () =>
  new Promise((resolve) => {
    const tmp = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    tmp.question("내 이름을 입력하세요: ", (input) => {
      tmp.close();
      const clean = (input || "").trim().slice(0, MAX_NAME) || "나";
      saveName(clean);
      resolve(clean);
    });
  });

const urlRe = /(https?:\/\/[^\s]+)/g;
const highlightUrls = (text) =>
  text.replace(urlRe, `${C.link}$1${C.reset}`);

const arg = process.argv[2];
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

const main = async () => {
  let myName = loadName();
  if (!myName) myName = await askName();

  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const myPkDer = publicKey.export({ type: "spki", format: "der" });
  const myPk = myPkDer.toString("base64url");

  const wsUrl =
    `${host}/?token=${encodeURIComponent(token)}` +
    `&pk=${myPk}` +
    `&name=${encodeURIComponent(myName)}`;
  const ws = new WebSocket(wsUrl, { maxPayload: MAX_PAYLOAD });

  let sharedKey = null;
  let peerName = "상대";
  let peerNameConfirmed = false;
  let bellEnabled = false;

  if (wasGenerated) {
    console.log(
      `\n초대링크 (상대에게 전달):\n${host}#${token}\n\n대기중...`
    );
  } else {
    console.log("연결 중...");
  }

  const makePrompt = () => `${C.me}[${myName}]${C.reset} > `;
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

  const formatMsg = (name, text, color) => {
    const width = process.stdout.columns || 80;
    const time = now();
    const prefix = `[${name}] `;
    const plainLen = cellWidth(prefix) + cellWidth(text);
    const timeLen = time.length;
    const colored = `${color}${prefix}${C.reset}${highlightUrls(text)}`;
    if (plainLen + timeLen + 1 <= width) {
      const pad = width - plainLen - timeLen;
      return `${colored}${" ".repeat(pad)}${C.gray}${time}${C.reset}`;
    }
    return `${colored}  ${C.gray}${time}${C.reset}`;
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
    if (typeof msg.name === "string" && msg.name.trim()) {
      peerName = msg.name.trim().slice(0, 40);
      peerNameConfirmed = true;
    }
    const fp = crypto
      .createHash("sha256")
      .update(sharedKey)
      .digest("base64url")
      .slice(0, 8);
    console.log(`${C.warn}✓ 연결됨: ${peerName}${C.reset}`);
    console.log(
      `${C.gray}세이프티 코드: ${fp}  (상대와 별도 채널로 대조)${C.reset}`
    );
    console.log(`${C.gray}명령어: /help${C.reset}\n`);
    rl.prompt();
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
    if (
      typeof parsed.n === "string" &&
      parsed.n.trim() &&
      parsed.n !== peerName
    ) {
      const oldName = peerName;
      peerName = parsed.n.slice(0, 40);
      if (peerNameConfirmed) {
        above.warn(`${oldName} → ${peerName} (으)로 이름 변경`);
      }
      peerNameConfirmed = true;
    }
    const text = typeof parsed.t === "string" ? parsed.t : "";
    if (!text) return;
    printAbovePrompt(formatMsg(peerName, text, C.peer));
    if (bellEnabled) process.stdout.write("\x07");
  };

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      above.warn("[경고] 서버에서 잘못된 메시지 수신 (무시)");
      return;
    }
    try {
      if (msg.type === "peer") handlePeer(msg);
      else if (msg.type === "bye") {
        console.log(`\n${C.warn}${peerName}가 나갔습니다.${C.reset}`);
        try {
          ws.close(1000);
        } catch {}
      } else if (msg.type === "msg") handleMsg(msg);
    } catch (err) {
      above.err(`[오류] ${err.message}`);
    }
  });

  ws.on("close", (_code, reasonBuf) => {
    const reason = reasonBuf?.toString() || "";
    if (reason === "room full") {
      console.log(
        `${C.warn}방이 가득 찼습니다 (이미 2명). 새 링크 필요.${C.reset}`
      );
    } else if (reason === "bad token" || reason === "bad pk") {
      console.log(`${C.err}연결 거부: ${reason}${C.reset}`);
    } else if (reason === "server shutting down") {
      console.log(`${C.warn}서버 재시작 중. 잠시 후 재시도.${C.reset}`);
    } else if (!sharedKey) {
      console.log(`${C.gray}연결 종료 (핸드셰이크 전)${C.reset}`);
    } else {
      console.log(`${C.gray}연결 종료${C.reset}`);
    }
    process.exit(0);
  });

  ws.on("error", (e) => {
    console.error(`${C.err}에러: ${e.message}${C.reset}`);
    process.exit(1);
  });

  const httpUrl = host.replace(/^ws(s?):/, "http$1:") + "/";
  const keepalive = setInterval(() => {
    fetch(httpUrl).catch(() => {});
  }, KEEPALIVE_MS);
  const wsPing = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping();
      } catch {}
    }
  }, WS_PING_MS);
  ws.on("close", () => {
    clearInterval(keepalive);
    clearInterval(wsPing);
  });

  const sendEncrypted = (payload) => {
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
        `${C.gray}명령어:`,
        "  /help             도움말",
        "  /quit             종료",
        "  /clear            화면 + 스크롤백 비우기",
        "  /name <새이름>    내 이름 변경",
        `  /bell             상대 메시지 알림음 토글 (현재: ${bellEnabled ? "on" : "off"})${C.reset}`,
      ];
      printAbovePrompt(lines.join("\n"));
    },
    quit: () => rl.close(),
    clear: () => {
      process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
      rl.prevRows = 0;
      rl.prompt();
    },
    name: (rest) => {
      const newName = rest.trim().slice(0, MAX_NAME);
      if (!newName) return above.warn("사용법: /name <새이름>");
      myName = newName;
      saveName(newName);
      rl.setPrompt(makePrompt());
      above.warn(
        `이름을 '${newName}'(으)로 변경 (다음 메시지부터 상대에게 반영)`
      );
    },
    bell: () => {
      bellEnabled = !bellEnabled;
      above.warn(`알림음 ${bellEnabled ? "켜짐" : "꺼짐"}`);
    },
  };

  rl.on("line", (line) => {
    if (line.startsWith("/")) {
      const [cmd, ...rest] = line.slice(1).split(" ");
      const fn = Object.hasOwn(commands, cmd) ? commands[cmd] : null;
      if (fn) {
        try {
          fn(rest.join(" "));
        } catch (err) {
          above.err(`[명령 오류] ${err.message}`);
        }
      } else {
        above.warn(`알 수 없는 명령: /${cmd}. /help`);
      }
      return;
    }
    if (!sharedKey) return rl.prompt();
    if (!line.trim()) return rl.prompt();
    const truncated = line.length > MAX_LINE;
    const text = truncated ? line.slice(0, MAX_LINE) : line;
    replaceTypedLine(line, formatMsg(myName, text, C.me));
    try {
      sendEncrypted({ n: myName, t: text });
    } catch (err) {
      above.err(`[오류] 전송 실패: ${err.message}`);
    }
    if (truncated) above.warn(`${MAX_LINE}자로 잘림`);
    rl.prompt();
  });

  rl.on("close", () => {
    try {
      ws.close(1000);
    } catch {}
    process.exit(0);
  });
};

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
