export const HALF_BLOCK = "▀";
export const RESET = "\x1b[0m";

const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

export const renderImage = (rgb, width, height) => {
  if (height % 2 !== 0) {
    throw new Error(`height는 짝수여야 함 (got ${height})`);
  }
  if (rgb.length !== width * height * 3) {
    throw new Error(
      `RGB buffer 길이 불일치 (expected ${width * height * 3}, got ${rgb.length})`
    );
  }
  const lines = [];
  for (let y = 0; y < height; y += 2) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const topI = (y * width + x) * 3;
      const botI = ((y + 1) * width + x) * 3;
      line +=
        fg(rgb[topI], rgb[topI + 1], rgb[topI + 2]) +
        bg(rgb[botI], rgb[botI + 1], rgb[botI + 2]) +
        HALF_BLOCK;
    }
    lines.push(line + RESET);
  }
  return lines.join("\n");
};
