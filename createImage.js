const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Define file paths
const mapDataPath = path.join(__dirname, './data/map-data.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');
const outputImagePath = path.join(__dirname, './assets/images/ScotlandHome.png');

// Color definitions
const SEA_COLOR = [255, 255, 255];  // White (original sea color)
const FLAG_BLUE_COLOR = [0, 94, 184];  // Blue from the Scottish flag
const FLAG_WHITE_COLOR = [255, 255, 255];  // White from the Scottish flag cross (saltire)
const SEA_FINAL_COLOR = [173, 216, 230];  // Light blue for sea
const NOT_SCOTLAND_COLOR = [169, 169, 169];  // Grey for external region

// Load JSON map data
const loadMapData = () => {
    const rawData = fs.readFileSync(mapDataPath);
    return JSON.parse(rawData);
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

        let minX = canvas.width, maxX = 0;
        let minY = canvas.height, maxY = 0;
        let scottishPixels = [];

        // Loop through pixels and process the image
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            // Check for white (sea)
            if (r === SEA_COLOR[0] && g === SEA_COLOR[1] && b === SEA_COLOR[2]) {
                // Set to sea color (light blue)
                pixels[i] = SEA_FINAL_COLOR[0];
                pixels[i + 1] = SEA_FINAL_COLOR[1];
                pixels[i + 2] = SEA_FINAL_COLOR[2];
            }
            // Check for external regions (not Scotland)
            else if (externalColors.some(c => c[0] === r && c[1] === g && c[2] === b)) {
                // Set to grey (external region)
                pixels[i] = NOT_SCOTLAND_COLOR[0];
                pixels[i + 1] = NOT_SCOTLAND_COLOR[1];
                pixels[i + 2] = NOT_SCOTLAND_COLOR[2];
            } 
            // Otherwise, color as Scotland (Scottish flag blue)
            else {
                pixels[i] = FLAG_BLUE_COLOR[0];
                pixels[i + 1] = FLAG_BLUE_COLOR[1];
                pixels[i + 2] = FLAG_BLUE_COLOR[2];

                // Track the extents of the Scotland region
                const x = (i / 4) % canvas.width;
                const y = Math.floor((i / 4) / canvas.width);

                // Store the coordinates of Scottish pixels
                scottishPixels.push({ x, y });

                // Track min and max for bounding the region
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }


        // Put the modified pixel data back on the canvas
        ctx.putImageData(imageData, 0, 0);

        // Draw the saltire only on the Scottish areas
        const crossThickness = 40;  // Adjust as needed for thicker or thinner lines
        const drawSaltirePixel = (x, y) => {
            // Ensure the pixel is within the bounds of Scotland
            ctx.fillStyle = `rgb(${FLAG_WHITE_COLOR[0]}, ${FLAG_WHITE_COLOR[1]}, ${FLAG_WHITE_COLOR[2]})`;
            ctx.fillRect(x, y, 1, 1);
        };

        // Loop through all the Scottish pixels to draw the saltire
        scottishPixels.forEach(({ x, y }) => {
            const isOnSaltire = Math.abs(x - y) < crossThickness || Math.abs((canvas.width - x) - y) < crossThickness;

            if (isOnSaltire) {
                drawSaltirePixel(x, y);
            }
        });

        // Define the Scottish blue and gold colors
        const SCOTTISH_BLUE = [0, 114, 198];
        const GOLD = [179, 126, 49];
        const BORDER_LENGTH = 10; // Amount to inset by (border width)

        // Function to draw a filled trapezoid
        const drawTrapezoid = (ctx, vertices, color) => {
            ctx.beginPath();
            ctx.moveTo(vertices[0][0], vertices[0][1]);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i][0], vertices[i][1]);
            }
            ctx.closePath();
            ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            ctx.fill();
        };

        // Function to calculate inset vertices based on border length
        const insetVertices = (vertices, inset) => {
            return vertices.map(([x, y], index) => {
                const xDiff = vertices[2][0] - vertices[1][0];
                    const yDiff = vertices[2][1] - vertices[1][1];
                    const slope = yDiff / xDiff;

                let xInset = x, yInset = y;

                // Move inward vertically (depending on top/bottom)
                if (index === 0 || index === 1) {
                    yInset -= inset; // Push up (for bottom side vertices)
                } else if (index === 2 || index === 3) {
                    yInset += inset; // Push down (for top side vertices)
                }

                // Move inward horizontally (depending on left/right)
                if (index === 0 || index === 3) {
                    if (slope > 0) {
                        xInset += inset; // Push right (for left side vertices)
                    } else {
                        xInset -= inset; // Push left (for right side vertices)
                    }
                } else if (index === 1 || index === 2) {
                    // Calculate based on diagonal from vertex 1 to 2
                    //y - y1 = m(x - x1), trying to find x
                    if (slope > 0) {
                        xInset = ((yInset - vertices[1][1]) / slope) + vertices[1][0] - inset * 2;
                    } else {
                        xInset = ((yInset - vertices[1][1]) / slope) + vertices[1][0] + inset * 2;
                    }
                }

                return [xInset, yInset];
            });
        };

        // Draw the first gold trapezoid (starting bottom left)
        const trapezoid1 = [
            [0, canvas.height], // Bottom left corner
            [434, canvas.height], // Right 288 pixels, same height
            [288, canvas.height - 88], // Tapered out to 434 pixels, rising 88 pixels
            [0, canvas.height - 88] // Starting point bottom left, rising 88 pixels
        ];
        drawTrapezoid(ctx, trapezoid1, GOLD);

        // Inset the first trapezoid and draw it in Scottish blue
        const insetTrapezoid1 = insetVertices(trapezoid1, BORDER_LENGTH / 2);
        drawTrapezoid(ctx, insetTrapezoid1, SCOTTISH_BLUE);

        // Draw the second gold trapezoid (starting bottom right)
        const trapezoid2 = [
            [canvas.width, canvas.height], // Bottom right corner
            [canvas.width - 434, canvas.height], // Left 251 pixels, same height
            [canvas.width - 251, canvas.height - 88], // Tapered out to 434 pixels, rising 88 pixels
            [canvas.width, canvas.height - 88] // Starting point bottom right, rising 88 pixels
        ];
        drawTrapezoid(ctx, trapezoid2, GOLD);

        // Inset the second trapezoid and draw it in Scottish blue
        const insetTrapezoid2 = insetVertices(trapezoid2, BORDER_LENGTH / 2);
        drawTrapezoid(ctx, insetTrapezoid2, SCOTTISH_BLUE);



        // Save the processed image to the output path
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputImagePath, buffer);

        console.log('Image processing with saltire completed successfully. Processed image saved to:', outputImagePath);
    } catch (error) {
        console.error('Error processing the image:', error);
    }
};

// Run the process
processImage();
