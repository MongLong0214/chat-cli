import WebSocket from "ws";
import readline from "readline";
import crypto from "crypto";

const SERVER = process.env.CHAT_SERVER || "wss://YOUR-APP.fly.dev";
const arg = process.argv[2];

let token, host;
if (arg) {
  const i = arg.lastIndexOf("#");
  host = arg.slice(0, i);
  token = arg.slice(i + 1);
} else {
  token = crypto.randomBytes(12).toString("hex");
  host = SERVER;
  console.log(`\n초대링크 (상대에게 전달):\n${host}#${token}\n\n대기중...`);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
const myPk = publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64url");

const ws = new WebSocket(`${host}/?token=${token}&pk=${myPk}`);
let sharedKey = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);
  if (msg.type === "peer") {
    const peerPub = crypto.createPublicKey({
      key: Buffer.from(msg.pk, "base64url"),
      format: "der",
      type: "spki",
    });
    const secret = crypto.diffieHellman({ privateKey, publicKey: peerPub });
    sharedKey = crypto.createHash("sha256").update(secret).digest();
    console.log("✓ 연결됨. 메시지 입력:\n");
    rl.prompt();
  } else if (msg.type === "bye") {
    console.log("\n상대가 나갔습니다.");
    process.exit(0);
  } else if (msg.type === "msg" && sharedKey) {
    const iv = Buffer.from(msg.iv, "base64url");
    const full = Buffer.from(msg.ct, "base64url");
    const enc = full.subarray(0, full.length - 16);
    const tag = full.subarray(full.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", sharedKey, iv);
    d.setAuthTag(tag);
    const pt = Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    process.stdout.write(`\r[상대] ${pt}\n`);
    rl.prompt();
  }
});

ws.on("close", () => {
  console.log("연결 종료");
  process.exit(0);
});

ws.on("error", (e) => {
  console.error("에러:", e.message);
  process.exit(1);
});

rl.on("line", (line) => {
  if (!sharedKey || !line.trim()) return rl.prompt();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", sharedKey, iv);
  const enc = Buffer.concat([c.update(line, "utf8"), c.final()]);
  const ct = Buffer.concat([enc, c.getAuthTag()]);
  ws.send(
    JSON.stringify({
      type: "msg",
      iv: iv.toString("base64url"),
      ct: ct.toString("base64url"),
    })
  );
  rl.prompt();
});

rl.on("close", () => {
  ws.close();
  process.exit(0);
});
