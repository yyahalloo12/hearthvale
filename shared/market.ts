/**
 * Player trade (GDD 4.3): stalls anyone can set up in the village, and one
 * auction board with sell offers and buy orders. Shared numbers and shapes.
 */
import type { ItemStack } from "./items";

/** The board keeps this part of every sale; stalls keep nothing. */
export const BOARD_TAX = 0.05;
export const LISTING_MS = 72 * 3600_000;
export const STALL_MS = 12 * 3600_000;
export const MAX_LISTINGS = 20;
export const MAX_ORDERS = 10;
export const STALL_SLOTS = 12;
export const PRICE_MAX = 1_000_000;
export const STALL_TITLE_MAX = 30;
/** How close you must be to a stall to buy from it. */
export const STALL_RANGE = 3;

/** What the seller gets after tax. */
export function afterTax(total: number): number {
  return Math.floor(total * (1 - BOARD_TAX) + 1e-9);
}

/** A whole number in range, or null. Everything from players goes through this. */
export function wholeNumber(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
}

/** A sell offer on the board. `price` is per piece. */
export interface Listing {
  id: string;
  seller: string;
  item: ItemStack;
  price: number;
  expires: number;
}

/** Somebody wants to buy this. The coins are already set aside. */
export interface Order {
  id: string;
  buyer: string;
  item: string;
  qty: number;
  price: number;
  expires: number;
}

/** Something waiting to be picked up at the board. */
export interface Claim {
  id: string;
  gold: number;
  item: ItemStack | null;
  note: string;
}

export interface BoardData {
  listings: Listing[];
  orders: Order[];
  mine: { listings: Listing[]; orders: Order[]; claims: Claim[] };
}

export interface StallItem {
  stack: ItemStack;
  /** per piece */
  price: number;
}

export interface StallData {
  id: string;
  owner: string;
  title: string;
  items: StallItem[];
  mine: boolean;
  expires: number;
}
