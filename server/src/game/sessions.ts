import { randomBytes } from "node:crypto";

/**
 * Which accounts are in the world, across all rooms (one room per map). An
 * account holds one lock from login to logout, also while it travels between
 * maps, so the same character can never be in two places.
 */
export interface Lock {
  pending: boolean;
}

const locks = new Map<number, Lock>();
const tickets = new Map<string, { accountId: number; zone: string; lock: Lock }>();
const PENDING_MS = 15_000;

/** Takes the lock; null when the account is already in the world. */
export function takeLock(accountId: number): Lock | null {
  if (locks.has(accountId)) return null;
  return newLock(accountId);
}

function newLock(accountId: number): Lock {
  const lock: Lock = { pending: true };
  locks.set(accountId, lock);
  // if the join never completes, free the name again
  setTimeout(() => lock.pending && freeLock(accountId, lock), PENDING_MS).unref();
  return lock;
}

export function holdsLock(accountId: number, lock: Lock) {
  return locks.get(accountId) === lock;
}

/** Frees the account, unless someone else holds it by now. */
export function freeLock(accountId: number, lock: Lock) {
  if (locks.get(accountId) === lock) locks.delete(accountId);
}

/** A one-time ticket to enter another map without typing the password again. */
export function makeTicket(accountId: number, zone: string): string {
  const lock = newLock(accountId);
  const ticket = randomBytes(24).toString("hex");
  tickets.set(ticket, { accountId, zone, lock });
  setTimeout(() => tickets.delete(ticket), PENDING_MS).unref();
  return ticket;
}

export function useTicket(ticket: string, zone: string): { accountId: number; lock: Lock } | null {
  const t = tickets.get(ticket);
  if (!t || t.zone !== zone || locks.get(t.accountId) !== t.lock) return null;
  tickets.delete(ticket);
  return t;
}
