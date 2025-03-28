const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { kdTree } = require("kd-tree-javascript");
const numeric = require("numeric");
const cluster = require("cluster");
const os = require("os");

// --------------------
// FILE PATHS & CONSTANTS
// --------------------
const IMAGE_PATH = "./assets/images/ScotlandRegionsFinal.png";
const UPSCALED_IMAGE_PATH = "./assets/images/ScotlandRegionsFinal_Upscaled.png";
const FINAL_PATH = "./assets/images/ScotlandRegionsFinal_Refined.png";
const LAND_ONLY_PATH = "./assets/images/ScotlandLandOnly_Upscaled.png";  // Detailed bordered Scotland (black land)
const BORDERS_PATH = "./data/british-boundaries.json";
const MAP_DATA_PATH = path.join(__dirname, "./data/map-data.json");
const RAW_DIR = path.join(__dirname, "./data/tiles/raw");

const SCALE_FACTOR = 4; // 4x upscale

// Zoom level configurations (in terms of original pixels):
// Level 0: full region tile
// Level 1: 128 original (512 upscaled)
// Level 2: 32 original (128 upscaled)
// Level 3: 4 original (16 upscaled) for extra zoom.
const zoomLevels = [
    { z: 0, tileSize: null },
    { z: 1, tileSize: 128 },
    { z: 2, tileSize: 32 },
    { z: 3, tileSize: 4 }
];

// --------------------
// HELPER FUNCTIONS
// --------------------
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

const getColorKey = (r, g, b) => `${r}${g}${b}`;

function toRadians(deg) {
    return deg * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in metres
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);
    const a = Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function findTilePixelResolutions(tlx, tly, brx, bry) {
    const [topLeftLat, topLeftLong] = pixelToLatLong(tlx, tly);
    const [topRightLat, topRightLong] = pixelToLatLong(brx, tly);
    const [bottomLeftLat, bottomLeftLong] = pixelToLatLong(tlx, bry);
    const [bottomRightLat, bottomRightLong] = pixelToLatLong(brx, bry);

    const topHorizontal = haversineDistance(topLeftLat, topLeftLong, topRightLat, topRightLong);
    const bottomHorizontal = haversineDistance(bottomLeftLat, bottomLeftLong, bottomRightLat, bottomRightLong);
    const leftVertical = haversineDistance(topLeftLat, topLeftLong, bottomLeftLat, bottomLeftLong);
    const rightVertical = haversineDistance(topRightLat, topRightLong, bottomRightLat, bottomRightLong);

    const horizontalResolution = (topHorizontal + bottomHorizontal) / 2;
    const verticalResolution = (leftVertical + rightVertical) / 2;

    console.log(`Horizontal resolution: ${horizontalResolution} m/pixel`);
    console.log(`Vertical resolution: ${verticalResolution} m/pixel`);
    console.log(`Horizontal percent error: ${Math.abs(topHorizontal - bottomHorizontal) / topHorizontal * 100}%`);
    console.log(`Vertical percent error: ${Math.abs(leftVertical - rightVertical) / leftVertical * 100}%`);

    const horizontalPerPixel = horizontalResolution / 1024;
    const verticalPerPixel = verticalResolution / 1024;
    console.log(`Horizontal per pixel resolution: ${horizontalPerPixel} m/pixel`);
    console.log(`Vertical per pixel resolution: ${verticalPerPixel} m/pixel`);
}

// --------------------
// GEOMETRIC CONVERSION FUNCTIONS
// --------------------
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

    return [x_pixel, y_pixel];
};

function pixelToLatLong(targetX, targetY, initialGuess = [55, -3]) {
    function errorFunction(latlon) {
        const [lat, lon] = latlon;
        const [calcX, calcY] = latLongToPixelCustom(lat, lon);
        return [calcX - targetX, calcY - targetY];
    }
    const squaredError = (latlon) => {
        const err = errorFunction(latlon);
        return err[0] * err[0] + err[1] * err[1];
    };
    const result = numeric.uncmin(squaredError, initialGuess);
    return result.solution;
}

async function upscaleAndSmoothImage() {
    console.log("🚀 Upscaling image with smoothing...");

    const image = await loadImage(IMAGE_PATH);
    const originalWidth = image.width;
    const originalHeight = image.height;
    const newWidth = originalWidth * SCALE_FACTOR;
    const newHeight = originalHeight * SCALE_FACTOR;

    const canvas = createCanvas(newWidth, newHeight);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, newWidth, newHeight);
    const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
    const pixels = imageData.data;

    function getPixel(x, y) {
        if (x < 0 || x >= newWidth || y < 0 || y >= newHeight) {
            return [255, 255, 255, 255];
        }
        const index = (y * newWidth + x) * 4;
        return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    }

    function isBoundaryPixel(x, y) {
        const baseColor = getPixel(x, y);
        let distinctColors = new Set();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const neighborColor = getPixel(x + dx, y + dy);
                distinctColors.add(neighborColor.join(","));
            }
        }
        return distinctColors.size > 1;
    }

    console.log("🚀 Smoothing inter-region boundaries...");
    const updatedPixels = new Map();
    for (let y = 1; y < newHeight - 1; y++) {
        for (let x = 1; x < newWidth - 1; x++) {
            if (isBoundaryPixel(x, y)) {
                let colorCounts = {};
                let maxCount = 0;
                let dominantColor = getPixel(x, y);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const neighborColor = getPixel(x + dx, y + dy);
                        const colorKey = neighborColor.join(",");
                        if (!colorCounts[colorKey]) colorCounts[colorKey] = 0;
                        colorCounts[colorKey]++;
                        if (colorCounts[colorKey] > maxCount) {
                            maxCount = colorCounts[colorKey];
                            dominantColor = neighborColor;
                        }
                    }
                }
                updatedPixels.set(`${x},${y}`, dominantColor);
            }
        }
    }
    console.log(`🎨 Smoothed ${updatedPixels.size} boundary pixels.`);
    updatedPixels.forEach((color, key) => {
        const [x, y] = key.split(",").map(Number);
        const index = (y * newWidth + x) * 4;
        pixels[index] = color[0];
        pixels[index + 1] = color[1];
        pixels[index + 2] = color[2];
        pixels[index + 3] = 255;
    });
    ctx.putImageData(imageData, 0, 0);
    fs.writeFileSync(UPSCALED_IMAGE_PATH, canvas.toBuffer("image/png"));
    return UPSCALED_IMAGE_PATH;
}

const LAND_COLOR = [0, 0, 0];

async function createBorders() {
    const inputImagePath = UPSCALED_IMAGE_PATH;
    const outputImagePath = LAND_ONLY_PATH;
    const image = await loadImage(inputImagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `rgb(255, 255, 255)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgb(${LAND_COLOR.join(',')})`;

    const boundariesData = JSON.parse(fs.readFileSync(BORDERS_PATH, 'utf-8'));
    boundariesData.features.forEach(feature => {
        if (!feature.geometry) return;
        const geometry = feature.geometry;
        const drawPolygon = (coordinates) => {
            coordinates.forEach(ring => {
                ctx.beginPath();
                ring.forEach((coord, index) => {
                    if (!Array.isArray(coord) || coord.length < 2) return;
                    let [x, y] = latLongToPixelCustom(coord[1], coord[0]);
                    x *= SCALE_FACTOR;
                    y *= SCALE_FACTOR;
                    if (isNaN(x) || isNaN(y)) return;
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.closePath();
                ctx.fill();
            });
        };
        if (geometry.type === "Polygon") {
            drawPolygon(geometry.coordinates);
        } else if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach(polygon => {
                drawPolygon(polygon);
            });
        }
    });

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) {
            pixels[i] = LAND_COLOR[0];
            pixels[i + 1] = LAND_COLOR[1];
            pixels[i + 2] = LAND_COLOR[2];
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputImagePath, buffer);
    console.log('Scotland land map generated:', outputImagePath);
}

async function applyBorders() {
    console.log("🚀 Applying land borders...");
    const OUTPUT_PATH = FINAL_PATH;
    function distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }
    try {
        const [landImage, regionImage] = await Promise.all([
            loadImage(LAND_ONLY_PATH),
            loadImage(UPSCALED_IMAGE_PATH)
        ]);
        const width = landImage.width;
        const height = landImage.height;
        const landCanvas = createCanvas(width, height);
        const landCtx = landCanvas.getContext("2d");
        landCtx.drawImage(landImage, 0, 0);
        const landData = landCtx.getImageData(0, 0, width, height);
        const regionCanvas = createCanvas(width, height);
        const regionCtx = regionCanvas.getContext("2d");
        regionCtx.drawImage(regionImage, 0, 0);
        const regionData = regionCtx.getImageData(0, 0, width, height);
        const outputCanvas = createCanvas(width, height);
        const outputCtx = outputCanvas.getContext("2d");
        const outputData = outputCtx.createImageData(width, height);
        let regionPixels = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = regionData.data[idx];
                const g = regionData.data[idx + 1];
                const b = regionData.data[idx + 2];
                if (!(r === 255 && g === 255 && b === 255)) {
                    regionPixels.push({ x, y, color: [r, g, b] });
                }
            }
        }
        console.log(`Found ${regionPixels.length} colored region pixels.`);
        const kdTreeInstance = new kdTree(regionPixels, distance, ["x", "y"]);
        for (let y = 0; y < height; y++) {
            console.log(`Processing row ${y} of ${height}`);
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const lr = landData.data[idx];
                const lg = landData.data[idx + 1];
                const lb = landData.data[idx + 2];
                if (lr === 0 && lg === 0 && lb === 0) {
                    const nearest = kdTreeInstance.nearest({ x, y }, 1);
                    let nearestColor = [0, 0, 0];
                    if (nearest.length > 0) {
                        nearestColor = nearest[0][0].color;
                    }
                    outputData.data[idx] = nearestColor[0];
                    outputData.data[idx + 1] = nearestColor[1];
                    outputData.data[idx + 2] = nearestColor[2];
                    outputData.data[idx + 3] = 255;
                } else {
                    outputData.data[idx] = 255;
                    outputData.data[idx + 1] = 255;
                    outputData.data[idx + 2] = 255;
                    outputData.data[idx + 3] = 255;
                }
            }
        }
        outputCtx.putImageData(outputData, 0, 0);
        fs.writeFileSync(OUTPUT_PATH, outputCanvas.toBuffer("image/png"));
        console.log(`ScotlandRegionsFinal_Refined.png generated at: ${OUTPUT_PATH}`);
    } catch (error) {
        console.error("Error generating refined map:", error);
    }
}

// --------------------
// TILE PYRAMID GENERATION FUNCTION
// --------------------
async function createRegionsTiles(regionName) {
    console.log(`🚀 Generating tiles for region: ${regionName}...`);

    // Load map-data and get target region's color.
    const mapData = JSON.parse(fs.readFileSync(MAP_DATA_PATH, "utf-8")).regions;
    let targetColor = null;
    for (const [colorKey, region] of Object.entries(mapData)) {
        if (region.name === regionName) {
            targetColor = colorKey.match(/\d{3}/g).map(Number);
            break;
        }
    }
    if (!targetColor) {
        console.error(`❌ Region "${regionName}" not found in map-data.`);
        return;
    }
    console.log(`🎨 Target region color: ${targetColor}`);

    // Load the full refined upscaled image (containing all regions)
    const fullImage = await loadImage(FINAL_PATH);
    const fullWidth = fullImage.width;
    const fullHeight = fullImage.height;
    console.log(`Full image dimensions: ${fullWidth} x ${fullHeight}`);

    const fullCanvas = createCanvas(fullWidth, fullHeight);
    const fullCtx = fullCanvas.getContext("2d");
    fullCtx.drawImage(fullImage, 0, 0);
    const fullImageData = fullCtx.getImageData(0, 0, fullWidth, fullHeight);
    const fullPixels = fullImageData.data;

    // Compute bounding box (in upscaled pixels) for the target region.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < fullHeight; y++) {
        for (let x = 0; x < fullWidth; x++) {
            const idx = (y * fullWidth + x) * 4;
            const r = fullPixels[idx], g = fullPixels[idx + 1], b = fullPixels[idx + 2];
            if (getColorKey(r, g, b) === getColorKey(...targetColor)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (minX === Infinity) {
        console.error("❌ No pixels found for the target region.");
        return;
    }
    console.log(`📌 Bounding box (upscaled): X(${minX}-${maxX}), Y(${minY}-${maxY})`);

    // Compute top-left pixel in original coordinates.
    const originalX = minX / SCALE_FACTOR;
    const originalY = minY / SCALE_FACTOR;
    console.log(`🗺️ Top-left original pixel: X=${originalX}, Y=${originalY}`);

    // --- Level 0: Save full region as single tile ---
    const regionTileWidth = maxX - minX + 1;
    const regionTileHeight = maxY - minY + 1;
    const regionCanvas = createCanvas(regionTileWidth, regionTileHeight);
    const regionCtx = regionCanvas.getContext("2d");
    const regionImageData = regionCtx.createImageData(regionTileWidth, regionTileHeight);
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const srcIdx = (y * fullWidth + x) * 4;
            const destX = x - minX;
            const destY = y - minY;
            const destIdx = (destY * regionTileWidth + destX) * 4;
            const r = fullPixels[srcIdx], g = fullPixels[srcIdx + 1], b = fullPixels[srcIdx + 2];
            if (getColorKey(r, g, b) === getColorKey(...targetColor)) {
                regionImageData.data[destIdx] = r;
                regionImageData.data[destIdx + 1] = g;
                regionImageData.data[destIdx + 2] = b;
                regionImageData.data[destIdx + 3] = 255;
            } else {
                regionImageData.data[destIdx] = 0;
                regionImageData.data[destIdx + 1] = 0;
                regionImageData.data[destIdx + 2] = 0;
                regionImageData.data[destIdx + 3] = 0;
            }
        }
    }
    regionCtx.putImageData(regionImageData, 0, 0);
    const level0Folder = path.join(RAW_DIR, regionName, "0", "0", "0");
    ensureDir(level0Folder);
    const level0Filename = `${regionName}_${originalX}_${originalY}_0.png`;
    const level0Path = path.join(level0Folder, level0Filename);
    fs.writeFileSync(level0Path, regionCanvas.toBuffer("image/png"));
    console.log(`✅ Level 0 tile saved: ${level0Path}`);

    // --- Levels 1, 2, 3: Generate tiles using universal grid ---
    // Tile sizes in original pixels: Level 1: 128, Level 2: 32, Level 3: 4
    const levelTileSizes = {
        1: 128,
        2: 32,
        3: 4
    };

    const origMinX = minX / SCALE_FACTOR;
    const origMinY = minY / SCALE_FACTOR;
    const origMaxX = (maxX + 1) / SCALE_FACTOR; // exclusive
    const origMaxY = (maxY + 1) / SCALE_FACTOR; // exclusive

    for (let z = 0; z < 4; z++) {
        if (z === 0) continue;
        const currentOrigTileSize = levelTileSizes[z];
        const currentUpTileSize = currentOrigTileSize * SCALE_FACTOR;

        const gridStartX = Math.floor(origMinX / currentOrigTileSize) * currentOrigTileSize;
        const gridStartY = Math.floor(origMinY / currentOrigTileSize) * currentOrigTileSize;
        const gridEndX = Math.ceil(origMaxX / currentOrigTileSize) * currentOrigTileSize;
        const gridEndY = Math.ceil(origMaxY / currentOrigTileSize) * currentOrigTileSize;

        const tilesX = (gridEndX - gridStartX) / currentOrigTileSize;
        const tilesY = (gridEndY - gridStartY) / currentOrigTileSize;
        console.log(`🔹 Zoom Level ${z}: ${tilesX} columns x ${tilesY} rows, tile size = ${currentUpTileSize} upscaled pixels (${currentOrigTileSize} original)`);

        for (let tx = 0; tx < tilesX; tx++) {
            for (let ty = 0; ty < tilesY; ty++) {
                const tileOrigX = gridStartX + tx * currentOrigTileSize;
                const tileOrigY = gridStartY + ty * currentOrigTileSize;
                const tileUpX = tileOrigX * SCALE_FACTOR;
                const tileUpY = tileOrigY * SCALE_FACTOR;

                let tileW = currentUpTileSize;
                let tileH = currentUpTileSize;
                if (tileUpX + tileW > fullWidth) tileW = fullWidth - tileUpX;
                if (tileUpY + tileH > fullHeight) tileH = fullHeight - tileUpY;

                const tileCanvas = createCanvas(tileW, tileH);
                const tileCtx = tileCanvas.getContext("2d");
                tileCtx.drawImage(fullImage, tileUpX, tileUpY, tileW, tileH, 0, 0, tileW, tileH);

                const tileImageData = tileCtx.getImageData(0, 0, tileW, tileH);
                const tilePixels = tileImageData.data;
                for (let i = 0; i < tilePixels.length; i += 4) {
                    const r = tilePixels[i], g = tilePixels[i + 1], b = tilePixels[i + 2];
                    if (getColorKey(r, g, b) !== getColorKey(...targetColor)) {
                        tilePixels[i + 3] = 0;
                    }
                }
                tileCtx.putImageData(tileImageData, 0, 0);

                let hasContent = false;
                for (let i = 3; i < tilePixels.length; i += 4) {
                    if (tilePixels[i] !== 0) {
                        hasContent = true;
                        break;
                    }
                }
                if (!hasContent) continue;

                let finalCanvas = tileCanvas;
                if (z > 0) {
                    finalCanvas = createCanvas(1024, 1024);
                    const finalCtx = finalCanvas.getContext("2d");
                    finalCtx.imageSmoothingEnabled = false;
                    finalCtx.drawImage(tileCanvas, 0, 0, 1024, 1024);
                }

                const tileFolder = path.join(RAW_DIR, regionName, `${z}`, `${tileOrigX}`, `${tileOrigY}`);
                ensureDir(tileFolder);
                const tileFileName = `${regionName}_${tileOrigX}_${tileOrigY}_${z}.png`;
                const tileFilePath = path.join(tileFolder, tileFileName);
                fs.writeFileSync(tileFilePath, finalCanvas.toBuffer("image/png"));
            }
        }
    }

    console.log(`✅ Finished generating tiles for region: ${regionName}`);
}

// --------------------
// CLUSTERING FOR PARALLEL TILE GENERATION
// --------------------
// if (cluster.isMaster) {
//     async function createAllRegionTiles() {
//         console.log("🚀 Starting tile generation for all regions (via clustering)...");
//         const mapData = JSON.parse(fs.readFileSync(MAP_DATA_PATH, "utf-8")).regions;
//         const regionNames = Object.keys(mapData).map(key => mapData[key].name);
//         regionNames.forEach(regionName => {
//             const worker = cluster.fork({ REGION_NAME: regionName });
//             worker.on("message", (msg) => console.log(msg));
//         });
//         cluster.on("exit", (worker, code, signal) => {
//             console.log(`Worker ${worker.process.pid} exited with code ${code}`);
//         });
//     }
//     createAllRegionTiles().then(() => {
//         console.log("🎉 All region tiles generated!");
//     });
// } else {
//     const regionName = process.env.REGION_NAME;
//     createRegionsTiles(regionName)
//         .then(() => {
//             process.send(`Finished tile generation for ${regionName}`);
//             process.exit();
//         })
//         .catch(err => {
//             process.send(`Error for ${regionName}: ${err.message}`);
//             process.exit(1);
//         });
// }

// --------------------
// PROCESS HIGH QUALITY REFINEMENT
// --------------------
async function processHighQualityRefinement() {
    console.log("🚀 Starting high-quality region refinement...");
    // Optionally run upscaleAndSmoothImage() and createBorders() here.
    // await upscaleAndSmoothImage();
    // await createBorders();
    // await applyBorders();
    // With clustering, tile generation is handled by cluster workers.
    // The master process will launch a worker for each region.
}

findTilePixelResolutions(632, 552, 640, 560);

// processHighQualityRefinement();

// if (cluster.isMaster) {
//     processHighQualityRefinement();
// }
