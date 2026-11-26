import icons from "./icons.json";

/** Item pictures from art/icons.py, shown as a piece of one big image. */
const index = icons.index as Record<string, number>;

export function itemIcon(id: string, cls = "icon"): HTMLElement {
  const e = document.createElement("span");
  e.className = `${cls} ipic`;
  const i = index[id];
  if (i === undefined) return e;
  const col = i % icons.cols;
  const row = Math.floor(i / icons.cols);
  e.style.backgroundSize = `${icons.cols * 100}% ${icons.rows * 100}%`;
  e.style.backgroundPosition = `${(col / (icons.cols - 1)) * 100}% ${(row / Math.max(1, icons.rows - 1)) * 100}%`;
  return e;
}
