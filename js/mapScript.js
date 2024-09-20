const mapPath = '/assets/images/ScotlandMap.png';
const regionMapPath = '/assets/images/ScotlandRegionsFinal.png';
const mapDataUrl = '/data/map-data.json';

let isImageLoaded = false;
let DOMContentLoaded = false;
let isRegionLoaded = false;
let regionMapImage;  // For the color-coded region map
let mapData;         // For holding the region info

const image = new Image();
image.src = mapPath;

regionMapImage = new Image();
regionMapImage.src = regionMapPath;

let pixels;

fetch(mapDataUrl)
    .then(response => response.json())
    .then(data => {
        mapData = data;
    })
    .catch(error => {
        console.error('Error fetching map data:', error);
    });

image.onload = function () {
    isImageLoaded = true; // Set flag to true when the image has loaded
    if (DOMContentLoaded && isRegionLoaded) {
        initMap();  // Initialize the map if DOM content has already loaded
    }
}

regionMapImage.onload = function () {
    isRegionLoaded = true;  // Set flag to true when the region map has loaded
    if (isImageLoaded && DOMContentLoaded) {
        initMap();  // Initialize the map if the image has already loaded
    }
}

document.addEventListener('DOMContentLoaded', function () {
    DOMContentLoaded = true;  // Set flag to true when the DOM content has loaded
    if (isImageLoaded && isRegionLoaded) {
        initMap();  // Initialize the map if the image has already loaded
    }
});

function initMap() {
    // Get image dimensions after it has loaded
    const imageWidth = image.width;
    const imageHeight = image.height;

    // Initialize the map, set the initial view to center and zoom level
    var map = L.map('map', {
        crs: L.CRS.Simple,  // Use simple coordinate reference system for image
        minZoom: -1.5,  // Adjust minZoom as needed
        maxZoom: 1.5,  // Adjust maxZoom as needed
        zoomSnap: 1,
        zoomControl: true
    });

    // Image bounds (top-left and bottom-right coordinates)
    var imageBounds = [[0, 0], [imageHeight, imageWidth]];

    // Add the map image layer
    L.imageOverlay(mapPath, imageBounds).addTo(map);

    // Set the view to the center of the image
    map.setView([imageHeight / 2, imageWidth / 2], 0);

    // Limit map panning to image boundaries
    map.setMaxBounds(imageBounds);

    // Ensure the map is correctly displayed after loading
    setTimeout(function () {
        map.invalidateSize();
    }, 100);

    addArrowKeyNavigation(map);

    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(regionMapImage, 0, 0, imageWidth, imageHeight);
    pixels = ctx.getImageData(0, 0, imageWidth, imageHeight).data;

    map.on('click', function (event) {
        handleMapClick(event, map, imageWidth, imageHeight, imageBounds);
    });
}

function handleMapClick(event, map, imageWidth, imageHeight, imageBounds) {
    const latLng = map.mouseEventToLatLng(event.originalEvent);
    const x = Math.floor((latLng.lng - imageBounds[0][1]) / (imageBounds[1][1] - imageBounds[0][1]) * imageWidth);
    const y = Math.floor(imageHeight - ((latLng.lat - imageBounds[0][0]) / (imageBounds[1][0] - imageBounds[0][0]) * imageHeight));
    console.log('Clicked at:', x, y);

    if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
        const index = (y * imageWidth + x) * 4;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];

        console.log('Color:', [r, g, b]);
        const regionKey = [r, g, b].map(color => color.toString().padStart(3, '0')).join('');

        if (mapData.regions[regionKey]) {
            const region = mapData.regions[regionKey];
            console.log('Region:', region);
            displayRegionInfo(region);
        } else {
            console.log('No region found for color:', [r, g, b]);
        }
    }
}

function displayRegionInfo(region) {
    const infoBox = document.getElementById('regionInfoBox');

    if (region.notable_landowners.length === 0) {
        infoBox.innerHTML = `
            <h3>${region.name}</h3>
            <p>Status: ${region.status}</p>
            <p>Possessor: ${region.possessor || 'N/A'}</p>
            <p>Clan: ${region.possessor_clan || 'N/A'}</p>
        `;
    }
    else {
        //Landowners is an array of objects- extract the name and clan from each of them to restructure as <name> of <clan>
        let landownersText = region.notable_landowners.map(landowner => `${landowner.name} of ${landowner.clan}`).join('<br>');
        infoBox.innerHTML = `
            <h3>${region.name}</h3>
            <p>Status: ${region.status}</p>
            <p>Notable Landowners: <br>${landownersText}</p>
        `;
    }

    //make the info box visible
    infoBox.style.display = 'block';
}

function addArrowKeyNavigation(map) {
    // Define the pan offset (in pixels) for each arrow key press
    const panOffset = 100;  // Adjust as necessary

    // Add event listener for keydown
    document.addEventListener('keydown', function (event) {
        switch (event.key) {
            case 'ArrowUp':
                map.panBy([0, -panOffset]);  // Pan up
                break;
            case 'ArrowDown':
                map.panBy([0, panOffset]);   // Pan down
                break;
            case 'ArrowLeft':
                map.panBy([-panOffset, 0]);  // Pan left
                break;
            case 'ArrowRight':
                map.panBy([panOffset, 0]);   // Pan right
                break;
            default:
                break;
        }
    });
}