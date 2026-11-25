import Phaser from "phaser";
import { TILE_H, TILE_W } from "../../shared/constants";

/**
 * Placeholder art drawn with code, so the game runs without any image files.
 * Swap these keys for real sprite sheets later; the rest of the game only
 * uses the texture keys.
 */

const HW = TILE_W / 2;
const HH = TILE_H / 2;

function diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, hw = HW, hh = HH) {
  g.beginPath();
  g.moveTo(cx, cy - hh);
  g.lineTo(cx + hw, cy);
  g.lineTo(cx, cy + hh);
  g.lineTo(cx - hw, cy);
  g.closePath();
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Seeded sprinkle of little dots so tiles do not look flat. */
function speckle(g: Phaser.GameObjects.Graphics, color: number, count: number, seed: number, alpha = 1) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle(color, alpha);
  for (let i = 0; i < count; i++) {
    // random point inside the diamond
    const u = r() - 0.5;
    const v = r() - 0.5;
    const x = HW + (u - v) * HW;
    const y = HH + (u + v) * HH;
    g.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
}

function tile(scene: Phaser.Scene, key: string, base: number, edge: number, extra?: (g: Phaser.GameObjects.Graphics) => void) {
  make(scene, key, TILE_W, TILE_H, (g) => {
    g.fillStyle(base);
    diamond(g, HW, HH);
    g.fillPath();
    extra?.(g);
    g.lineStyle(1, edge, 0.35);
    diamond(g, HW, HH);
    g.strokePath();
  });
}

export function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("t-ash")) return; // already made for an earlier map
  // Ground tiles (two grass variants to break up repetition).
  tile(scene, "t-grass-0", 0x7cc95a, 0x5ea845, (g) => speckle(g, 0x9be07a, 14, 7));
  tile(scene, "t-grass-1", 0x74c255, 0x5ea845, (g) => speckle(g, 0x5ea845, 12, 19));
  tile(scene, "t-flowers", 0x7cc95a, 0x5ea845, (g) => {
    speckle(g, 0xffffff, 5, 3);
    speckle(g, 0xff6fa8, 5, 11);
    speckle(g, 0xffe14d, 5, 29);
  });
  tile(scene, "t-path", 0xd9b77e, 0xb8955c, (g) => speckle(g, 0xbf9a62, 16, 5));
  tile(scene, "t-plaza", 0xc9c3b8, 0x9e978b, (g) => {
    g.lineStyle(1, 0xa39c90, 0.9);
    g.lineBetween(HW / 2, HH / 2, HW + HW / 2, HH + HH / 2);
    g.lineBetween(HW + HW / 2, HH / 2, HW / 2, HH + HH / 2);
  });
  tile(scene, "t-water", 0x4fa8e0, 0x3a8cc4, (g) => {
    g.lineStyle(2, 0xa8dcff, 0.7);
    g.lineBetween(HW - 12, HH - 2, HW - 2, HH - 2);
    g.lineBetween(HW + 4, HH + 5, HW + 14, HH + 5);
  });
  tile(scene, "t-sand", 0xf0dc9c, 0xd4bf7e, (g) => speckle(g, 0xe0c97f, 10, 13));

  // The Hollow: grey, washed-out ground and torn holes.
  tile(scene, "t-ash", 0x75707e, 0x5f5a68, (g) => speckle(g, 0x8a8494, 12, 17));
  tile(scene, "t-pale", 0x858090, 0x6a6575, (g) => speckle(g, 0x6f6a7a, 12, 23));
  tile(scene, "t-void", 0x1a1722, 0x2b2438, (g) => speckle(g, 0x6a4a9a, 5, 31, 0.8));

  make(scene, "p-deadtree", 64, 96, (g) => {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(32, 88, 36, 12);
    g.fillStyle(0x57525f);
    g.fillRect(28, 34, 8, 54);
    g.lineStyle(5, 0x57525f);
    g.lineBetween(32, 52, 14, 30);
    g.lineBetween(32, 44, 50, 22);
    g.lineBetween(32, 36, 28, 10);
    g.lineStyle(3, 0x6a6472);
    g.lineBetween(20, 37, 8, 36);
    g.lineBetween(43, 30, 56, 32);
    g.lineBetween(30, 22, 40, 8);
  });
  make(scene, "p-ruin", 64, 72, (g) => {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(32, 62, 54, 16);
    g.fillStyle(0x4c4755);
    g.fillRect(12, 22, 40, 40);
    g.fillStyle(0x5d5767);
    g.fillRect(12, 16, 12, 46);
    g.fillRect(30, 24, 10, 38);
    g.fillRect(42, 10, 10, 52);
    g.lineStyle(1, 0x3a3542);
    for (let y = 26; y < 62; y += 9) g.lineBetween(12, y, 52, y);
  });
  make(scene, "p-portal", 72, 96, (g) => {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(36, 86, 60, 18);
    g.fillStyle(0x6b6572);
    g.fillRect(6, 20, 12, 66);
    g.fillRect(54, 20, 12, 66);
    g.fillEllipse(36, 22, 60, 28);
    g.fillStyle(0x2a1a3a);
    g.fillEllipse(36, 54, 38, 62);
    g.lineStyle(3, 0xb04fe0, 0.9);
    g.strokeEllipse(36, 54, 34, 56);
    g.lineStyle(2, 0xe0a8ff, 0.8);
    g.strokeEllipse(36, 54, 18, 34);
  });
  make(scene, "p-gate", 64, 96, (g) => {
    g.fillStyle(0xffd23a, 0.25);
    g.fillEllipse(32, 84, 60, 22);
    g.fillStyle(0xfff3b0, 0.55);
    g.fillEllipse(32, 50, 34, 70);
    g.lineStyle(4, 0xffd23a);
    g.strokeEllipse(32, 50, 36, 74);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeEllipse(32, 50, 22, 52);
  });
  make(scene, "p-bundle", 36, 32, (g) => {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(18, 28, 30, 8);
    g.fillStyle(0x9a6a3a);
    g.fillCircle(18, 19, 11);
    g.fillStyle(0xb98350);
    g.fillCircle(15, 17, 6);
    g.fillStyle(0xc8453a);
    g.fillRect(13, 7, 10, 4);
    g.fillTriangle(18, 8, 8, 1, 14, 9);
    g.fillTriangle(18, 8, 28, 1, 22, 9);
  });

  // Tree: trunk + three round leaf blobs.
  make(scene, "p-tree", 64, 96, (g) => {
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(32, 88, 44, 14);
    g.fillStyle(0x7a4a26);
    g.fillRect(27, 58, 10, 30);
    g.fillStyle(0x2f8a3e);
    g.fillCircle(32, 40, 24);
    g.fillStyle(0x3ea64d);
    g.fillCircle(22, 34, 15);
    g.fillCircle(42, 30, 15);
    g.fillStyle(0x5cc466);
    g.fillCircle(30, 22, 12);
    g.fillStyle(0xff5a5a);
    g.fillCircle(18, 44, 3);
    g.fillCircle(44, 46, 3);
  });

  make(scene, "p-bush", 48, 36, (g) => {
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(24, 30, 36, 10);
    g.fillStyle(0x3a9a48);
    g.fillCircle(16, 20, 11);
    g.fillCircle(32, 20, 11);
    g.fillStyle(0x52b85e);
    g.fillCircle(24, 14, 11);
    g.fillStyle(0xffffff);
    g.fillCircle(20, 12, 2);
    g.fillCircle(30, 18, 2);
  });

  make(scene, "p-rock", 48, 36, (g) => {
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(24, 30, 36, 10);
    g.fillStyle(0x8d8a86);
    g.fillEllipse(24, 22, 34, 22);
    g.fillStyle(0xa9a6a1);
    g.fillEllipse(20, 18, 20, 12);
  });

  make(scene, "p-fence", 64, 48, (g) => {
    g.fillStyle(0x8a5a32);
    g.fillRect(14, 14, 6, 28);
    g.fillRect(44, 14, 6, 28);
    g.fillStyle(0xa8743f);
    g.fillRect(8, 20, 48, 5);
    g.fillRect(8, 31, 48, 5);
  });

  // Well in the plaza.
  make(scene, "p-well", 64, 80, (g) => {
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(32, 70, 52, 16);
    g.fillStyle(0x8f8a82);
    g.fillRect(10, 46, 44, 22);
    g.fillEllipse(32, 68, 44, 14);
    g.fillStyle(0x6c675f);
    g.fillEllipse(32, 46, 44, 14);
    g.fillStyle(0x2e5f8a);
    g.fillEllipse(32, 46, 34, 9);
    g.fillStyle(0x7a4a26);
    g.fillRect(12, 12, 5, 36);
    g.fillRect(47, 12, 5, 36);
    g.fillStyle(0xc0392b);
    g.fillTriangle(4, 16, 32, 0, 60, 16);
  });

  // Cottage covering a 2x2 footprint: walls as two iso faces + a red roof.
  make(scene, "p-house", 128, 136, (g) => {
    const by = 136; // bottom vertex y of footprint
    const wallH = 44;
    // footprint diamond: top (64, by-64), right (128, by-32), bottom (64, by), left (0, by-32)
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(64, by - 30, 128, 60);
    // left wall face
    g.fillStyle(0xf2e1bd);
    g.beginPath();
    g.moveTo(0, by - 32);
    g.lineTo(64, by);
    g.lineTo(64, by - wallH);
    g.lineTo(0, by - 32 - wallH);
    g.closePath();
    g.fillPath();
    // right wall face (shaded)
    g.fillStyle(0xd8c49c);
    g.beginPath();
    g.moveTo(64, by);
    g.lineTo(128, by - 32);
    g.lineTo(128, by - 32 - wallH);
    g.lineTo(64, by - wallH);
    g.closePath();
    g.fillPath();
    // timber frame
    g.lineStyle(3, 0x6b4226);
    g.lineBetween(0, by - 32, 0, by - 32 - wallH);
    g.lineBetween(64, by, 64, by - wallH);
    g.lineBetween(128, by - 32, 128, by - 32 - wallH);
    // door on left face
    g.fillStyle(0x6b4226);
    g.beginPath();
    g.moveTo(26, by - 19);
    g.lineTo(42, by - 11);
    g.lineTo(42, by - 39);
    g.lineTo(26, by - 47);
    g.closePath();
    g.fillPath();
    // window on right face
    g.fillStyle(0x8fd3ff);
    g.beginPath();
    g.moveTo(86, by - 26);
    g.lineTo(104, by - 35);
    g.lineTo(104, by - 53);
    g.lineTo(86, by - 44);
    g.closePath();
    g.fillPath();
    // roof: two slopes meeting at a ridge
    const ridgeY = by - 32 - wallH - 40;
    g.fillStyle(0xc8453a);
    g.beginPath();
    g.moveTo(-0, by - 32 - wallH);
    g.lineTo(64, by - wallH);
    g.lineTo(96, ridgeY + 16);
    g.lineTo(32, ridgeY - 16);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xa3362d);
    g.beginPath();
    g.moveTo(64, by - wallH);
    g.lineTo(128, by - 32 - wallH);
    g.lineTo(96, ridgeY + 16);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0x7d2620);
    g.lineBetween(32, ridgeY - 16, 96, ridgeY + 16);
  });

  // Character parts (body is white so it can be tinted with the tunic colour).
  make(scene, "c-shadow", 32, 12, (g) => {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(16, 6, 30, 10);
  });
  // The blacksmith's anvil and the storage chest.
  make(scene, "p-anvil", 64, 56, (g) => {
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(32, 48, 52, 14);
    g.fillStyle(0x7a4a26);
    g.fillRect(18, 34, 28, 15);
    g.fillStyle(0x5c3518);
    g.fillRect(18, 40, 28, 3);
    g.fillStyle(0x4a4d55);
    g.fillRect(26, 24, 12, 10);
    g.fillStyle(0x6b6f7a);
    g.fillRect(14, 14, 34, 11);
    g.fillTriangle(14, 14, 14, 24, 2, 16);
    g.fillStyle(0x8f94a0);
    g.fillRect(14, 14, 34, 3);
    g.fillStyle(0xffa53a);
    g.fillRect(24, 11, 16, 4);
  });
  make(scene, "p-chest", 64, 56, (g) => {
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(32, 48, 52, 14);
    g.fillStyle(0x8a5a32);
    g.fillRect(10, 24, 44, 25);
    g.fillStyle(0xa8743f);
    g.fillRoundedRect(8, 10, 48, 18, 8);
    g.fillStyle(0xe6c84a);
    g.fillRect(8, 24, 48, 4);
    g.fillRect(14, 12, 4, 36);
    g.fillRect(46, 12, 4, 36);
    g.fillRect(27, 22, 10, 11);
    g.fillStyle(0x4a2c17);
    g.fillRect(31, 26, 2, 4);
  });

  make(scene, "click-marker", 40, 20, (g) => {
    g.lineStyle(2, 0xffffff, 0.9);
    diamond(g, 20, 10, 18, 9);
    g.strokePath();
  });
}

export function groundKey(tile: number, x: number, y: number) {
  switch (tile) {
    case 1: return "t-flowers";
    case 2: return "t-path";
    case 3: return "t-plaza";
    case 4: return "t-water";
    case 5: return "t-sand";
    case 6: return "t-ash";
    case 7: return "t-pale";
    case 8: return "t-void";
    default: return (x * 7 + y * 13) % 5 === 0 ? "t-grass-1" : "t-grass-0";
  }
}
