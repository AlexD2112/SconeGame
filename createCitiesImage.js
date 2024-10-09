const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define file paths
const mapDataPath = path.join(__dirname, './data/map-data.json');
const inputImagePath = path.join(__dirname, './assets/images/ScotlandRegionsFinal.png');

const loadMapData = () => {
    const rawData = fs.readFileSync(mapDataPath);
    return JSON.parse(rawData);
};

const latLongToPixelCustom = (latitude, longitude) => {
    const interceptX = 1037.27;
    const interceptY = 7803.39;

    const coefficientsX = [-6.38e-16, 0.00016404, 0.04460, 0.03473, 2.51303, -0.36332];
    const coefficientsY = [0.0, -0.01976, -0.001059, -2.26610, 0.00667, 0.02556];

    let x_pixel = (interceptX + coefficientsX[0] * 1 + coefficientsX[1] * latitude + coefficientsX[2] * longitude + coefficientsX[3] *
        latitude ** 2 + coefficientsX[4] * latitude * longitude + coefficientsX[5] * longitude ** 2);
    let y_pixel = (interceptY + coefficientsY[0] * 1 + coefficientsY[1] * latitude + coefficientsY[2] * longitude + coefficientsY[3] *
        latitude ** 2 + coefficientsY[4] * latitude * longitude + coefficientsY[5] * longitude ** 2);

    //Round both values to the nearest integer
    x_pixel = Math.round(x_pixel);
    y_pixel = Math.round(y_pixel);

    return [x_pixel, y_pixel];
}

// Make getRoyalBurghs async and use await to ensure getLatLong completes before moving on.
const getRoyalBurghs = async (mapData) => {
    const royalBurghs = [];
    const burghs = mapData.burghs;
    const length = Object.keys(burghs).length;

    for (let i = 0; i < length; i++) {
        const color = Object.keys(burghs)[i];
        const burgh = burghs[color];

        // Use await to ensure getLatLong completes before proceeding
        const latLong = await getLatLong(burgh.name);
        if (latLong) {  // Ensure the latLong is valid before pushing to the array
            const latitude = latLong.latitude;
            const longitude = latLong.longitude;
            royalBurghs.push({
                name: burgh.name,
                color: color,
                latitude: latitude,
                longitude: longitude
            });
        }
    }
    return royalBurghs; // Return the array of royalBurghs
};

// Updated getLatLong function to fetch coordinates from the internet
const getLatLong = async (name) => {
    try {
      // Define your API key here
      const apiKey = 'gkK81/WOUieP2etqeCd6qg==REhaQiB8HAKgM4Bp';
  
      // Construct the request URL for API Ninjas
      const url = `https://api.api-ninjas.com/v1/geocoding?city=${encodeURIComponent(name)}&country=United Kingdom`;
  
      // Send the GET request to the API Ninjas Geocoding endpoint
      const response = await axios.get(url, {
        headers: { 'X-Api-Key': apiKey },
      });
  
      // Check if any results were returned
      if (response.data.length === 0) {
        throw new Error(`No results found in API Ninjas for ${name} in the United Kingdom`);
      }
  
      // Extract latitude and longitude from the first result
      const { latitude, longitude } = response.data[0];
      return {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      };
    } catch (error) {
      console.error(`Error fetching coordinates for ${name} from API Ninjas:`, error.message);
      return null;
    }
  };

// Updated processImage function to work with async/await
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

        //For each city, convert the latitude and longitude to pixel coordinates and than draw a square. No need to get royal burghs, already gotten
        for (const color in royalBurghs) {
            const burgh = royalBurghs[color];
            const [x_pixel, y_pixel] = latLongToPixelCustom(burgh.latitude, burgh.longitude);

            // Draw a square at the calculated pixel coordinates, with the pixel coordinates being the exact center. They should be 9 pixels wide if the city level is 1, 13 pixels wide if the city level is 2, and 17 pixels wide if the city level is 3.
            const cityLevel = burgh.level;
            const citySize = 4 * cityLevel + 1;
            // Get color- current color value is a string set such that each 3 character key refers to one r, g, b respectively, so we need to split it into an array of integers
            const colorArray = color.match(/.{1,3}/g).map(val => parseInt(val));
            ctx.fillStyle = `rgb(${colorArray[0]}, ${colorArray[1]}, ${colorArray[2]})`;
            ctx.fillRect(x_pixel - (citySize - 1) / 2, y_pixel - (citySize - 1) / 2, citySize, citySize);

            console.log(x_pixel - (citySize - 1) / 2, y_pixel - (citySize - 1) / 2, citySize, citySize);
        }

        // Save the processed image
        const outputImagePath = path.join(__dirname, './assets/images/ScotlandCitiesMap.png');
        const out = fs.createWriteStream(outputImagePath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);
    } catch (error) {
        console.error('Error processing image:', error.message);
    }
};

processImage();
