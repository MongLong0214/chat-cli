import { WebSocketServer } from "ws";
import { createServer } from "http";
import { parse } from "url";

const port = process.env.PORT || 8080;
const rooms = new Map();

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const { query } = parse(req.url, true);
  const { token, pk } = query;
  if (!token || !pk) return ws.close(1008, "missing token/pk");

  const peers = rooms.get(token) || [];
  if (peers.length >= 2) return ws.close(1008, "room full");

  peers.push({ ws, pk });
  rooms.set(token, peers);

  if (peers.length === 2) {
    peers[0].ws.send(JSON.stringify({ type: "peer", pk: peers[1].pk }));
    peers[1].ws.send(JSON.stringify({ type: "peer", pk: peers[0].pk }));
  }

  ws.on("message", (data) => {
    const others = (rooms.get(token) || []).filter((p) => p.ws !== ws);
    others.forEach((p) => p.ws.send(data));
  });

  ws.on("close", () => {
    const remaining = (rooms.get(token) || []).filter((p) => p.ws !== ws);
    if (remaining.length === 0) rooms.delete(token);
    else {
      rooms.set(token, remaining);
      remaining.forEach((p) => p.ws.send(JSON.stringify({ type: "bye" })));
    }
  });
});

httpServer.listen(port, () => console.log(`relay listening on :${port}`));
