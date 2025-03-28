import fs from "fs";
import path from "path";
import GeoTIFF from "geotiff"; // npm install geotiff
import { PNG } from "pngjs";   // npm install pngjs

// ---- PARAMETERS ----
const DEM_TIF_PATH = "./assets/elevationMaps/master.tif";
const WINDOW_WIDTH = 100;
const WINDOW_HEIGHT = 100;
const UPSCALE_FACTOR = 8;
const CLIFF_THRESHOLD = 50;

// ---- INTERPOLATION FUNCTIONS ----
function bilinear(v00, v10, v01, v11, tx, ty) {
  const v0 = v00 * (1 - tx) + v10 * tx;
  const v1 = v01 * (1 - tx) + v11 * tx;
  return v0 * (1 - ty) + v1 * ty;
}

function interpolateDEM(dem, inWidth, inHeight, factor, threshold) {
  const outWidth = Math.floor(inWidth * factor);
  const outHeight = Math.floor(inHeight * factor);
  const outDEM = new Array(outHeight);
  for (let y = 0; y < outHeight; y++) {
    outDEM[y] = new Array(outWidth).fill(0);
  }
  for (let y = 0; y < outHeight; y++) {
    const origY = y / factor;
    const y0 = Math.floor(origY);
    const y1 = Math.min(y0 + 1, inHeight - 1);
    const ty = origY - y0;
    for (let x = 0; x < outWidth; x++) {
      const origX = x / factor;
      const x0 = Math.floor(origX);
      const x1 = Math.min(x0 + 1, inWidth - 1);
      const tx = origX - x0;
      const v00 = dem[y0][x0];
      const v10 = dem[y0][x1];
      const v01 = dem[y1][x0];
      const v11 = dem[y1][x1];
      const maxVal = Math.max(v00, v10, v01, v11);
      const minVal = Math.min(v00, v10, v01, v11);
      if ((maxVal - minVal) > threshold) {
        const nnx = Math.round(origX);
        const nny = Math.round(origY);
        outDEM[y][x] = dem[nny][nnx];
      } else {
        outDEM[y][x] = bilinear(v00, v10, v01, v11, tx, ty);
      }
    }
  }
  return outDEM;
}

function writeDEMToPNG(dem2d, outPath) {
  const height = dem2d.length;
  const width = dem2d[0].length;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) << 2;
      const v = Math.max(0, Math.min(255, Math.floor(dem2d[y][x])));
      png.data[idx] = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
    }
  }
  png.pack().pipe(fs.createWriteStream(outPath));
  console.log(`Output written to ${outPath}`);
}

// ---- MAIN PROCESSING FUNCTION ----
async function processFabdemInterpolation() {
  try {
    // Read the file into a Buffer and convert to ArrayBuffer
    const buffer = fs.readFileSync(DEM_TIF_PATH);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const demWidth = image.getWidth();
    const demHeight = image.getHeight();
    console.log(`Full DEM dimensions: ${demWidth} x ${demHeight}`);

    const startX = Math.floor((demWidth - WINDOW_WIDTH) / 2);
    const startY = Math.floor((demHeight - WINDOW_HEIGHT) / 2);
    const window = [startX, startY, startX + WINDOW_WIDTH, startY + WINDOW_HEIGHT];
    console.log(`Extracting window: [${startX}, ${startY}, ${startX + WINDOW_WIDTH}, ${startY + WINDOW_HEIGHT}]`);

    const data = await image.readRasters({ window });
    const demArray = data[0];
    const dem2d = [];
    for (let y = 0; y < WINDOW_HEIGHT; y++) {
      dem2d[y] = demArray.slice(y * WINDOW_WIDTH, y * WINDOW_WIDTH + WINDOW_WIDTH);
    }

    const outDEM = interpolateDEM(dem2d, WINDOW_WIDTH, WINDOW_HEIGHT, UPSCALE_FACTOR, CLIFF_THRESHOLD);
    const outWidth = WINDOW_WIDTH * UPSCALE_FACTOR;
    const outHeight = WINDOW_HEIGHT * UPSCALE_FACTOR;
    console.log(`Interpolated DEM dimensions: ${outWidth} x ${outHeight}`);

    const outputPath = path.join(process.cwd(), "interpolated_fabdem.png");
    writeDEMToPNG(outDEM, outputPath);
  } catch (err) {
    console.error("Error during interpolation:", err);
  }
}

processFabdemInterpolation();
