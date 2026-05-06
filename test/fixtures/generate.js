import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const here = dirname(fileURLToPath(import.meta.url));

const makeSolidPng = (w, h, r, g, b, a = 255) => {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = a;
    }
  }
  return PNG.sync.write(png);
};

const makeSolidJpeg = (w, h, r, g, b) => {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data, width: w, height: h }, 90).data;
};

writeFileSync(join(here, "red-64.png"), makeSolidPng(64, 64, 255, 0, 0));
writeFileSync(join(here, "blue-32.png"), makeSolidPng(32, 32, 0, 0, 255));
writeFileSync(join(here, "tiny-31.png"), makeSolidPng(31, 31, 0, 255, 0));
writeFileSync(join(here, "green-800x600.jpg"), makeSolidJpeg(800, 600, 0, 200, 0));
writeFileSync(join(here, "split-top-red-bot-blue.png"), (() => {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (64 * y + x) << 2;
      const isTop = y < 32;
      png.data[i] = isTop ? 255 : 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = isTop ? 0 : 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
})());
writeFileSync(join(here, "corrupted.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
writeFileSync(join(here, "fake.bmp"), Buffer.from("BM"));
writeFileSync(join(here, "huge-21mb.png"), Buffer.alloc(21 * 1024 * 1024 + 1, 0));

console.log("fixtures generated");
