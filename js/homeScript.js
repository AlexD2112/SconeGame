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

            const logoX = renderWidth + (canvasWidth - renderWidth) / 3 - logoWidth / 2;
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

    fetchUserInfo();
});

function runTextBoxAdjustment() {
    // Get references to the text boxes
    const dateMonthBox = document.getElementById("dateMonthDayBox");
    const yearBox = document.getElementById("dateYearBox");
    const situationBox = document.getElementById("situationBox");
    const discordButton = document.getElementById("discordLoginButton");
    const discordInviteButton = document.getElementById("discordInviteButton");

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

            discordButton.style.left = "50%";
            discordButton.style.left = renderWidth + 2 * (canvas.width - renderWidth) / 3 + "px";
            discordButton.style.top = '10vh';
            

            discordInviteButton.style.left = "50%"; 
            discordInviteButton.style.left = renderWidth + 2 * (canvas.width - renderWidth) / 3 + "px";
            discordInviteButton.style.top = '30vh';
            
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


            discordInviteButton.style.right = 0 + "px";
            discordInviteButton.style.width = canvas.width * 2/5 + "px";
            discordInviteButton.style.top = "4vh";

            discordButton.style.right = 0 + "px";
            discordButton.style.width = canvas.width * 2/5 + "px ";
            discordButton.style.top = "16vh";
        }
    }

    // Call the function on page load
    adjustTextBoxPosition();

    // Optionally, call the function on window resize to reposition the text dynamically
    window.addEventListener('resize', adjustTextBoxPosition);
}

function fetchUserInfo() {
    fetch('/get-user-info')
        .then(response => {
            if (!response.ok) {
                console.log("No user info");
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (data && data.username) {
                const discordButton = document.getElementById('discordLoginButton');
                discordButton.innerHTML = `Logged in as ${data.username}`;
            } else {
                console.error('No username found');
            }
        })
        .catch(error => {
            console.error('Error fetching user info:', error);
        });
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

