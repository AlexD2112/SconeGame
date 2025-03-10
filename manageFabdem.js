const fs = require('fs');
const path = require('path');

// Path to your FABDEM dataset
const FABDEM_PATH = "D:/Downloads/FABDEM/s5hqmjcdj8yo2ibzi9b4ew3sn";
const GEOJSON_FILE = path.join(FABDEM_PATH, "FABDEM_v1-2_tiles.geojson");

// Map size in pixels
const IMAGE_WIDTH = 971;
const IMAGE_HEIGHT = 1062;

// Your function to convert lat/lon to pixel
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

// Function to load FABDEM geojson
const loadGeoJSON = () => {
    return JSON.parse(fs.readFileSync(GEOJSON_FILE, 'utf8'));
};

// Function to check if a pixel is within the map bounds
const isPixelInBounds = (x, y) => {
    return x >= 0 && x <= IMAGE_WIDTH && y >= 0 && y <= IMAGE_HEIGHT;
};

// Function to find required tiles based on pixel bounds
const findRequiredTiles = () => {
    const geojson = loadGeoJSON();
    const requiredTiles = new Set();

    for (const feature of geojson.features) {
        const bbox = feature.geometry.coordinates[0];
        const [minLon, minLat] = bbox[0]; // Bottom-left
        const [maxLon, maxLat] = bbox[2]; // Top-right

        // Convert all four corners of the tile to pixel coordinates
        const corners = [
            latLongToPixelCustom(minLat, minLon), // Bottom-left
            latLongToPixelCustom(minLat, maxLon), // Bottom-right
            latLongToPixelCustom(maxLat, minLon), // Top-left
            latLongToPixelCustom(maxLat, maxLon)  // Top-right
        ];

        // Check if any corner is within the image bounds
        if (corners.some(([x, y]) => isPixelInBounds(x, y))) {
            requiredTiles.add(feature.properties.file_name);
        }
    }

    return Array.from(requiredTiles);
};

//Save an array of names to ./data/requiredTiles.json
const saveRequiredTiles = (requiredTiles) => {
    const requiredTilesPath = path.join(__dirname, './data/requiredTiles.json');
    fs.writeFileSync(requiredTilesPath, JSON.stringify(requiredTiles, null, 4));
};

// Run the function
const requiredTiles = findRequiredTiles();
saveRequiredTiles(requiredTiles);

// Save 
console.log("Required FABDEM tiles:", requiredTiles);
