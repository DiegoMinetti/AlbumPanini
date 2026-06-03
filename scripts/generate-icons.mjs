/**
 * Generate PWA PNG icons without any image dependencies.
 *
 * Encodes valid PNGs from raw RGBA pixels using Node's built-in zlib. The
 * artwork is a simple, recognizable mark: a dark rounded square with a blue
 * disc and a white inner ring (a stylized sticker). Run with `npm run icons`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// --- minimal PNG encoder ----------------------------------------------------
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression, filter, interlace = 0

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- artwork ----------------------------------------------------------------
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const pad = maskable ? size * 0.1 : 0; // safe area for maskable
  const radius = (size - pad * 2) / 2;
  const discR = radius * 0.62;
  const ringR = radius * 0.34;
  const corner = size * 0.22;

  const BG = [15, 23, 42]; // #0f172a
  const DISC = [37, 99, 235]; // brand-600
  const RING = [255, 255, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // rounded-square background mask
      const inX = Math.abs(dx) <= size / 2 - corner;
      const inY = Math.abs(dy) <= size / 2 - corner;
      const cornerDist = Math.hypot(
        Math.abs(dx) - (size / 2 - corner),
        Math.abs(dy) - (size / 2 - corner)
      );
      const insideBg =
        inX || inY ? true : cornerDist <= corner;

      let color = null;
      if (insideBg) color = BG;
      if (dist <= discR) color = DISC;
      if (Math.abs(dist - ringR) <= size * 0.03) color = RING;

      if (color) {
        rgba[i] = color[0];
        rgba[i + 1] = color[1];
        rgba[i + 2] = color[2];
        rgba[i + 3] = 255;
      } else {
        rgba[i + 3] = 0; // transparent outside rounded square
      }
    }
  }
  // subtle vertical gradient on background for depth
  for (let y = 0; y < size; y++) {
    const t = y / size;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (rgba[i + 3] === 255 && rgba[i] === BG[0] && rgba[i + 1] === BG[1]) {
        rgba[i] = lerp(BG[0], 30, t);
        rgba[i + 1] = lerp(BG[1], 41, t);
        rgba[i + 2] = lerp(BG[2], 59, t);
      }
    }
  }
  return rgba;
}

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const target of targets) {
  const rgba = drawIcon(target.size, { maskable: target.maskable });
  const png = encodePng(target.size, target.size, rgba);
  const dest =
    target.name === 'apple-touch-icon.png'
      ? join(__dirname, '..', 'public', target.name)
      : join(outDir, target.name);
  writeFileSync(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes)`);
}
