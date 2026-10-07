// Generates placeholder PWA icons from public/icons/icon.svg.
// Run once after changing the SVG:  pnpm --filter @mizania/web icons
// The PNGs are committed, so builds don't need sharp.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const svg = await readFile(`${dir}icon.svg`);
const maskableSvg = await readFile(`${dir}icon-maskable.svg`);

const outputs = [
  { src: svg, size: 192, name: "icon-192.png" },
  { src: svg, size: 512, name: "icon-512.png" },
  { src: maskableSvg, size: 512, name: "icon-maskable-512.png" },
  { src: maskableSvg, size: 180, name: "apple-touch-icon.png" },
];

for (const { src, size, name } of outputs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(`${dir}${name}`);
  console.info(`wrote public/icons/${name}`);
}
