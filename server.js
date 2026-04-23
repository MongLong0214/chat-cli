import { WebSocketServer } from "ws";
import { createServer } from "http";
import { parse } from "url";

const port = process.env.PORT || 8080;
const MAX_PAYLOAD = 64 * 1024;
const HEARTBEAT_MS = 30_000;
const rooms = new Map();

const log = (...args) => console.log(new Date().toISOString(), ...args);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_PAYLOAD,
});

wss.on("connection", (ws, req) => {
  const { query } = parse(req.url, true);
  const { token, pk, name } = query;
  if (typeof token !== "string" || !token || token.length > 128) {
    return ws.close(1008, "bad token");
  }
  if (typeof pk !== "string" || !pk || pk.length > 128) {
    return ws.close(1008, "bad pk");
  }
  const safeName = typeof name === "string" ? name.slice(0, 40) : "";

  const peers = rooms.get(token) || [];
  if (peers.length >= 2) return ws.close(1008, "room full");

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("error", (err) => log("ws error", token.slice(0, 4), err.message));

  peers.push({ ws, pk, name: safeName });
  rooms.set(token, peers);
  log(`join room=${token.slice(0, 4)}.. peers=${peers.length}`);

  if (peers.length === 2) {
    for (let i = 0; i < 2; i++) {
      try {
        peers[i].ws.send(
          JSON.stringify({
            type: "peer",
            pk: peers[1 - i].pk,
            name: peers[1 - i].name,
          })
        );
      } catch (err) {
        log("peer send failed", err.message);
      }
    }
  }

  ws.on("message", (data) => {
    const others = (rooms.get(token) || []).filter((p) => p.ws !== ws);
    for (const p of others) {
      try {
        p.ws.send(data, { binary: false });
      } catch (err) {
        log("relay send failed", err.message);
      }
    }
  });

  ws.on("close", () => {
    const remaining = (rooms.get(token) || []).filter((p) => p.ws !== ws);
    if (remaining.length === 0) {
      rooms.delete(token);
    } else {
      rooms.set(token, remaining);
      for (const p of remaining) {
        try {
          p.ws.send(JSON.stringify({ type: "bye" }));
        } catch {}
      }
    }
    log(`leave room=${token.slice(0, 4)}.. remaining=${remaining.length}`);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch {}
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeat));

const shutdown = (signal) => {
  log(`shutdown signal=${signal}`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) {
    try {
      ws.close(1001, "server shutting down");
    } catch {}
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

httpServer.listen(port, () => log(`relay listening on :${port}`));
