import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorldRoom } from "./rooms/WorldRoom";

// Node prints "SQLite is an experimental feature" once; it works fine, so hide just that note.
const defaultWarningListeners = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  for (const l of defaultWarningListeners) l(w);
});

const PORT = Number(process.env.PORT ?? 2567);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
// In production (`npm start`) the server also hands out the built game page.
if (existsSync(clientDist)) app.use(express.static(clientDist));

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define("world", WorldRoom);

gameServer.listen(PORT).then(() => {
  console.log(`Tales of Hearthvale server on http://localhost:${PORT}`);
  if (existsSync(clientDist)) console.log(`Open http://localhost:${PORT} to play`);
});
