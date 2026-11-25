import Phaser from "phaser";

/** Placeholder monster art drawn with code. Keys: "mon-<kind>". */

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function hen(g: Phaser.GameObjects.Graphics, s: number, body: number, comb: number) {
  // s = scale; drawn facing screen-left, feet at bottom centre
  const W = 48 * s;
  const H = 48 * s;
  g.fillStyle(0xe8a33a);
  g.fillRect(W / 2 - 6 * s, H - 8 * s, 3 * s, 8 * s);
  g.fillRect(W / 2 + 3 * s, H - 8 * s, 3 * s, 8 * s);
  g.fillStyle(body);
  g.fillEllipse(W / 2 + 2 * s, H - 18 * s, 30 * s, 22 * s); // body
  g.fillEllipse(W / 2 + 14 * s, H - 24 * s, 10 * s, 16 * s); // tail
  g.fillCircle(W / 2 - 9 * s, H - 30 * s, 9 * s); // head
  g.fillStyle(comb);
  g.fillCircle(W / 2 - 12 * s, H - 40 * s, 3.5 * s);
  g.fillCircle(W / 2 - 8 * s, H - 41 * s, 3.5 * s);
  g.fillCircle(W / 2 - 4 * s, H - 39 * s, 3 * s);
  g.fillStyle(0xf5b02e);
  g.fillTriangle(W / 2 - 18 * s, H - 31 * s, W / 2 - 25 * s, H - 28 * s, W / 2 - 17 * s, H - 26 * s);
  g.fillStyle(0x2b1a10);
  g.fillCircle(W / 2 - 12 * s, H - 32 * s, 1.8 * s);
  g.fillStyle(0xd9d0c0);
  g.fillEllipse(W / 2 + 4 * s, H - 18 * s, 14 * s, 9 * s); // wing
}

export function makeMonsterTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("mon-hen")) return;
  make(scene, "mon-shadow", 44, 56, (g) => {
    g.fillStyle(0x3d3947, 0.85);
    g.fillEllipse(22, 34, 30, 40);
    g.fillCircle(22, 16, 13);
    g.fillTriangle(8, 44, 4, 56, 18, 52);
    g.fillTriangle(18, 50, 22, 56, 28, 50);
    g.fillTriangle(36, 44, 40, 56, 26, 52);
    g.fillStyle(0xe8e4f0);
    g.fillEllipse(16, 15, 5, 7);
    g.fillEllipse(26, 15, 5, 7);
  });
  make(scene, "mon-hunter", 56, 80, (g) => {
    g.fillStyle(0xb9b3c4);
    g.fillTriangle(28, 14, 8, 80, 48, 80); // long cloak
    g.fillStyle(0x8f889c);
    g.fillTriangle(28, 24, 20, 80, 40, 80);
    g.fillStyle(0xd6d1de);
    g.fillCircle(28, 18, 13); // hood
    g.fillStyle(0x221d2b);
    g.fillEllipse(26, 20, 16, 16);
    g.fillStyle(0xff5a5a);
    g.fillCircle(22, 19, 2.5);
    g.fillCircle(29, 19, 2.5);
    g.lineStyle(4, 0x57525f);
    g.lineBetween(8, 30, 4, 78); // spear
    g.fillStyle(0xe8e4f0);
    g.fillTriangle(8, 30, 4, 16, 13, 28);
  });
  make(scene, "mon-threadknight", 60, 78, (g) => {
    g.fillStyle(0x5d5767);
    g.fillRect(20, 56, 8, 20);
    g.fillRect(33, 56, 8, 20);
    g.fillStyle(0x6f6878);
    g.fillRoundedRect(14, 28, 32, 32, 8);
    g.fillStyle(0x857e90);
    g.fillRoundedRect(16, 6, 28, 24, 9);
    g.fillStyle(0x221d2b);
    g.fillRect(17, 15, 22, 5);
    g.lineStyle(2, 0xc14a6a); // broken threads
    g.lineBetween(16, 34, 4, 50);
    g.lineBetween(44, 34, 56, 46);
    g.lineBetween(30, 60, 26, 74);
    g.lineBetween(22, 8, 14, 0);
    g.fillStyle(0xc3ccd6);
    g.fillRect(6, 24, 4, 40); // sword
    g.fillRect(2, 54, 12, 4);
  });
  make(scene, "mon-hen", 48, 48, (g) => hen(g, 1, 0xfffaf0, 0xff6a1a));
  make(scene, "mon-henqueen", 86, 86, (g) => {
    hen(g, 86 / 48, 0xffe7c2, 0xff2a00);
    // tiny golden crown
    g.fillStyle(0xffd23a);
    g.fillTriangle(16, 10, 22, 0, 28, 10);
    g.fillTriangle(22, 10, 28, 0, 34, 10);
    g.fillRect(16, 9, 18, 5);
  });

  make(scene, "mon-rat", 52, 36, (g) => {
    g.fillStyle(0xd88f8f);
    g.lineStyle(3, 0xd88f8f);
    g.beginPath();
    g.moveTo(40, 26);
    g.lineTo(48, 20);
    g.lineTo(51, 12);
    g.strokePath();
    g.fillStyle(0x8f7a66);
    g.fillEllipse(28, 23, 34, 24); // round body
    g.fillCircle(13, 20, 10); // head
    g.fillStyle(0xb39b85);
    g.fillCircle(14, 9, 5); // ear
    g.fillCircle(22, 10, 5);
    g.fillStyle(0xf0b8b8);
    g.fillCircle(14, 9, 2.5);
    g.fillCircle(22, 10, 2.5);
    g.fillStyle(0xff9b9b);
    g.fillCircle(4, 22, 2.5); // nose
    g.fillStyle(0x2b1a10);
    g.fillCircle(10, 18, 1.8);
    g.fillStyle(0x6e5a48);
    g.fillEllipse(20, 33, 8, 4);
    g.fillEllipse(36, 33, 8, 4);
  });

  make(scene, "mon-scarecrow", 52, 72, (g) => {
    g.fillStyle(0x7a4a26);
    g.fillRect(24, 26, 4, 46); // pole
    g.fillRect(4, 32, 44, 4); // arms
    g.fillStyle(0x6b8f3a);
    g.fillRect(14, 30, 24, 22); // patched shirt
    g.fillStyle(0xc8453a);
    g.fillRect(18, 38, 6, 6);
    g.fillStyle(0xe8c86a);
    g.fillTriangle(4, 32, 0, 40, 8, 38); // straw hands
    g.fillTriangle(48, 32, 52, 40, 44, 38);
    g.fillTriangle(16, 52, 26, 52, 20, 60);
    g.fillTriangle(26, 52, 36, 52, 32, 60);
    g.fillStyle(0xf0d9a8);
    g.fillCircle(26, 20, 10); // sack head
    g.fillStyle(0x2b1a10);
    g.fillRect(21, 17, 3, 3);
    g.fillRect(28, 17, 3, 3);
    g.lineStyle(1.5, 0x2b1a10);
    g.lineBetween(21, 25, 31, 25);
    g.fillStyle(0x5a3b22);
    g.fillEllipse(26, 12, 30, 6); // hat brim
    g.fillTriangle(18, 12, 26, 0, 34, 12);
  });

  make(scene, "target-ring", 56, 28, (g) => {
    g.lineStyle(3, 0xff4d4d, 0.9);
    g.strokeEllipse(28, 14, 50, 22);
  });

  make(scene, "shield", 22, 26, (g) => {
    g.fillStyle(0x4a90d9);
    g.lineStyle(2, 0xffe08a);
    g.beginPath();
    g.moveTo(2, 2);
    g.lineTo(20, 2);
    g.lineTo(20, 12);
    g.lineTo(11, 24);
    g.lineTo(2, 12);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });

  make(scene, "sparkle", 8, 8, (g) => {
    g.fillStyle(0xffffff);
    g.fillCircle(4, 4, 4);
  });
}

/** Rough size of each monster for click picking and label placement. */
export const MONSTER_SIZE: Record<string, { h: number; r: number }> = {
  hen: { h: 44, r: 22 },
  rat: { h: 34, r: 22 },
  scarecrow: { h: 70, r: 26 },
  henqueen: { h: 82, r: 36 },
  shadow: { h: 54, r: 22 },
  hunter: { h: 78, r: 26 },
  threadknight: { h: 76, r: 28 },
};
