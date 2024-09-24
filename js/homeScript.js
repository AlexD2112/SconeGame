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

let isImageLoaded = false;  // Flag to track if the image has loaded
let mapWidth;
const image = new Image();
image.src = imageUrl;
let extraSideSpace = true;

let renderWidth, renderHeight, xOffset, yOffset;

image.onload = function () {
    isImageLoaded = true; // Set flag to true when the image has loaded

    // Get image and canvas dimensions
    const imgWidth = image.width;
    const imgHeight = image.height;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Calculate aspect ratios
    const imgAspectRatio = imgWidth / imgHeight;
    const canvasAspectRatio = canvasWidth / canvasHeight;

    // Compare aspect ratios to determine how the image fits the canvas
    if (imgAspectRatio > canvasAspectRatio) {
        // Image is wider than canvas
        renderWidth = canvasWidth;
        renderHeight = canvasWidth / imgAspectRatio;
        extraSideSpace = false;
    } else {
        // Image is taller or fits within canvas
        renderHeight = canvasHeight;
        renderWidth = canvasHeight * imgAspectRatio;
    }

    console.log(renderWidth, renderHeight, canvasWidth, canvasHeight);

    mapWidth = renderWidth;

    // Fill the canvas with a blue field (for the remaining space)
    ctx.fillStyle = `rgb(173, 216, 230)`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (extraSideSpace) {
        // Draw the image, centered and scaled appropriately
        ctx.drawImage(image, 0, 0, renderWidth, renderHeight);

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
    } else {
        //Draw the image at the bottom of the screen
        ctx.drawImage(image, 0, canvas.height - (renderHeight), renderWidth, renderHeight);

        const logo = new Image();
        logo.src = logoUrl;

        logo.onload = function () {
            let logoWidth = logo.width;
            let logoHeight = logo.height;

            // Scale the logo so that height is no more canvas height minus renderHeight, and width is no more than half of the canvas width
            if (logoHeight > canvasHeight - renderHeight) {
                let scale = (canvasHeight - renderHeight) / logoHeight;
                if (logoWidth > canvasWidth / 2) {
                    const scale2 = (canvasWidth / 2) / logoWidth;
                    if (scale2 < scale) {
                        scale = scale2;
                    }
                }
                logoWidth *= scale;
                logoHeight *= scale;
            }

            const logoX = 0;
            const logoY = 0;

            ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
        }       
    }

    // Now we check if the document is already loaded
    if (documentIsReady) {
        runTextBoxAdjustment();
    }
};

// Track if the document is ready
let documentIsReady = false;

document.addEventListener("DOMContentLoaded", function () {
    documentIsReady = true;  // Set flag to true when the document is ready

    // If the image has already loaded, run the text box adjustment
    if (isImageLoaded) {
        runTextBoxAdjustment();
    }

    updateSituationBox();
});

function runTextBoxAdjustment() {
    // Get references to the text boxes
    const dateMonthBox = document.getElementById("dateMonthDayBox");
    const yearBox = document.getElementById("dateYearBox");
    const situationBox = document.getElementById("situationBox");

    //Change values
    dateMonthBox.innerHTML = "June 11";
    yearBox.innerHTML = "1291";
    situationBox.innerHTML = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip."

    // Function to adjust position dynamically
    function adjustTextBoxPosition() {
        if (extraSideSpace) {

            // Dynamically adjust the position of dateMonthBox (e.g., shift it based on some condition)
            dateMonthBox.style.left = mapWidth * 1 / 6 + "px";
            dateMonthBox.style.bottom = '1vh'; // Set a specific distance from bottom

            // Dynamically adjust the position of yearBox
            yearBox.style.left = mapWidth * 4.2/5 + "px";  // Center based on canvas
            yearBox.style.bottom = '1vh'; // Set a specific distance from bottom

            situationBox.style.left = (canvas.width + mapWidth) / 2 + "px";
            situationBox.style.top = '50vh';
        } else {
            //Find bottom of image in vh
            const mapScale = renderHeight / canvas.height;
            console.log(mapScale);
            const imageBottom = (6 * mapScale - 4) / 2;
            console.log(imageBottom);
            dateMonthBox.style.left = mapWidth * 1 / 6 + "px";
            dateMonthBox.style.bottom = imageBottom + 'vh';

            yearBox.style.left = mapWidth * 4.2/5 + "px";
            yearBox.style.bottom = imageBottom + 'vh';
        
            //hide situationBox
            situationBox.style.display = "none";
        }
    }

    // Call the function on page load
    adjustTextBoxPosition();

    // Optionally, call the function on window resize to reposition the text dynamically
    window.addEventListener('resize', adjustTextBoxPosition);
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
})

function updateSituationBox() {
    const userID = getCookie('userID');
    if (userID) {
        const situationBox = document.getElementById("situationBox");
        situationBox.innerHTML = `Welcome, user ${userID}`;
    }
}


async function handleRequest(request) {
    const url = new URL(request.url);

    // Check if this is the callback URL
    if (url.pathname === '/auth/discord/callback') {
        const code = url.searchParams.get('code');

        if (!code) {
            return new Response('Error: no code provided', { status: 400 });
        }

        // Step 1: Exchange the code for an access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: '1288255745544028353', // replace with your client_id
                client_secret: 'I_WPJnzpQtCs_UloqpAiimguxPo6tA8P', // replace with your client_secret
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: 'https://stoneofscone.org/auth/discord/callback' // match your redirect URI
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log(tokenResponse);

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            return new Response('Error fetching access token', { status: 500 });
        }

        const accessToken = tokenData.access_token;

        // Step 2: Fetch the Discord user's info
        const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const discordUser = await userResponse.json();

        return new Response(null, {
            status: 302,
            headers: {
                'Location': '/', // Redirect back to the homepage after login
                'Set-Cookie': `userID=${discordUser.id}; Path=/; HttpOnly; Secure; SameSite=Lax;`
            }
        });
    }

    // Fallback in case the URL does not match
    return new Response('Invalid request', { status: 404 });
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

