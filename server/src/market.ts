import type { DatabaseSync as DB } from "node:sqlite";
import type { ItemStack } from "../../shared/items";
import { BoardData, Claim, Listing, LISTING_MS, Order, StallItem } from "../../shared/market";
import { connection, transaction } from "./db";

/**
 * The market tables. Every function that changes something takes the database
 * from an open transaction, so coins and items always move together with the
 * character row of the player who acted (see WorldRoom.trade).
 */

const newId = () => globalThis.crypto.randomUUID();

/** Thrown inside a transaction to cancel it; the text is shown to the player. */
export class TradeError extends Error {}

interface ListingRow {
  id: string;
  account_id: number;
  seller: string;
  item: string;
  qty: number;
  price: number;
  expires: number;
}
interface OrderRow {
  id: string;
  account_id: number;
  buyer: string;
  item_id: string;
  qty: number;
  price: number;
  expires: number;
}

const toListing = (r: ListingRow): Listing => ({
  id: r.id,
  seller: r.seller,
  item: { ...(JSON.parse(r.item) as ItemStack), qty: r.qty },
  price: r.price,
  expires: r.expires,
});
const toOrder = (r: OrderRow): Order => ({ id: r.id, buyer: r.buyer, item: r.item_id, qty: r.qty, price: r.price, expires: r.expires });

// ---- things waiting to be picked up -------------------------------------------

export function addClaim(d: DB, accountId: number, gold: number, item: ItemStack | null, note: string) {
  d.prepare("INSERT INTO claims (id, account_id, gold, item, note) VALUES (?, ?, ?, ?, ?)").run(
    newId(),
    accountId,
    gold,
    item ? JSON.stringify(item) : null,
    note,
  );
}

const toClaim = (r: { id: string; gold: number; item: string | null; note: string }): Claim => ({
  id: r.id,
  gold: r.gold,
  item: r.item ? (JSON.parse(r.item) as ItemStack) : null,
  note: r.note,
});

export function claimsOf(accountId: number): Claim[] {
  return (connection().prepare("SELECT * FROM claims WHERE account_id = ? ORDER BY created").all(accountId) as any[]).map(toClaim);
}

/** Takes one claim away for good (it must belong to this account). */
export function takeClaim(d: DB, accountId: number, id: string): Claim {
  const r = d.prepare("SELECT * FROM claims WHERE id = ? AND account_id = ?").get(id, accountId) as any;
  if (!r) throw new TradeError("ไม่พบของที่รอรับ");
  d.prepare("DELETE FROM claims WHERE id = ?").run(id);
  return toClaim(r);
}

/** Takes all waiting coins; claims that also hold an item stay for later. */
export function takeGold(d: DB, accountId: number): number {
  const r = d.prepare("SELECT COALESCE(SUM(gold), 0) AS g FROM claims WHERE account_id = ? AND item IS NULL").get(accountId) as { g: number };
  if (r.g > 0) d.prepare("DELETE FROM claims WHERE account_id = ? AND item IS NULL").run(accountId);
  return r.g;
}

export function hasGold(accountId: number): boolean {
  return !!connection().prepare("SELECT 1 FROM claims WHERE account_id = ? AND item IS NULL LIMIT 1").get(accountId);
}

// ---- the board ------------------------------------------------------------------

/** Old offers and orders go back to their owners' claims. */
export function expireOld(now = Date.now()) {
  transaction((d) => {
    for (const r of d.prepare("SELECT * FROM listings WHERE expires <= ?").all(now) as unknown as ListingRow[]) {
      d.prepare("DELETE FROM listings WHERE id = ?").run(r.id);
      addClaim(d, r.account_id, 0, toListing(r).item, "ประกาศขายหมดเวลา");
    }
    for (const r of d.prepare("SELECT * FROM orders WHERE expires <= ?").all(now) as unknown as OrderRow[]) {
      d.prepare("DELETE FROM orders WHERE id = ?").run(r.id);
      addClaim(d, r.account_id, r.qty * r.price, null, "รับซื้อหมดเวลา คืนเงิน");
    }
  });
}

export function boardData(accountId: number): BoardData {
  const d = connection();
  const listings = d.prepare("SELECT * FROM listings WHERE account_id <> ? ORDER BY price LIMIT 300").all(accountId) as unknown as ListingRow[];
  const orders = d.prepare("SELECT * FROM orders WHERE account_id <> ? ORDER BY price DESC LIMIT 300").all(accountId) as unknown as OrderRow[];
  const myL = d.prepare("SELECT * FROM listings WHERE account_id = ? ORDER BY created").all(accountId) as unknown as ListingRow[];
  const myO = d.prepare("SELECT * FROM orders WHERE account_id = ? ORDER BY created").all(accountId) as unknown as OrderRow[];
  return {
    listings: listings.map(toListing),
    orders: orders.map(toOrder),
    mine: { listings: myL.map(toListing), orders: myO.map(toOrder), claims: claimsOf(accountId) },
  };
}

export function countOf(table: "listings" | "orders", accountId: number): number {
  return (connection().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`).get(accountId) as { n: number }).n;
}

export function addListing(d: DB, accountId: number, seller: string, item: ItemStack, price: number) {
  d.prepare("INSERT INTO listings (id, account_id, seller, item, qty, price, expires) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    newId(),
    accountId,
    seller,
    JSON.stringify(item),
    item.qty,
    price,
    Date.now() + LISTING_MS,
  );
}

export function getListing(id: string): (Listing & { accountId: number }) | null {
  const r = connection().prepare("SELECT * FROM listings WHERE id = ? AND expires > ?").get(id, Date.now()) as unknown as ListingRow | undefined;
  return r ? { ...toListing(r), accountId: r.account_id } : null;
}

/** Takes pieces off a sell offer; fails when somebody was faster. */
export function takeListing(d: DB, id: string, qty: number) {
  const n = d.prepare("UPDATE listings SET qty = qty - ? WHERE id = ? AND qty >= ?").run(qty, id, qty).changes;
  if (!n) throw new TradeError("มีคนซื้อไปก่อนแล้ว");
  d.prepare("DELETE FROM listings WHERE id = ? AND qty <= 0").run(id);
}

export function addOrder(d: DB, accountId: number, buyer: string, itemId: string, qty: number, price: number) {
  d.prepare("INSERT INTO orders (id, account_id, buyer, item_id, qty, price, expires) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    newId(),
    accountId,
    buyer,
    itemId,
    qty,
    price,
    Date.now() + LISTING_MS,
  );
}

export function getOrder(id: string): (Order & { accountId: number }) | null {
  const r = connection().prepare("SELECT * FROM orders WHERE id = ? AND expires > ?").get(id, Date.now()) as unknown as OrderRow | undefined;
  return r ? { ...toOrder(r), accountId: r.account_id } : null;
}

export function takeOrder(d: DB, id: string, qty: number) {
  const n = d.prepare("UPDATE orders SET qty = qty - ? WHERE id = ? AND qty >= ?").run(qty, id, qty).changes;
  if (!n) throw new TradeError("ผู้ซื้อได้ของครบแล้ว");
  d.prepare("DELETE FROM orders WHERE id = ? AND qty <= 0").run(id);
}

// ---- stalls -----------------------------------------------------------------------

export interface StallRow {
  id: string;
  account_id: number;
  owner: string;
  color: number;
  weapon: string;
  helm: string;
  title: string;
  x: number;
  y: number;
  items: StallItem[];
  expires: number;
}

export function loadStalls(): StallRow[] {
  return (connection().prepare("SELECT * FROM stalls").all() as any[]).map((r) => ({ ...r, items: JSON.parse(r.items) }));
}

export function putStall(d: DB, s: StallRow) {
  d.prepare(
    `INSERT OR REPLACE INTO stalls (id, account_id, owner, color, weapon, helm, title, x, y, items, expires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(s.id, s.account_id, s.owner, s.color, s.weapon, s.helm, s.title, s.x, s.y, JSON.stringify(s.items), s.expires);
}

export function removeStall(d: DB, id: string) {
  d.prepare("DELETE FROM stalls WHERE id = ?").run(id);
}
