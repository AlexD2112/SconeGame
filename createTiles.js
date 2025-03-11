const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const IMAGE_PATH = "./assets/images/ScotlandRegionsFinal.png";
const OUTPUT_PATH = "./assets/images/ScotlandRegionsFinal_Refined.png";
const SCALE_FACTOR = 4; // 4x upscale

// Main processing function
async function processHighQualityRefinement() {
  console.log("🚀 Starting high-quality refinement...");

  // Load and upscale image (nearest neighbor, no smoothing)
  const image = await loadImage(IMAGE_PATH);
  const originalWidth = image.width;
  const originalHeight = image.height;
  const newWidth = originalWidth * SCALE_FACTOR;
  const newHeight = originalHeight * SCALE_FACTOR;

  // Create an upscaled canvas and draw the pixelated image
  const canvas = createCanvas(newWidth, newHeight);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, newWidth, newHeight);
  
  // Get the upscaled pixel data
  const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
  const pixels = imageData.data;

  // Helper: Safely get pixel from the upscaled image
  function getPixel(x, y) {
    if (x < 0 || x >= newWidth || y < 0 || y >= newHeight) {
      return [255, 255, 255, 255]; // default white if out-of-bounds
    }
    const idx = (y * newWidth + x) * 4;
    return [
      pixels[idx],
      pixels[idx + 1],
      pixels[idx + 2],
      pixels[idx + 3]
    ];
  }

  // Helper: Compare two colors (ignoring alpha)
  function colorsEqual(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  }

  // Build a boundary mask over the upscaled image:
  // For each pixel, mark as true if any neighbor has a different color.
  const boundaryMask = Array.from({ length: newHeight }, () => Array(newWidth).fill(false));
  for (let y = 1; y < newHeight - 1; y++) {
    for (let x = 1; x < newWidth - 1; x++) {
      const base = getPixel(x, y);
      let isBoundary = false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = getPixel(x + dx, y + dy);
          if (!colorsEqual(base, neighbor)) {
            isBoundary = true;
            break;
          }
        }
        if (isBoundary) break;
      }
      boundaryMask[y][x] = isBoundary;
    }
  }
  console.log("✅ Boundary mask constructed.");

  // Trace a boundary contour from the boundary mask using a simple Moore-neighbor tracing algorithm.
  function traceBoundary(mask, startX, startY) {
    const height = mask.length;
    const width = mask[0].length;
    const contour = [];
    const visited = new Set();

    let current = [startX, startY];
    let prevDir = 0; // initial direction index
    const dirs = [
      [-1, -1], [ 0, -1], [1, -1],
      [1,  0],  [1,  1],  [0, 1],
      [-1, 1],  [-1, 0]
    ]; // Clockwise order

    do {
      contour.push(current);
      visited.add(current.join(","));
      let found = false;
      // Start checking from direction (prevDir - 1) mod 8
      for (let i = 0; i < dirs.length; i++) {
        const dirIndex = (prevDir + i + 7) % 8;
        const [dx, dy] = dirs[dirIndex];
        const nx = current[0] + dx;
        const ny = current[1] + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (mask[ny][nx]) {
          current = [nx, ny];
          prevDir = dirIndex;
          found = true;
          break;
        }
      }
      if (!found) break;
    } while (current.join(",") !== [startX, startY].join(",") && contour.length < 10000);

    return contour;
  }

  // Find a starting point for the contour (first boundary pixel found)
  let start = null;
  for (let y = 0; y < newHeight && !start; y++) {
    for (let x = 0; x < newWidth && !start; x++) {
      if (boundaryMask[y][x]) {
        start = [x, y];
      }
    }
  }
  if (!start) {
    console.log("No boundary found.");
    return;
  }
  const contour = traceBoundary(boundaryMask, start[0], start[1]);
  console.log(`Detected contour with ${contour.length} points.`);

  // Optionally, you might simplify the contour here using an algorithm like Ramer-Douglas-Peucker.
  // For simplicity, we'll proceed with the raw contour.

  // Draw smooth curves through the contour using quadratic Bézier curves.
  // We'll split the contour into segments and use each segment's midpoint as control points.
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (contour.length >= 3) {
    // Move to first point
    ctx.moveTo(contour[0][0], contour[0][1]);
    // For each group of 3 points, use quadraticCurveTo:
    for (let i = 1; i < contour.length - 1; i += 2) {
      const cp = contour[i]; // control point
      const ep = contour[i + 1]; // end point
      ctx.quadraticCurveTo(cp[0], cp[1], ep[0], ep[1]);
    }
    // Optionally, close the contour:
    ctx.closePath();
  }
  ctx.stroke();
  console.log("✅ Bézier curve drawn over contour.");

  // Save the final image with the overlay.
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log(`✅ Final refined image saved to: ${OUTPUT_PATH}`);
}

processHighQualityRefinement();
