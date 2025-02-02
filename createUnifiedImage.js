const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Define file paths
const overpassDataPath = path.join(__dirname, './data/river-nodes.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandCitiesMap.png');
const inputImagePath2 = path.join(__dirname, './assets/images/ScotlandRiversMap.png');
const outputImagePath = path.join(__dirname, './assets/images/ScotlandUnifiedMap.png');

// Color definitions

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


// Process the image
const processImage = async () => {
    try {
        // Everyywhere there's a non white, non grey pixel on ScotlandRiversMap, put a pixel of that color on ScotlandCitiesMap
        const riverData = loadOverpassData();
        const image = await loadImage(inputImagePath);
        const image2 = await loadImage(inputImagePath2);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const canvas2 = createCanvas(image2.width, image2.height);
        const ctx2 = canvas2.getContext('2d');
        ctx2.drawImage(image2, 0, 0, image2.width, image2.height);
        const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
        const pixels2 = imageData2.data;
        for (let i = 0; i < pixels2.length; i += 4) {
            const r = pixels2[i];
            const g = pixels2[i + 1];
            const b = pixels2[i + 2];
            if (!(r == 255 && g == 255 && b == 255) && !(r == 169, g == 169, b == 169)) {
                pixels[i] = r;
                pixels[i + 1] = g;
                pixels[i + 2] = b;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        //Save the image
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputImagePath, buffer);
        console.log('✅ Image processing complete!');
    } catch (error) {
        console.error('❌ Error processing image:', error);
    }
};

processImage();
