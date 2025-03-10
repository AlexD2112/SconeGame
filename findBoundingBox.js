const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Path to extracted tiles
const extractPath = "temp_extracted_tiles";

// Get all .tif files
const tifFiles = fs.readdirSync(extractPath).filter(file => file.endsWith(".tif"));

if (tifFiles.length === 0) {
    console.error("No .tif files found in temp_extracted_tiles.");
    process.exit(1);
}

// Initialize bounding box values
let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;

// Function to extract coordinates from gdalinfo output
function extractCoordinates(gdalOutput) {
    const ulMatch = gdalOutput.match(/Upper Left\s+\(\s*([-.\d]+),\s*([-.\d]+)\)/);
    const lrMatch = gdalOutput.match(/Lower Right\s+\(\s*([-.\d]+),\s*([-.\d]+)\)/);

    if (ulMatch && lrMatch) {
        const ulLon = parseFloat(ulMatch[1]);
        const ulLat = parseFloat(ulMatch[2]);
        const lrLon = parseFloat(lrMatch[1]);
        const lrLat = parseFloat(lrMatch[2]);

        return { ulLon, ulLat, lrLon, lrLat };
    }
    return null;
}

// Loop through each .tif file and get bounding coordinates
tifFiles.forEach(file => {
    const filePath = path.join(extractPath, file);
    try {
        const output = execSync(`gdalinfo "${filePath}"`, { encoding: "utf-8" });

        const coords = extractCoordinates(output);
        if (coords) {
            if (coords.ulLon < minLon) minLon = coords.ulLon;
            if (coords.lrLon > maxLon) maxLon = coords.lrLon;
            if (coords.ulLat > maxLat) maxLat = coords.ulLat;
            if (coords.lrLat < minLat) minLat = coords.lrLat;
        } else {
            console.warn(`Could not extract coordinates for: ${file}`);
        }
    } catch (error) {
        console.error(`Error running gdalinfo on ${file}:`, error.message);
    }
});

// Output final bounding box
console.log(`Bounding Box:`);
console.log(`UL (${maxLat}, ${minLon}) -> LR (${minLat}, ${maxLon})`);
