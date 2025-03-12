const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const cliProgress = require("cli-progress");

// File paths
const IMAGE_PATH = "./assets/images/ScotlandRegionsFinal.png";
const UPSCALED_IMAGE_PATH = "./assets/images/ScotlandRegionsFinal_Upscaled.png";
const FINAL_PATH = "./assets/images/ScotlandRegionsFinal_Refined.png";
const BORDERS_PATH = "./data/british-boundaries.json";

const SCALE_FACTOR = 4; // 4x upscale

const latLongToPixelCustom = (latitude, longitude) => {
  const interceptX = -3081.148;
  const interceptY = 8073.893;

  const coefficientsX = [-5.40e-07, 268.2856, 472.7847, -5.2413, -8.2911, -1.6347, 0.03218, 0.04388, 0.02912, -0.00457];
  const coefficientsY = [-2.71e-07, 134.4546, 236.9145, -7.21995, -8.89493, -2.73564, 0.04395, 0.08062, 0.03345, 0.00779];

  let x_pixel = interceptX +
    coefficientsX[0] * 1 +
    coefficientsX[1] * latitude +
    coefficientsX[2] * longitude +
    coefficientsX[3] * (latitude ** 2) +
    coefficientsX[4] * latitude * longitude +
    coefficientsX[5] * (longitude ** 2) +
    coefficientsX[6] * (latitude ** 3) +
    coefficientsX[7] * (latitude ** 2) * longitude +
    coefficientsX[8] * latitude * (longitude ** 2) +
    coefficientsX[9] * (longitude ** 3);

  let y_pixel = interceptY +
    coefficientsY[0] * 1 +
    coefficientsY[1] * latitude +
    coefficientsY[2] * longitude +
    coefficientsY[3] * (latitude ** 2) +
    coefficientsY[4] * latitude * longitude +
    coefficientsY[5] * (longitude ** 2) +
    coefficientsY[6] * (latitude ** 3) +
    coefficientsY[7] * (latitude ** 2) * longitude +
    coefficientsY[8] * latitude * (longitude ** 2) +
    coefficientsY[9] * (longitude ** 3);

  return [Math.round(x_pixel), Math.round(y_pixel)];
};

// **Step 1: Load and Process Image**
async function upscaleAndSmoothImage() {
  console.log("🚀 Upscaling image with smoothing...");

  // Load original image
  const image = await loadImage(IMAGE_PATH);
  const originalWidth = image.width;
  const originalHeight = image.height;
  const newWidth = originalWidth * SCALE_FACTOR;
  const newHeight = originalHeight * SCALE_FACTOR;

  // Create a high-resolution blank canvas for upscaled image
  const canvas = createCanvas(newWidth, newHeight);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false; // Ensure no blurring

  // Draw original image pixelated
  ctx.drawImage(image, 0, 0, newWidth, newHeight);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
  const pixels = imageData.data;

  // Function to get pixel color safely
  function getPixel(x, y) {
    if (x < 0 || x >= newWidth || y < 0 || y >= newHeight) {
      return [255, 255, 255, 255]; // Default to white for out-of-bounds
    }
    const index = (y * newWidth + x) * 4;
    return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
  }

  // Function to check if a pixel is an edge pixel
  function isBoundaryPixel(x, y) {
    const baseColor = getPixel(x, y);
    let distinctColors = new Set();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue; // Skip self
        const neighborColor = getPixel(x + dx, y + dy);
        distinctColors.add(neighborColor.join(","));
      }
    }
    return distinctColors.size > 1; // More than 1 color in neighborhood = boundary
  }

  // **Step 2: Apply Nearest Neighbor Smoothing to Boundaries**
  console.log("🚀 Smoothing inter-region boundaries...");

  const updatedPixels = new Map(); // Store new values for boundary pixels

  for (let y = 1; y < newHeight - 1; y++) {
    for (let x = 1; x < newWidth - 1; x++) {
      if (isBoundaryPixel(x, y)) {
        // Find the most common neighboring color
        let colorCounts = {};
        let maxCount = 0;
        let dominantColor = getPixel(x, y); // Default to original

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue; // Skip center pixel
            const neighborColor = getPixel(x + dx, y + dy);

            // Convert RGB to a string key
            const colorKey = neighborColor.join(",");
            if (!colorCounts[colorKey]) colorCounts[colorKey] = 0;
            colorCounts[colorKey]++;

            // Track the most common color
            if (colorCounts[colorKey] > maxCount) {
              maxCount = colorCounts[colorKey];
              dominantColor = neighborColor;
            }
          }
        }

        // Store updated pixel color
        updatedPixels.set(`${x},${y}`, dominantColor);
      }
    }
  }

  console.log(`🎨 Smoothed ${updatedPixels.size} boundary pixels.`);

  // Apply pixel changes
  updatedPixels.forEach((color, key) => {
    const [x, y] = key.split(",").map(Number);
    const index = (y * newWidth + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = 255;
  });

  // Apply updated pixel data
  ctx.putImageData(imageData, 0, 0);

  // Save the upscaled image
  fs.writeFileSync(UPSCALED_IMAGE_PATH, canvas.toBuffer("image/png"));
  // console.log(✅ Smoothed upscaled image saved: ${UPSCALED_IMAGE_PATH});

  return UPSCALED_IMAGE_PATH;
}

// **Step 1: Load GeoJSON Boundaries**
const boundariesData = JSON.parse(fs.readFileSync(BORDERS_PATH, "utf-8"));

// **Step 2: Apply Water Boundaries Using GeoJSON**
async function applyBorders() {
  const OUTPUT_PATH = FINAL_PATH;
  console.log("🌊 Applying water boundaries...");

  // Load the upscaled image
  const image = await loadImage(UPSCALED_IMAGE_PATH);
  const width = image.width;
  const height = image.height;

  // Create a canvas for the new processed map
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Draw the base upscaled image
  ctx.drawImage(image, 0, 0, width, height);

  // Ensure everything is initially visible
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0, 0, 0, 1)"; // Fully opaque base
  ctx.fillRect(0, 0, width, height);

  // Convert everything outside the land boundary to transparent
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "black"; // Used for masking land areas

  const progressBar = new cliProgress.SingleBar({
    format: "Processing polygons [{bar}] {percentage}% | {value}/{total} polygons",
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true
  });

  const totalPolygons = boundariesData.features.length;
  progressBar.start(totalPolygons, 0);

  // **Function to trace the land boundary**
  const traceLandBoundary = (coordinates) => {
    coordinates.forEach((ring) => {
      ctx.beginPath();
      ring.forEach(([lon, lat], index) => {
        const [x, y] = latLongToPixelCustom(lat, lon);

        // Adjust scaling to fit the upscaled map
        const scaledX = Math.round((x / 971) * width);
        const scaledY = Math.round((y / 1062) * height);

        if (isNaN(scaledX) || isNaN(scaledY)) return; // Skip invalid coords

        if (index === 0) {
          ctx.moveTo(scaledX, scaledY);
        } else {
          ctx.lineTo(scaledX, scaledY);
        }
      });
      ctx.closePath();
      ctx.fill();
    });
  };

  // **Step 2: Apply Mask for Non-Land Areas**
  boundariesData.features.forEach((feature, index) => {
    if (!feature.geometry) return;

    if (feature.geometry.type === "Polygon") {
      traceLandBoundary(feature.geometry.coordinates);
    } else if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates.forEach((polygon) => {
        traceLandBoundary(polygon);
      });
    }
    // Update progress bar
    progressBar.update(index + 1);
  });

  // Stop progress bar
  progressBar.stop();
  // Restore normal drawing mode
  ctx.globalCompositeOperation = "source-over";

  // **Step 3: Save the Processed Image**
  fs.writeFileSync(OUTPUT_PATH, canvas.toBuffer("image/png"));
  console.log(`✅ Adjusted land-only map saved: ${OUTPUT_PATH}`);
}


// **Run Full Processing**
async function processHighQualityRefinement() {
  console.log("🚀 Starting high-quality region refinement...");
  // await upscaleAndSmoothImage();
  await applyBorders();
  console.log("🎉 High-quality refinement complete!");
}

processHighQualityRefinement();