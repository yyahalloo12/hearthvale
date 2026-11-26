/**
 * Makes shared/data/passives.json: the passive tree "ผืนทอแห่งชะตา".
 *
 *   node art/passives-gen.mjs
 *
 * A ring of endurance in the middle, four job corners (each with a trunk and
 * four branches running out to keystones), and four mixed wedges between them
 * for hybrid builds. Some nodes change how skills work (more arrows, wider
 * spells, longer stuns...).
 */
import { writeFileSync } from "node:fs";

const nodes = [];
const edges = [];
const ids = new Set();
const add = (id, size, area, x, y, name, mods, extra = {}) => {
  if (ids.has(id)) throw new Error("dup " + id);
  ids.add(id);
  nodes.push({ id, name, size, area, x: +x.toFixed(2), y: +y.toFixed(2), mods, ...extra });
  return id;
};
const link = (...p) => {
  for (let i = 0; i + 1 < p.length; i++) edges.push([p[i], p[i + 1]]);
};
const pol = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r];
};

// ---- small nodes: name and bonus -----------------------------------------------
const SM = {
  str: ["กำลัง", { str: 5 }],
  agi: ["ความคล่อง", { agi: 5 }],
  int: ["ปัญญา", { int: 5 }],
  fai: ["ศรัทธา", { fai: 5 }],
  hp: ["เลือดหนา", { hpPct: 3 }],
  def: ["หนังเหนียว", { defPct: 4 }],
  reg: ["หายใจลึก", { regenPct: 10 }],
  atk: ["คมดาบ", { atkPct: 3 }],
  ls: ["กลิ่นเลือด", { lifesteal: 1.5 }],
  crit: ["ตาไว", { critChance: 1.5 }],
  critd: ["แผลลึก", { critDmgPct: 8 }],
  as: ["มือเร็ว", { attackSpeedPct: 3 }],
  dodge: ["ตัวเบา", { dodge: 1.5 }],
  move: ["ฝีเท้าเบา", { moveSpeedPct: 3 }],
  sk: ["ฝีมือช่ำชอง", { skillDmgPct: 4 }],
  cdr: ["จังหวะไหลลื่น", { cdrPct: 2 }],
  dr: ["พรคุ้มภัย", { dmgReduce: 1.5 }],
  low: ["ฮึดสู้", { lowHpDmgPct: 5 }],
  aoe: ["วงกว้าง", { aoePct: 6 }],
  dur: ["ทอยาว", { durationPct: 6 }],
  stun: ["หนักมือ", { stunPct: 8 }],
  heal: ["มือเยียวยา", { healPct: 6 }],
  mana: ["ประหยัดมานา", { manaCostPct: 4 }],
  mp: ["บ่อมานา", { mpPct: 5 }],
  splash: ["ฟันกวาด", { meleeSplash: 8 }],
  multi: ["ซ้ำจังหวะ", { multiStrike: 3 }],
};

// ---- notables: name, bonus, and what kind of build they lean to ----------------
const NOTE = {
  str: [
    ["กายหินผา", { hpPct: 8, defPct: 8 }],
    ["มือเหล็ก", { atkPct: 10, lowHpDmgPct: 10 }],
    ["คลื่นดาบ", { meleeSplash: 25, atkPct: 4 }],
    ["ผู้ทลายกำแพง", { stunPct: 30, skillDmgPct: 6 }],
    ["เลือดนักรบ", { lifesteal: 3, hpPct: 5 }],
    ["วงขวานพายุ", { aoePct: 20, atkPct: 5 }],
    ["ไม่ล้มง่าย", { dmgReduce: 4, regenPct: 20 }],
    ["ฟันซ้ำ", { multiStrike: 12, atkPct: 4 }],
  ],
  agi: [
    ["ลูกศรแยกร่าง", { extraProjectiles: 1, skillDmgPct: 4 }],
    ["นักแม่นปืน", { critChance: 5, critDmgPct: 20 }],
    ["สายลมกระซิบ", { dodge: 5, moveSpeedPct: 6 }],
    ["ห่าลูกศร", { extraProjectiles: 1, attackSpeedPct: 6 }],
    ["กับดักชำนาญ", { durationPct: 20, stunPct: 20 }],
    ["มือไม่หยุด", { attackSpeedPct: 10, multiStrike: 6 }],
    ["เงาพราง", { dodge: 4, cdrPct: 5 }],
    ["จุดตาย", { critDmgPct: 30 }],
  ],
  int: [
    ["ทอเวทซ้อน", { skillDmgPct: 12, int: 5 }],
    ["วงเวทกว้าง", { aoePct: 25, skillDmgPct: 4 }],
    ["สายฟ้าแตกแขนง", { chainJumps: 2, skillDmgPct: 5 }],
    ["ห้วงมานา", { mpPct: 20, manaCostPct: 10 }],
    ["น้ำแข็งไม่ละลาย", { durationPct: 30, skillDmgPct: 4 }],
    ["ทวิศร", { extraProjectiles: 1, skillDmgPct: 6 }],
    ["จังหวะร่ายเร็ว", { cdrPct: 8, manaCostPct: 6 }],
    ["คลื่นพลังเวท", { skillDmgPct: 8, critChance: 3 }],
  ],
  fai: [
    ["มือแห่งแสง", { healPct: 25, fai: 5 }],
    ["วงพรกว้าง", { aoePct: 25, healPct: 6 }],
    ["คุ้มกันนิรันดร์", { durationPct: 30, dmgReduce: 3 }],
    ["ลมหายใจแห่งผืนป่า", { regenPct: 40, hpPct: 5 }],
    ["ศรัทธาไม่สั่นคลอน", { defPct: 12, dmgReduce: 3 }],
    ["ค้อนแห่งธรรม", { stunPct: 25, atkPct: 6 }],
    ["น้ำมนต์ไหลเวียน", { manaCostPct: 10, mpPct: 10 }],
    ["แสงพิพากษา", { skillDmgPct: 8, critChance: 3 }],
  ],
};

// small nodes each corner uses, cycled along its branches
const POOL = {
  str: [["str", "atk", "hp", "def"], ["str", "splash", "atk", "ls"], ["str", "stun", "dr", "hp"], ["str", "low", "multi", "atk"]],
  agi: [["agi", "crit", "as", "dodge"], ["agi", "critd", "crit", "move"], ["agi", "dur", "stun", "dodge"], ["agi", "as", "multi", "crit"]],
  int: [["int", "sk", "mp", "cdr"], ["int", "aoe", "sk", "mana"], ["int", "dur", "sk", "cdr"], ["int", "sk", "crit", "mp"]],
  fai: [["fai", "heal", "reg", "def"], ["fai", "aoe", "heal", "mana"], ["fai", "dur", "dr", "hp"], ["fai", "stun", "atk", "def"]],
};

const KEYSTONES = {
  str: [
    ["k_blood", "กระหายเลือด", {}, { special: "bloodthirst", desc: "เลือดไม่ฟื้นเอง แต่ดูดเลือดแรงขึ้น 3 เท่า" }],
    ["k_berserk", "คลั่งศึก", { atkPct: 30, lifesteal: 3, defPct: -30 }, { desc: "ตีแรงและดูดเลือด แต่เกราะบางลงมาก" }],
    ["k_fortress", "ป้อมเหล็ก", { dmgReduce: 12, defPct: 30, moveSpeedPct: -15 }, { desc: "แข็งเหมือนกำแพง แต่เดินช้าลง" }],
  ],
  agi: [
    ["k_first", "นัดแรกเด็ดขาด", {}, { special: "firststrike", desc: "ตีครั้งแรกใส่เป้าใหม่คริติคอลเสมอ แต่โอกาสคริติคอลอื่น -50%" }],
    ["k_barrage", "ห่าศรพันดอก", { extraProjectiles: 3, attackSpeedPct: -15, skillDmgPct: -10 }, { desc: "ยิงลูกศรเพิ่มอีก 3 ดอก แต่ยิงช้าลงและดาเมจสกิลลดลง" }],
    ["k_quick", "มือไวกว่าตา", { attackSpeedPct: 25, critDmgPct: -30 }, { desc: "ตีเร็วมาก แต่คริติคอลแรงน้อยลง" }],
  ],
  int: [
    ["k_glass", "เวทแก้วเปราะ", { skillDmgPct: 40, hpPct: -25 }, { desc: "เวทแรงขึ้นมาก แต่เลือดน้อยลง" }],
    ["k_wide", "ผืนทอกว้างไกล", { aoePct: 50, skillDmgPct: -15 }, { desc: "เวทวงกว้างใหญ่ขึ้นครึ่งหนึ่ง แต่ดาเมจลดลง" }],
  ],
  fai: [
    ["k_saint", "นักบุญ", { healPct: 45, atkPct: -20 }, { desc: "รักษาแรงขึ้นมาก แต่ตีเบาลง" }],
    ["k_long", "พรยืนยาว", { durationPct: 50, stunPct: 40, cdrPct: -10 }, { desc: "บัฟ ดีบัฟ และมึนนานขึ้นมาก แต่สกิลคูลดาวน์นานขึ้น" }],
  ],
};

const JOB = { str: "squire", agi: "archer", int: "weaver", fai: "acolyte" };
const ROOT_NAME = { str: "ประตูสไควร์", agi: "ประตูนักธนู", int: "ประตูนักทอเวท", fai: "ประตูอาโคไลต์" };
const ANG = { agi: 45, str: 135, fai: 225, int: 315 };

// ---- middle ----------------------------------------------------------------------
add("start", "root", "center", 0, 0, "ปมแรกของผืนทอ", {}, { job: "wanderer" });
for (const k of ["str", "agi", "int", "fai"]) {
  add(`c_${k}`, "small", "center", ...pol(ANG[k], 1.2), ...SM[k]);
  link("start", `c_${k}`);
}
// endurance ring: 16 nodes, notables at the mixed angles
const RING = 16;
const ring = [];
for (let i = 0; i < RING; i++) {
  const d = (45 + (360 / RING) * i) % 360;
  const id = `r${i}`;
  ring.push(id);
  if (i % 4 === 2) {
    const note = [["กายหินผา", { hpPct: 8, defPct: 6 }], ["ลมหายใจยาว", { hpPct: 5, regenPct: 30 }], ["ผิวเหล็ก", { defPct: 10, dmgReduce: 2 }], ["ใจเด็ด", { hpPct: 6, lowHpDmgPct: 10 }]][i >> 2];
    add(id, "notable", "end", ...pol(d, 2.7), ...note);
  } else add(id, "small", "end", ...pol(d, 2.7), ...SM[["hp", "def", "reg", "hp"][i % 4]]);
}
link(...ring, ring[0]);
for (const [k, i] of [["agi", 0], ["str", 4], ["fai", 8], ["int", 12]]) link(`c_${k}`, ring[i]);

// ---- job corners ------------------------------------------------------------------
const branchEnds = {};
for (const k of ["str", "agi", "int", "fai"]) {
  const A = ANG[k];
  const ringNode = ring[{ agi: 0, str: 4, fai: 8, int: 12 }[k]];
  // trunk to the job's own starting point
  const t1 = add(`${k}_t1`, "small", k, ...pol(A, 3.7), ...SM[k]);
  const t2 = add(`${k}_t2`, "small", k, ...pol(A, 4.7), ...SM[POOL[k][0][1]]);
  const root = add(`start_${JOB[k]}`, "root", k, ...pol(A, 5.8), ROOT_NAME[k], {}, { job: JOB[k] });
  link(ringNode, t1, t2, root);
  // four branches fanning out
  const notes = [...NOTE[k]];
  const keys = [...KEYSTONES[k]];
  const ends = [];
  const mids = [];
  for (let b = 0; b < 4; b++) {
    const a = A - 27 + b * 18;
    const pool = POOL[k][b];
    let prev = root;
    const chain = [];
    for (let s = 0; s < 7; s++) {
      const r = 6.9 + s * 1.05;
      const id = `${k}_b${b}_${s}`;
      if (s === 3 || s === 6) {
        const [name, mods] = notes.shift();
        add(id, "notable", k, ...pol(a, r), name, mods);
      } else add(id, "small", k, ...pol(a + (s % 2 ? 2 : -2), r), ...SM[pool[s % pool.length]]);
      link(prev, id);
      chain.push(id);
      prev = id;
    }
    // little side spur before each notable: two more nodes to pick from
    for (const at of [2, 5]) {
      const sid = `${k}_b${b}_x${at}`;
      add(sid, "small", k, ...pol(a + (b < 2 ? -6.5 : 6.5), 6.9 + at * 1.05 + 0.4), ...SM[pool[(at + 1) % pool.length]]);
      link(chain[at], sid);
    }
    mids.push(chain[3]);
    ends.push(chain[6]);
  }
  // cross links between neighbouring branches so paths can bend
  for (let b = 0; b < 3; b++) link(`${k}_b${b}_4`, `${k}_b${b + 1}_4`);
  // keystones at the far edge, past the branch ends
  keys.forEach(([id, name, mods, extra], i) => {
    const b = [0, 3, 1][i];
    const a = A - 27 + b * 18;
    add(id, "keystone", k, ...pol(a, 14.4), name, mods, extra);
    link(ends[b], id);
  });
  branchEnds[k] = { left: `${k}_b0_2`, right: `${k}_b3_2` };
}

// ---- mixed wedges between corners: hybrid builds -----------------------------------
const WEDGES = [
  ["agi", "int", 0, [["agi", "int", "crit", "sk"], ["เวทลูกศร", { extraProjectiles: 1, skillDmgPct: 6 }], ["ตาทิพย์", { critChance: 4, skillDmgPct: 6 }]]],
  ["str", "agi", 90, [["str", "agi", "atk", "as"], ["นักล่าเลือดร้อน", { atkPct: 6, attackSpeedPct: 6 }], ["ดาบสองคม", { multiStrike: 10, critChance: 3 }]]],
  ["fai", "str", 180, [["fai", "str", "hp", "stun"], ["อัศวินศักดิ์สิทธิ์", { defPct: 8, healPct: 10 }], ["ค้อนสายฟ้า", { stunPct: 20, meleeSplash: 15 }]]],
  ["int", "fai", 270, [["int", "fai", "mana", "heal"], ["ผู้ทอแสง", { skillDmgPct: 6, healPct: 12 }], ["สมาธิลึก", { manaCostPct: 8, durationPct: 15 }]]],
];
for (const [a, b, ang, [pool, n1, n2]] of WEDGES) {
  const ringNode = ring[Math.round(((ang - 45 + 360) % 360) / (360 / RING)) % RING];
  let prev = ringNode;
  const w = `w_${a}${b}`;
  const chain = [];
  for (let s = 0; s < 9; s++) {
    const id = `${w}_${s}`;
    const r = 3.8 + s * 1.05;
    if (s === 4) add(id, "notable", "center", ...pol(ang, r), ...n1);
    else if (s === 8) add(id, "notable", "center", ...pol(ang, r), ...n2);
    else add(id, "small", "center", ...pol(ang + (s % 2 ? 3 : -3), r), ...SM[pool[s % pool.length]]);
    link(prev, id);
    chain.push(id);
    prev = id;
  }
  // a side node on each side, then the wedge reaches into both corners
  for (const [side, off] of [["l", -7], ["r", 7]]) {
    const id = add(`${w}_${side}`, "small", "center", ...pol(ang + off, 3.8 + 6 * 1.05), ...SM[pool[side === "l" ? 0 : 1]]);
    link(chain[5], id);
  }
  const cornerOf = (k) => branchEnds[k];
  // the corner whose angle is below this wedge connects with its right branch, the other with its left
  const lo = (ang - 45 + 360) % 360;
  for (const k of [a, b]) link(chain[6], ANG[k] === lo ? cornerOf(k).right : cornerOf(k).left);
}

const out = { nodes, edges };
writeFileSync(new URL("../shared/data/passives.json", import.meta.url), JSON.stringify(out, null, 0).replace(/\},\{/g, "},\n{").replace(/\],\[/g, "],\n["));
const count = {};
for (const n of nodes) count[n.size] = (count[n.size] ?? 0) + 1;
console.log(nodes.length, "nodes", edges.length, "links", count);
