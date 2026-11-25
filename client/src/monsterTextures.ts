import Phaser from "phaser";

/** Small effects drawn with code (target ring, shield, sparkle). Monsters come from sprites.ts. */

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function makeMonsterTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("target-ring")) return; // already made for an earlier map
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
