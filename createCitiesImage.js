const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define file paths
const mapDataPath = path.join(__dirname, './data/map-data.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');

const controlPoints = [
    { latitude: 58.5, longitude: -3.5, pixelX: 637, pixelY: 46 },
    { latitude: 56.0, longitude: -2.5, pixelX: 792, pixelY: 695 },
    { latitude: 56.5, longitude: -5.5, pixelX: 356, pixelY: 568 },
    { latitude: 57.0, longitude: -2.0, pixelX: 856, pixelY: 432 },
    { latitude: 56.0, longitude: -3.5, pixelX: 646, pixelY: 698 },  
    { latitude: 55.0, longitude: -1.5, pixelX: 949, pixelY: 951 },
    { latitude: 55.0, longitude: -7.5, pixelX: 52,  pixelY: 950 },
    { latitude: 58.5, longitude: -8.0, pixelX: 22,  pixelY: 36  },
    { latitude: 58.5, longitude: -1.5, pixelX: 912, pixelY: 39  },
];

const loadMapData = () => {
    const rawData = fs.readFileSync(mapDataPath);
    return JSON.parse(rawData);
};

const latLongToPixelCustom = (latitude, longitude) => {
    const interceptX = -3081.148;
    const interceptY = 8073.893;

    // Updated coefficients based on the third-degree model
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

// Updated processImage function to include drawing of latitude and longitude lines
const processImage = async () => {
    try {
        const mapData = loadMapData();
        const royalBurghs = mapData.burghs;

        // Load the input image
        const image = await loadImage(inputImagePath);

        // Create a canvas with the same size as the image to avoid downscaling
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw the image onto the canvas at its original size
        ctx.drawImage(image, 0, 0, image.width, image.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Draw latitude and longitude lines
        // ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; // Set line color to semi-transparent black
        // ctx.lineWidth = 1;

        // // Longitude lines: from 7.5 W to 1.5 W, drawn every 0.5 degrees
        // for (let lon = -7.5; lon <= -1.5; lon += 0.5) {
        //     for (let lat = 55; lat <= 59; lat += 0.01) { // Increment lat by a small value to draw point-by-point
        //         let [x, y] = latLongToPixelCustom(lat, lon);
        //         x = Math.round(x); // Round to the nearest integer
        //         y = Math.round(y); // Round to the nearest integer

        //         // Draw a small point for each segment along the longitude line
        //         ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';  // Semi-transparent black
        //         ctx.fillRect(x, y, 1, 1);  // Draw a 1x1 pixel point
        //     }

        //     // Optional: Label each longitude line at the top of the map
        //     let [labelX, labelY] = latLongToPixelCustom(59, lon);
        //     labelX = Math.round(labelX); // Round to the nearest integer
        //     labelY = Math.round(labelY); // Round to the nearest integer
        //     ctx.fillStyle = 'blue';
        //     ctx.font = '12px Arial';
        //     ctx.fillText(`${lon.toFixed(1)} W`, labelX + 5, labelY - 5);
        // }

        // // Latitude lines: from 59 N to 55 N, drawn every 0.5 degrees
        // for (let lat = 55; lat <= 59; lat += 0.5) {
        //     for (let lon = -7.5; lon <= -1.5; lon += 0.01) { // Increment lon by a small value to draw point-by-point
        //         let [x, y] = latLongToPixelCustom(lat, lon);
        //         x = Math.round(x); // Round to the nearest integer
        //         y = Math.round(y); // Round to the nearest

        //         // Draw a small point for each segment along the latitude line
        //         ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';  // Semi-transparent black
        //         ctx.fillRect(x, y, 1, 1);  // Draw a 1x1 pixel point
        //     }

        //     // Optional: Label each latitude line at the left of the map
        //     let [labelX, labelY] = latLongToPixelCustom(lat, -7.5);
        //     labelX = Math.round(labelX); // Round to the nearest integer
        //     labelY = Math.round(labelY); // Round to the nearest integer
        //     ctx.fillStyle = 'blue';
        //     ctx.font = '12px Arial';
        //     ctx.fillText(`${lat.toFixed(1)} N`, labelX + 5, labelY - 5);
        // }


        // ctx.fillStyle = 'red'; // Set control point color
        // controlPoints.forEach(point => {
        //     // Draw a circle at the pixel position of each control point
        //     ctx.beginPath();
        //     ctx.arc(point.pixelX, point.pixelY, 5, 0, 2 * Math.PI); // 5px radius circle
        //     ctx.fill();
        //     ctx.stroke();

        //     // Optional: Label each control point with its lat/lon values
        //     ctx.fillStyle = 'black';
        //     ctx.font = '12px Arial';
        //     ctx.fillText(`(${point.latitude}, ${point.longitude})`, point.pixelX + 5, point.pixelY - 5);
        // });

        // For each city, convert the latitude and longitude to pixel coordinates and draw a square
        for (const color in royalBurghs) {
            const burgh = royalBurghs[color];
            let [x_pixel, y_pixel] = latLongToPixelCustom(burgh.latitude, burgh.longitude);

            // Save pixel coordinates to data
            burgh.x_pixel = x_pixel;
            burgh.y_pixel = y_pixel;

            x_pixel = Math.round(x_pixel); // Round to the nearest integer
            y_pixel = Math.round(y_pixel); // Round to the nearest integer

            //console.log(`Pixel coordinates for ${burgh.name}: ${x_pixel}, ${y_pixel}`);

            // Get the pixel color at the calculated coordinates
            const r = pixels[(y_pixel * canvas.width + x_pixel) * 4];
            const g = pixels[(y_pixel * canvas.width + x_pixel) * 4 + 1];
            const b = pixels[(y_pixel * canvas.width + x_pixel) * 4 + 2];

            // Check if the pixel is white (sea) or an external region
            if (r === 255 && g === 255 && b === 255) {
                console.log(`${burgh.name} is a sea pixel`);
            }

            // Draw a square at the calculated pixel coordinates based on city level
            const cityLevel = burgh.level;
            const citySize = 4 * cityLevel + 1;
            const colorArray = color.match(/.{1,3}/g).map(val => parseInt(val));
            ctx.fillStyle = `rgb(${colorArray[0]}, ${colorArray[1]}, ${colorArray[2]})`;
            ctx.fillRect(x_pixel - (citySize - 1) / 2, y_pixel - (citySize - 1) / 2, citySize, citySize);
        }

        // Save the processed image
        const outputImagePath = path.join(__dirname, './assets/images/ScotlandCitiesMap.png');
        const out = fs.createWriteStream(outputImagePath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);

        // Save the updated map data with pixel coordinates, to same file
        fs.writeFileSync(mapDataPath, JSON.stringify(mapData, null, 2));
    } catch (error) {
        console.error('Error processing image:', error.message);
    }
};

processImage();
