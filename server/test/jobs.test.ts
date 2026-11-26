import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, Room } from "colyseus.js";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { addItem, BAG_SIZE, canUse, craft, CRAFT_NAMES, emptyInventory, equipItem, ITEMS, RECIPES, resourceAt } from "../../shared/items";
import { buildBrindleVillage } from "../../shared/map";
import { rootsFor } from "../../shared/passives";
import { Msg, ROOM_OF } from "../../shared/protocol";
import { attackRange, ENEMY_SKILLS, Job, JOB_CHOICES, JOB_NAMES, jobId, playerStats, SKILLS } from "../../shared/stats";
import { ZONE_IDS } from "../../shared/zones";
import { WorldRoom } from "../src/rooms/WorldRoom";

process.env.HV_DB = ":memory:";
const PORT = 25675;
let gameServer: Server;
before(async () => {
  const httpServer = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  for (const zone of ZONE_IDS) gameServer.define(ROOM_OF[zone], WorldRoom, { zone });
  gameServer.define(ROOM_OF.rift, WorldRoom, { zone: "rift" });
  await gameServer.listen(PORT);
});
after(async () => {
  await gameServer.gracefullyShutdown(false);
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 4000, what = "") => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out ${what}`);
    await wait(15);
  }
};

interface S {
  room: Room<any>;
  w: WorldRoom;
  hits: any[];
  notices: string[];
}
let n = 0;
async function make(job: Job | null, level = 30): Promise<S> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>("world", { name: `Jobber${++n}`, password: "jobs1", create: true });
  const s: S = { room, w: matchMaker.getLocalRoomById(room.roomId) as unknown as WorldRoom, hits: [], notices: [] };
  room.onMessage(Msg.Hit, (h: any) => s.hits.push(h));
  room.onMessage(Msg.Notice, (x: any) => s.notices.push(x.text));
  for (const m of [Msg.ChatLine, Msg.Loot, Msg.Private, Msg.Gathering, Msg.ExpGain, Msg.LevelUp, Msg.Cooldown]) room.onMessage(m, () => {});
  await until(() => room.state.players?.has(room.sessionId));
  const p = s.w.state.players.get(room.sessionId)!;
  p.level = level;
  if (job) {
    room.send(Msg.ChangeJob, { job });
    await until(() => p.job === job, 4000, job);
    for (const [id, d] of Object.entries(SKILLS)) if (d.job === job) p.skills.set(id, 1);
  }
  return s;
}
const body = (s: S) => s.w.state.players.get(s.room.sessionId)!;
const ctl = (s: S) => s.w.ctl.get(s.room.sessionId)!;
/** A fresh monster with lots of health that cannot act, at a place in the open south-east. */
function dummy(s: S, x: number, y: number) {
  const before = new Set(s.w.state.monsters.keys());
  s.w.monsterSys.summon("hen", 1, x, y);
  const id = [...s.w.state.monsters.keys()].find((k) => !before.has(k))!;
  const m = s.w.state.monsters.get(id)!;
  Object.assign(m, { x, y, hp: 100000, maxHp: 100000 });
  s.w.monsterSys.ctl.get(id)!.stunUntil = Date.now() + 1e9;
  return id;
}
function clear(s: S) {
  s.w.monsterSys.clearNear(24, 24, 100);
  (s.w.monsterSys as any).respawns.length = 0;
}
const FIELD = { x: 24, y: 10 };

test("job data: every job has four skills on its own keys, a tree corner and a first weapon it can use", () => {
  assert.equal(jobId("nonsense"), "wanderer");
  assert.equal(jobId("constructor"), "wanderer");
  for (const { job, gift } of JOB_CHOICES) {
    const mine = Object.values(SKILLS).filter((d) => d.job === job);
    assert.deepEqual(mine.map((d) => d.key).sort(), ["1", "2", "3", "4"], job);
    assert.equal(rootsFor(job).length, 2, job);
    if (gift) assert.ok(canUse(ITEMS[gift], job));
    for (const d of mine) {
      if (ENEMY_SKILLS.has(d.kind)) assert.ok(d.range > 1, d.name);
      if (d.mp) assert.ok(playerStats(10, job).maxMp > d.mp, `${d.name} can be paid for at level 10`);
      else assert.ok(true);
    }
  }
  assert.equal(playerStats(10, "squire").maxMp, 0);
  assert.ok(playerStats(10, "weaver").maxMp > 0);
  assert.ok(attackRange("bow") > 5 && attackRange("sword") < 2 && attackRange(undefined) < 2);
  assert.equal(Object.keys(JOB_NAMES).length, 13);
});

test("new gear: jobs, recipes of all three crafts, and herbs", () => {
  const inv = emptyInventory();
  addItem(inv.bag, BAG_SIZE, "bow_1", 1);
  assert.ok(equipItem(inv, inv.bag[0].uid, 60, "squire"), "a squire cannot use a bow");
  assert.equal(equipItem(inv, inv.bag[0].uid, 60, "archer"), null);
  for (const r of RECIPES) assert.ok(CRAFT_NAMES[r.craft ?? "smith"] && ITEMS[r.item], r.item);
  const w = emptyInventory();
  addItem(w.bag, BAG_SIZE, "wood_1", 20);
  const made = craft(w, "bow_1", false, "x", () => 0.5);
  assert.ok("made" in made);
  assert.deepEqual([w.smithing, w.woodwork, w.tailoring], [0, 1, 0]);
  assert.ok("error" in craft(w, "bow_2", false, "x"));
  const map = buildBrindleVillage();
  let herbs = 0;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (resourceAt(map, x, y)?.item === "herb_1") herbs++;
  assert.ok(herbs > 5);
});

test("changing job: only once, from level 10, with a first weapon, and the old one goes to the bag", async () => {
  const s = await make(null, 9);
  const p = body(s);
  s.room.send(Msg.ChangeJob, { job: "archer" });
  await until(() => s.notices.length === 1);
  p.level = 10;
  s.room.send(Msg.ChangeJob, { job: "king" });
  s.room.send(Msg.ChangeJob);
  addItem(ctl(s).inv.bag, BAG_SIZE, "sword_1", 1);
  s.room.send(Msg.Equip, { uid: ctl(s).inv.bag[0].uid });
  await until(() => p.weapon === "sword_1");
  s.room.send(Msg.ChangeJob, { job: "archer" });
  await until(() => p.job === "archer");
  assert.equal(p.weapon, "bow_1");
  assert.ok(ctl(s).inv.bag.some((i) => i.id === "sword_1"));
  s.room.send(Msg.ChangeJob, { job: "weaver" });
  await wait(150);
  assert.equal(p.job, "archer");
  // the job is still there after logging in again
  const name = p.name;
  await s.room.leave();
  await wait(150);
  const again = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>("world", { name, password: "jobs1", create: false });
  await until(() => again.state.players?.has(again.sessionId));
  assert.equal(again.state.players.get(again.sessionId).job, "archer");
  await again.leave();
});

test("archer: shoots from afar, pierces a line, marks, and leaps back", async () => {
  const s = await make("archer");
  clear(s);
  const p = body(s);
  Object.assign(p, FIELD);
  const a = dummy(s, FIELD.x, FIELD.y - 4);
  const b = dummy(s, FIELD.x, FIELD.y - 5);
  const side = dummy(s, FIELD.x - 3, FIELD.y - 3);
  s.room.send(Msg.Attack, { id: a });
  await until(() => s.hits.length > 0, 4000, "arrow");
  assert.ok(Math.abs(p.y - FIELD.y) < 0.1, "did not walk up to it");
  s.hits.length = 0;
  s.room.send(Msg.Skill, { skill: "double_shot", target: a });
  await until(() => s.hits.filter((h) => h.skill === "double_shot").length === 2, 4000, "two arrows");
  s.room.send(Msg.Skill, { skill: "pierce_arrow", target: a });
  await until(() => s.hits.filter((h) => h.skill === "pierce_arrow").length === 2, 4000, "pierce");
  assert.deepEqual(new Set(s.hits.filter((h) => h.skill === "pierce_arrow").map((h) => h.to)), new Set([a, b]), "not the one to the side");
  void side;
  s.room.send(Msg.Skill, { skill: "mark_weak", target: a });
  await until(() => s.w.monsterSys.ctl.get(a)!.markUntil > Date.now());
  ctl(s).targetId = a;
  s.room.send(Msg.Skill, { skill: "backstep" });
  await until(() => p.y >= FIELD.y + 2, 3000, "leap");
  await until(() => !ctl(s).leaping);
  await s.room.leave();
});

test("weaver: mana, splash, chain, slow and mana shield", async () => {
  const s = await make("weaver");
  clear(s);
  const p = body(s);
  Object.assign(p, FIELD);
  assert.equal(p.mp, p.maxMp);
  const a = dummy(s, FIELD.x, FIELD.y - 4);
  const near = dummy(s, FIELD.x + 1, FIELD.y - 4);
  const far = dummy(s, FIELD.x + 3, FIELD.y - 5);
  s.room.send(Msg.Skill, { skill: "fireball", target: a });
  await until(() => s.hits.filter((h) => h.skill === "fireball").length === 2, 4000, "splash");
  assert.ok(!s.hits.some((h) => h.skill === "fireball" && h.to === far));
  assert.ok(s.hits.some((h) => h.skill === "fireball" && h.to === near));
  assert.ok(p.mp <= p.maxMp - 10);
  s.room.send(Msg.Skill, { skill: "chain_lightning", target: a });
  await until(() => s.hits.filter((h) => h.skill === "chain_lightning").length === 3, 4000, "chain");
  s.room.send(Msg.Skill, { skill: "ice_lance", target: a });
  await until(() => s.w.monsterSys.ctl.get(a)!.slowUntil > Date.now(), 4000, "slow");
  // no mana: refused, no cooldown
  p.mp = 0;
  ctl(s).cooldowns.clear();
  const before = s.notices.length;
  s.room.send(Msg.Skill, { skill: "fireball", target: a });
  await until(() => s.notices.length > before);
  assert.equal(ctl(s).cooldowns.size, 0);
  // mana comes back
  ctl(s).lastCombatAt = 0;
  ctl(s).targetId = null;
  await until(() => p.mp > 0, 3000, "mana back");
  p.mp = p.maxMp;
  s.room.send(Msg.Skill, { skill: "mana_shield" });
  await until(() => p.manaShield);
  ctl(s).mods.dodge = 0;
  const mp = p.mp;
  const hp = p.hp;
  (s.w as any).monsterHitsPlayer(a, s.room.sessionId, 100);
  assert.ok(p.mp < mp, "mana takes part of the hit");
  assert.ok(hp - p.hp > 0 && hp - p.hp < 100);
  await s.room.leave();
});

test("acolyte: heals and blesses friends, revives the fallen", async () => {
  const s = await make("acolyte");
  const f = await make("squire");
  clear(s);
  Object.assign(body(s), FIELD);
  Object.assign(body(f), { x: FIELD.x + 2, y: FIELD.y });
  body(f).hp = 10;
  s.room.send(Msg.Skill, { skill: "heal", target: f.room.sessionId });
  await until(() => body(f).hp > 20, 4000, "heal");
  assert.ok(s.hits.some((h) => h.heal && h.to === f.room.sessionId));
  s.room.send(Msg.Skill, { skill: "blessing" });
  await until(() => body(f).blessed && body(s).blessed);
  // too far, and not on the fallen
  ctl(s).cooldowns.clear();
  body(f).x = FIELD.x + 12;
  const k = s.notices.length;
  s.room.send(Msg.Skill, { skill: "heal", target: f.room.sessionId });
  await until(() => s.notices.length > k);
  body(f).x = FIELD.x + 2;
  (s.w as any).monsterHitsPlayer("m1", f.room.sessionId, 999999);
  assert.equal(body(f).dead, true);
  assert.equal(body(f).blessed, false);
  s.room.send(Msg.Skill, { skill: "revive" });
  await until(() => !body(f).dead, 4000, "revive");
  assert.ok(body(f).hp > 0 && body(f).hp < body(f).maxHp);
  f.room.send(Msg.Respawn);
  await wait(100);
  assert.equal(Math.round(body(f).x), FIELD.x + 2, "no respawn needed any more");
  // healing a monster or yourself
  ctl(s).cooldowns.clear();
  body(s).hp = 50;
  s.room.send(Msg.Skill, { skill: "heal", target: "m1" });
  await until(() => body(s).hp > 60, 3000, "self");
  await s.room.leave();
  await f.room.leave();
});

test("squire: taunt turns monsters on you", async () => {
  const s = await make("squire");
  clear(s);
  Object.assign(body(s), FIELD);
  const a = dummy(s, FIELD.x + 2, FIELD.y);
  const far = dummy(s, FIELD.x + 8, FIELD.y);
  s.room.send(Msg.Skill, { skill: "taunt" });
  await until(() => s.w.monsterSys.ctl.get(a)!.targetId === s.room.sessionId);
  assert.equal(s.w.monsterSys.ctl.get(far)!.targetId, null);
  // skills of other jobs are refused
  const k = s.notices.length;
  s.room.send(Msg.Skill, { skill: "fireball", target: a });
  s.room.send(Msg.LearnSkill, { skill: "fireball" });
  await until(() => s.notices.length > k);
  assert.equal(body(s).skills.get("fireball"), undefined);
  await s.room.leave();
});

test("second jobs: from level 30, keep the main skills, add three of their own", async () => {
  const { SECOND_CHOICES, baseJob } = await import("../../shared/stats");
  for (const [main, list] of Object.entries(SECOND_CHOICES)) {
    assert.equal(list.length, 2, main);
    for (const { job } of list) {
      assert.equal(baseJob(job), main);
      const own = Object.values(SKILLS).filter((d) => d.job === job);
      assert.deepEqual(own.map((d) => d.key).sort(), ["5", "6", "7"], job);
      assert.equal(rootsFor(job).length, rootsFor(main as Job).length, `${job} starts where ${main} does`);
      assert.ok(playerStats(30, job).maxHp > 0);
    }
  }
  const s = await make("squire", 29);
  const p = body(s);
  s.room.send(Msg.ChangeJob, { job: "reaver" });
  await until(() => s.notices.some((n) => n.includes("30")), 3000, "too low");
  p.level = 30;
  s.room.send(Msg.ChangeJob, { job: "oracle" });
  await wait(120);
  assert.equal(p.job, "squire", "not someone else's second job");
  s.room.send(Msg.ChangeJob, { job: "reaver" });
  await until(() => p.job === "reaver");
  // old skills still work, and the new ones too
  clear(s);
  Object.assign(p, FIELD);
  const a = dummy(s, FIELD.x + 1, FIELD.y);
  const b = dummy(s, FIELD.x - 1, FIELD.y);
  p.skills.set("whirlwind", 1);
  p.skills.set("bloodboil", 1);
  s.hits.length = 0;
  s.room.send(Msg.Skill, { skill: "heavy_strike", target: a });
  await until(() => s.hits.some((h) => h.skill === "heavy_strike"), 3000, "main skill");
  s.room.send(Msg.Skill, { skill: "whirlwind" });
  await until(() => new Set(s.hits.filter((h) => h.skill === "whirlwind").map((h) => h.to)).size === 2, 3000, "whirl");
  void b;
  s.room.send(Msg.Skill, { skill: "bloodboil" });
  await until(() => p.frenzy, 3000, "frenzy");
  assert.ok(ctl(s).frenzyDmg > 0.2);
  // no third change
  s.room.send(Msg.ChangeJob, { job: "warden" });
  await wait(120);
  assert.equal(p.job, "reaver");
  await s.room.leave();
});

test("pathfinder vanishes, warden pulls, oracle heals everyone around", async () => {
  const w1 = await make("archer");
  const p = body(w1);
  w1.room.send(Msg.ChangeJob, { job: "pathfinder" });
  await until(() => p.job === "pathfinder");
  p.skills.set("camouflage", 1);
  w1.room.send(Msg.Skill, { skill: "camouflage" });
  await until(() => p.shielded, 3000, "hidden");
  await w1.room.leave();

  const w2 = await make("squire");
  const q = body(w2);
  w2.room.send(Msg.ChangeJob, { job: "warden" });
  await until(() => q.job === "warden");
  clear(w2);
  Object.assign(q, FIELD);
  const far = dummy(w2, FIELD.x + 4, FIELD.y);
  q.skills.set("chain_pull", 1);
  w2.room.send(Msg.Skill, { skill: "chain_pull", target: far });
  await until(() => Math.hypot(w2.w.state.monsters.get(far)!.x - q.x, w2.w.state.monsters.get(far)!.y - q.y) < 1.6, 4000, "pulled");
  await w2.room.leave();

  const w3 = await make("acolyte");
  const o = body(w3);
  const friend = await make(null, 30);
  w3.room.send(Msg.ChangeJob, { job: "oracle" });
  await until(() => o.job === "oracle");
  const f = body(friend);
  Object.assign(o, FIELD);
  Object.assign(f, { x: FIELD.x + 2, y: FIELD.y });
  f.hp = 5;
  o.hp = 5;
  o.mp = o.maxMp;
  o.skills.set("mass_heal", 1);
  w3.room.send(Msg.Skill, { skill: "mass_heal" });
  await until(() => f.hp > 5 && o.hp > 5, 3000, "both healed");
  await Promise.all([w3.room.leave(), friend.room.leave()]);
});
