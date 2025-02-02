const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Define file paths
const overpassDataPath = path.join(__dirname, './data/river-nodes.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');
const outputImagePath = path.join(__dirname, './assets/images/ScotlandRiversMap.png');

// Color definitions
const SEA_COLOR = [255, 255, 255];   // White (original sea color)
const GREY = [169, 169, 169];        // Light grey for non-sea areas

// Load Overpass (GeoJSON) data
const loadOverpassData = () => {
    const rawData = fs.readFileSync(overpassDataPath);
    return JSON.parse(rawData);
};

// Helper function to apply a pixel color directly to image data
const applyColor = (pixels, width, x, y, color) => {
    if (x < 0 || y < 0 || x >= width) return; // Prevent out-of-bounds errors
    const index = (y * width + x) * 4;
    pixels[index] = color[0];      // Red
    pixels[index + 1] = color[1];  // Green
    pixels[index + 2] = color[2];  // Blue
    pixels[index + 3] = 255;       // Alpha (fully opaque)
};

// Lat/Lon to Pixel function
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

    return [Math.round(x_pixel), Math.round(y_pixel)];  // Force integer coordinates
};

// Generate distinct colors for rivers
const getRiverColor = (index) => {
    const baseColors = [
        [255, 0, 0],   // Red
        [0, 255, 0],   // Green
        [0, 0, 255],   // Blue
        [255, 255, 0], // Yellow
        [255, 165, 0], // Orange
        [128, 0, 128], // Purple
        [0, 255, 255], // Cyan
        [255, 20, 147] // Pink
    ];
    return baseColors[index % baseColors.length]; // Loop through colors
};

// Draw the rivers using precise pixel placement
const drawRivers = (ctx, features, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    features.forEach((feature, index) => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
            const coords = feature.geometry.coordinates; // [ [lon, lat], [lon, lat], ... ]
            const color = getRiverColor(index); // Assign a distinct color

            // Draw line by filling each pixel along the path
            for (let i = 0; i < coords.length - 1; i++) {
                const [lon1, lat1] = coords[i];
                const [lon2, lat2] = coords[i + 1];

                let [x1, y1] = latLongToPixelCustom(lat1, lon1);
                let [x2, y2] = latLongToPixelCustom(lat2, lon2);

                // Bresenham's Line Algorithm for precise pixel drawing
                let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
                let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
                let err = dx + dy, e2;

                while (true) {
                    applyColor(pixels, width, x1, y1, color);
                    if (x1 === x2 && y1 === y2) break;
                    e2 = 2 * err;
                    if (e2 >= dy) { err += dy; x1 += sx; }
                    if (e2 <= dx) { err += dx; y1 += sy; }
                }
            }
        }
    });

    ctx.putImageData(imageData, 0, 0);
};

// Process the image
const processImage = async () => {
    try {
        const overpassGeojson = loadOverpassData();
        const image = await loadImage(inputImagePath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = false;  // 🔴 **Disable Anti-Aliasing**

        // Draw the input image
        ctx.drawImage(image, 0, 0, image.width, image.height);

        // Step 1: Convert all non-white areas to light grey
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
            if (!(r === 255 && g === 255 && b === 255)) {
                applyColor(pixels, canvas.width, (i / 4) % canvas.width, Math.floor(i / (4 * canvas.width)), GREY);
            }
        }
        ctx.putImageData(imageData, 0, 0);

        // Step 2: Draw rivers with precise pixel colors
        drawRivers(ctx, overpassGeojson.features, canvas.width, canvas.height);

        // Save the final output
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputImagePath, buffer);
        console.log('✅ Image processed successfully:', outputImagePath);
    } catch (error) {
        console.error('❌ Error processing image:', error);
    }
};

processImage();
