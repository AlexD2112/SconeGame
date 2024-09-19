// Path to the map-data.json
const mapDataUrl = '/data/map-data.json';
// Path to the image
const imageUrl = '/assets/images/ScotlandHome.png';
const logoUrl = '/assets/images/SconeLogoAI.png';

// Canvas setup
const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

// Disable image smoothing to prevent pixel averaging
ctx.imageSmoothingEnabled = false;

// Load the image and map data
const image = new Image();
image.src = imageUrl;

image.onload = function () {
    // Get image and canvas dimensions
    const imgWidth = image.width;
    const imgHeight = image.height;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    console.log(canvasWidth, canvasHeight);

    // Calculate aspect ratios
    const imgAspectRatio = imgWidth / imgHeight;
    const canvasAspectRatio = canvasWidth / canvasHeight;

    let renderWidth, renderHeight, xOffset, yOffset;

    let extraSideSpace = true;

    // Compare aspect ratios to determine how the image fits the canvas
    if (imgAspectRatio > canvasAspectRatio) {
        // Image is wider than canvas
        renderWidth = canvasWidth;
        renderHeight = canvasWidth / imgAspectRatio;
        xOffset = 0;
        yOffset = 0;
        extraSideSpace = false;
    } else {
        // Image is taller or fits within canvas
        renderHeight = canvasHeight;
        renderWidth = canvasHeight * imgAspectRatio;
        yOffset = 0;
        xOffset = 0;

    }

    // Fill the canvas with a blue field (for the remaining space)
    const r = 173;
    const g = 216;
    const b = 230;

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw the image, centered and scaled appropriately
    ctx.drawImage(image, xOffset, yOffset, renderWidth, renderHeight);

    if (extraSideSpace) {
        // Load logo halfway through remaining space
        const logo = new Image();
        logo.src = logoUrl;

        logo.onload = function () {
            let logoWidth = logo.width;
            let logoHeight = logo.height;

            // Scale the logo so that height is no more than 1/3 of the canvas height
            if (logoHeight > canvasHeight / 2) {
                const scale = (canvasHeight / 2) / logoHeight;
                logoWidth *= scale;
                logoHeight *= scale;
            }

            const logoX = renderWidth + (canvasWidth - renderWidth) / 2 - logoWidth / 2;
            const logoY = 0;

            ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
        }
    }
};

// Function to fetch and process the map data
