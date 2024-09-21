const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Define file paths
const mapDataPath = path.join(__dirname, './data/map-data.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');
const outputImagePath = path.join(__dirname, './assets/images/ScotlandMap.png');

// Color definitions
const SEA_COLOR = [255, 255, 255];  // White (original sea color)
const WHITE = [255, 255, 255];  // White for resetting everything
const EARLDOM_COLOR = [0, 94, 184];  // Blue from the Scottish flag
const SEA_FINAL_COLOR =     ;  // Light blue for sea
const BLACK = [0, 0, 0];  // Black for borders

// Load JSON map data
const loadMapData = () => {
    const rawData = fs.readFileSync(mapDataPath);
    return JSON.parse(rawData);
};

// Helper function to blend colors
const blendColors = (color1, color2) => {
    return [
        Math.floor((color1[0] + color2[0]) / 2),
        Math.floor((color1[1] + color2[1]) / 2),
        Math.floor((color1[2] + color2[2]) / 2),
    ];
};

// Helper function to apply a pixel color
const applyColor = (pixels, i, color) => {
    pixels[i] = color[0];      // Red
    pixels[i + 1] = color[1];  // Green
    pixels[i + 2] = color[2];  // Blue
    pixels[i + 3] = 255;       // Alpha (no transparency)
};

// Process the image and save the result
const processImage = async () => {
    try {
        const mapData = loadMapData();
        const externalColors = Object.values(mapData.regions)
            .filter(region => region.status === 'External Region')
            .map(region => region.color);  // Extract colors for external regions

        // Load the input image
        const image = await loadImage(inputImagePath);

        // Create a canvas with the same size as the image to avoid downscaling
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw the image onto the canvas at its original size
        ctx.drawImage(image, 0, 0, image.width, image.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Create a copy of the original pixels to keep track of the regions
        const originalPixels = new Uint8ClampedArray(pixels);

        let scottishPixels = [];
        let seaPixels = [];

        // Step 1: Turn all pixels white initially and track Scottish pixels
        for (let i = 0; i < pixels.length; i += 4) {
            const r = originalPixels[i];
            const g = originalPixels[i + 1];
            const b = originalPixels[i + 2];

            // If it's sea or external regions, leave them as they are
            if (r === SEA_COLOR[0] && g === SEA_COLOR[1] && b === SEA_COLOR[2]) {
                applyColor(pixels, i, SEA_FINAL_COLOR);  // Set to sea color (light blue)
                const x = (i / 4) % canvas.width;
                const y = Math.floor((i / 4) / canvas.width);
                seaPixels.push({ x, y, index: i });
            } else if (externalColors.some(c => c[0] === r && c[1] === g && c[2] === b)) {
                applyColor(pixels, i, SEA_FINAL_COLOR);  // Set to external region color
            } else {
                // Set Scottish pixels to white initially
                applyColor(pixels, i, WHITE);

                // Track Scottish pixels
                const x = (i / 4) % canvas.width;
                const y = Math.floor((i / 4) / canvas.width);
                scottishPixels.push({ x, y, index: i });
            }
        }

        // Step 2: Color Scottish regions (Earldom and Lordship)
        scottishPixels.forEach(({ x, y, index }) => {
            const r = originalPixels[index];
            const g = originalPixels[index + 1];
            const b = originalPixels[index + 2];

            // Convert pixel color to region key
            const regionKey = [r, g, b].map(color => color.toString().padStart(3, '0')).join('');

            // If the region exists in the map data
            if (mapData.regions[regionKey]) {
                const region = mapData.regions[regionKey];

                if (region.status === 'Earldom') {
                    // Set Earldom color
                    applyColor(pixels, index, EARLDOM_COLOR);
                } else if (region.status === 'Lordship') {
                    // Blend the Lordship color with the local color
                    const localColor = pixels.slice(index, index + 3);
                    const blendedColor = blendColors(EARLDOM_COLOR, localColor);
                    applyColor(pixels, index, blendedColor);
                }
            }
        });

        // Step 3: Add borders between Scotland and the sea/external regions
        const checkNeighbors = (x, y, sea) => {
            const directions = [
                { dx: -1, dy: 0 }, // left
                { dx: 1, dy: 0 },  // right
                { dx: 0, dy: -1 }, // top
                { dx: 0, dy: 1 },   // bottom
            ];

            const r = originalPixels[(y * canvas.width + x) * 4];
            const g = originalPixels[(y * canvas.width + x) * 4 + 1];
            const b = originalPixels[(y * canvas.width + x) * 4 + 2];

            for (const { dx, dy } of directions) {
                const neighborX = x + dx;
                const neighborY = y + dy;
                const neighborIndex = (neighborY * canvas.width + neighborX) * 4;

                if (neighborX >= 0 && neighborX < canvas.width && neighborY >= 0 && neighborY < canvas.height) {
                    const nr = originalPixels[neighborIndex];
                    const ng = originalPixels[neighborIndex + 1];
                    const nb = originalPixels[neighborIndex + 2];
                    if (nr === r && ng === g && nb === b) {
                        continue;  // Same color, so no border needed
                    }

                    // Check if the neighbor is sea or external region
                    if (!sea && !isScotland(nr, ng, nb, externalColors)) {
                        return true;  // There is a border with a non-Scottish region
                    } else {
                        //Check if is a differently colored scotland region
                        const regionKey = [nr, ng, nb].map(color => color.toString().padStart(3, '0')).join('');
                        if (mapData.regions[regionKey]) {
                            const region = mapData.regions[regionKey];
                            if (region.status != 'External Region') {
                                return true;  // There is a border with an Earldom region
                            }
                        }
                    }
                }
            }
            return false;
        };

        // Step 4: Draw borders between Scotland and sea/external regions
        scottishPixels.forEach(({ x, y, index }) => {
            if (checkNeighbors(x, y, false)) {
                applyColor(pixels, index, BLACK);  // Draw the black border
            }
        });

        seaPixels.forEach(({ x, y, index }) => {
            if (checkNeighbors(x, y, true)) {
                applyColor(pixels, index, BLACK);  // Draw the black border
            }
        });

        // Put the modified pixel data back on the canvas
        ctx.putImageData(imageData, 0, 0);

        // Save the processed image to the output path
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputImagePath, buffer);

        console.log('Image processing with borders completed successfully. Processed image saved to:', outputImagePath);
    } catch (error) {
        console.error('Error processing the image:', error);
    }
};

// Check if the pixel is within Scotland (i.e., not sea or external region)
const isScotland = (r, g, b, externalColors) => {
    if (r === SEA_COLOR[0] && g === SEA_COLOR[1] && b === SEA_COLOR[2]) return false;
    return !externalColors.some(c => c[0] === r && c[1] === g && c[2] === b);
};

// Run the process
processImage();
