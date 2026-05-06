export const IMG_KIND = "img";
export const MAX_IMG_PAYLOAD_BYTES = 30 * 1024;
export const ALLOWED_W = 64;
export const ALLOWED_H = 64;

export const encodeImagePayload = ({ id, name, rgb, t, w, h }) => ({
  kind: IMG_KIND,
  id,
  n: name,
  t,
  w,
  h,
  rgb: rgb.toString("base64"),
});

export const decodeImagePayload = (obj) => {
  if (obj.kind !== IMG_KIND) {
    throw new Error(`잘못된 kind: ${obj.kind}`);
  }
  if (typeof obj.rgb !== "string" || !obj.rgb) {
    throw new Error("rgb 필드 누락");
  }
  if (obj.rgb.length > MAX_IMG_PAYLOAD_BYTES) {
    throw new Error(
      `payload 초과 (${obj.rgb.length} > ${MAX_IMG_PAYLOAD_BYTES})`
    );
  }
  const w = obj.w | 0;
  const h = obj.h | 0;
  if (w !== ALLOWED_W || h !== ALLOWED_H) {
    throw new Error(
      `허용되지 않은 크기 (expected ${ALLOWED_W}x${ALLOWED_H}, got ${w}x${h})`
    );
  }
  const rgb = Buffer.from(obj.rgb, "base64");
  if (rgb.length !== w * h * 3) {
    throw new Error(
      `RGB 길이 불일치 (expected ${w * h * 3}, got ${rgb.length})`
    );
  }
  return { id: obj.id, name: obj.n, rgb, w, h, t: obj.t };
};
