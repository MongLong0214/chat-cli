import { extname } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export const SUPPORTED_EXTS = [".png", ".jpg", ".jpeg"];
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_DIM = 8192;
export const MAX_PIXELS = MAX_DIM * MAX_DIM;
export const TARGET_SIZE = 64;
export const MIN_SOURCE_SIZE = 32;
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / 1024 / 1024;

export const normalizePath = (input) => {
  let p = String(input || "").trim();
  if (
    (p.startsWith('"') && p.endsWith('"') && p.length >= 2) ||
    (p.startsWith("'") && p.endsWith("'") && p.length >= 2)
  ) {
    p = p.slice(1, -1);
  }
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return homedir() + p.slice(1);
  }
  return p;
};

const decodePng = (buf) => {
  try {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, rgba: png.data };
  } catch {
    throw new Error("디코드 실패 (PNG 손상 또는 비표준)");
  }
};

const decodeJpeg = (buf) => {
  try {
    const j = jpeg.decode(buf, { useTArray: true });
    return { width: j.width, height: j.height, rgba: j.data };
  } catch {
    throw new Error("디코드 실패 (JPEG 손상 또는 비표준)");
  }
};

const resizeNearest = (src, srcW, srcH, dstW, dstH) => {
  const out = Buffer.alloc(dstW * dstH * 3);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.floor((y * srcH) / dstH);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x * srcW) / dstW);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 3;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
    }
  }
  return out;
};

export const decodeAndResize = async (rawPath) => {
  const filePath = normalizePath(rawPath);
  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.includes(ext)) {
    throw new Error("PNG/JPEG만 지원 (.png, .jpg, .jpeg)");
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`파일을 찾을 수 없음: ${filePath}`);
    }
    throw err;
  }

  if (!stat.isFile()) {
    throw new Error(`일반 파일이 아님: ${filePath}`);
  }
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `원본 파일 크기 초과 (${(stat.size / 1024 / 1024).toFixed(1)}MB > ${MAX_FILE_SIZE_MB}MB)`
    );
  }

  const buf = readFileSync(filePath);
  const decoded = ext === ".png" ? decodePng(buf) : decodeJpeg(buf);

  if (decoded.width * decoded.height > MAX_PIXELS) {
    throw new Error(
      `이미지 해상도 초과 (${decoded.width}x${decoded.height}, 최대 ${MAX_DIM}x${MAX_DIM})`
    );
  }
  if (decoded.width < MIN_SOURCE_SIZE || decoded.height < MIN_SOURCE_SIZE) {
    throw new Error(
      `이미지가 너무 작음 (${decoded.width}x${decoded.height}, 최소 ${MIN_SOURCE_SIZE}x${MIN_SOURCE_SIZE})`
    );
  }

  const rgb = resizeNearest(
    decoded.rgba,
    decoded.width,
    decoded.height,
    TARGET_SIZE,
    TARGET_SIZE
  );

  return { width: TARGET_SIZE, height: TARGET_SIZE, rgb };
};
