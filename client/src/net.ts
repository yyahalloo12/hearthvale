import { Client } from "colyseus.js";

/** Same host as the page; the dev page (port 5173) talks to the dev server on 2567. */
export function serverUrl() {
  const { protocol, hostname, port, host } = window.location;
  const ws = protocol === "https:" ? "wss" : "ws";
  if (port === "5173") return `${ws}://${hostname}:2567`;
  return `${ws}://${host}`;
}

export const client = new Client(serverUrl());
