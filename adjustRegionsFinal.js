const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// File paths
const landImagePath = path.join(__dirname, './assets/images/ScotlandLandOnly.png');
const regionImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');
const outputImagePath = path.join(__dirname, './assets/images/ScotlandRegions2.png');

// Load the images
const processImage = async () => {
    try {
        const [landImage, regionImage] = await Promise.all([
            loadImage(landImagePath),
            loadImage(regionImagePath)
        ]);

        // Create a canvas with the same size as the images
        const canvas = createCanvas(landImage.width, landImage.height);
        const ctx = canvas.getContext('2d');

        // Draw the land and region images onto separate canvases for pixel access
        const landCanvas = createCanvas(landImage.width, landImage.height);
        const landCtx = landCanvas.getContext('2d');
        landCtx.drawImage(landImage, 0, 0);

        const regionCanvas = createCanvas(regionImage.width, regionImage.height);
        const regionCtx = regionCanvas.getContext('2d');
        regionCtx.drawImage(regionImage, 0, 0);

        // Get pixel data
        const landData = landCtx.getImageData(0, 0, landCanvas.width, landCanvas.height);
        const regionData = regionCtx.getImageData(0, 0, regionCanvas.width, regionCanvas.height);
        const outputData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Extract Scotland land pixels and region-colored pixels
        let landPixels = [];
        let regionPixels = [];

        for (let y = 0; y < landCanvas.height; y++) {
            for (let x = 0; x < landCanvas.width; x++) {
                const index = (y * landCanvas.width + x) * 4;

                // Check if pixel is black (land pixel)
                if (
                    landData.data[index] === 0 &&
                    landData.data[index + 1] === 0 &&
                    landData.data[index + 2] === 0
                ) {
                    landPixels.push({ x, y, index });
                }

                // Check if pixel is colored (region pixel)
                if (
                    !(
                        regionData.data[index] === 255 &&
                        regionData.data[index + 1] === 255 &&
                        regionData.data[index + 2] === 255
                    )
                ) {
                    regionPixels.push({ 
                        x, 
                        y, 
                        color: [
                            regionData.data[index], 
                            regionData.data[index + 1], 
                            regionData.data[index + 2]
                        ] 
                    });
                }
            }
        }

        console.log(`Found ${landPixels.length} land pixels and ${regionPixels.length} region pixels.`);

        let numPixels = landPixels.length;
        let i = 0;

        // Assign nearest region pixel color to each land pixel
        landPixels.forEach(landPixel => {
            i++;
            if (i % 1000 === 0) {
                process.stdout.write(`\rProcessing pixel ${i} of ${numPixels}...`);
            }
            let minDistance = Infinity;
            let nearestColor = [255, 255, 255];

            for (const regionPixel of regionPixels) {
                const dx = landPixel.x - regionPixel.x;
                const dy = landPixel.y - regionPixel.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestColor = regionPixel.color;
                } else if (distance === minDistance) {
                    // If two pixels are equidistant, randomly pick one
                    if (Math.random() < 0.5) {
                        nearestColor = regionPixel.color;
                    }
                }
            }

            // Apply nearest color
            const index = landPixel.index;
            outputData.data[index] = nearestColor[0];
            outputData.data[index + 1] = nearestColor[1];
            outputData.data[index + 2] = nearestColor[2];
            outputData.data[index + 3] = 255; // Fully opaque
        });

        // Put modified pixel data back onto canvas
        ctx.putImageData(outputData, 0, 0);

        // Save the processed image
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputImagePath, buffer);

        console.log(`ScotlandRegions2.png generated: ${outputImagePath}`);
    } catch (error) {
        console.error('Error processing image:', error.message);
    }
};

processImage();
