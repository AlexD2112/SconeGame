const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// File paths
const boundariesPath = path.join(__dirname, './data/british-boundaries.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');
const outputImagePath = path.join(__dirname, './assets/images/ScotlandLandOnly.png');

// Define land color
const LAND_COLOR = [0, 0, 0]; // Black for land

// Load boundary data
const boundariesData = JSON.parse(fs.readFileSync(boundariesPath, 'utf-8'));

// Lat/Long to Pixel Conversion Function (Strict Mapping)
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

// Process the image and draw land pixels
const processImage = async () => {
    try {
        // Load the input image
        const image = await loadImage(inputImagePath);

        // Create a canvas with the same size as the image
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Fill the background white
        ctx.fillStyle = `rgb(255, 255, 255)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set land color
        ctx.fillStyle = `rgb(${LAND_COLOR.join(',')})`;

        // Loop through OSM boundaries and fill land pixels
        boundariesData.features.forEach(feature => {
            if (!feature.geometry) return;

            const geometry = feature.geometry;
            const drawPolygon = (coordinates) => {
                coordinates.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((coord, index) => {
                        if (!Array.isArray(coord) || coord.length < 2) return;
                        const [x, y] = latLongToPixelCustom(coord[1], coord[0]); // Ensure correct order
                        if (isNaN(x) || isNaN(y)) return;  // Skip bad coordinates

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

        // Get image data and convert non-white pixels to LAND_COLOR
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

        // Save the processed image
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputImagePath, buffer);

        console.log('Scotland land map generated:', outputImagePath);
    } catch (error) {
        console.error('Error processing image:', error.message);
    }
};

processImage();
