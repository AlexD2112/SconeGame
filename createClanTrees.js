const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = "qbkmk67Duz2fZvaBFa0G3FKOapatAjVcwHJbmSpG ";

// Base URL for the Geni API
const API_BASE_URL = 'https://www.geni.com/api/';

async function getFamilyTree(profileId) {
    try {
        // Example endpoint to get the profile information of a user based on profileId
        const url = `${API_BASE_URL}profile-${profileId}?access_token=${API_KEY}`;

        // Make the API request using axios
        const response = await axios.get(url);

        // Extract the data from the response
        const profileData = response.data;

        // Log the data (or you could process it further)
        console.log('Profile Data:', profileData);

        // Process family tree (This part could be expanded based on your specific needs)
        if (profileData && profileData.tree) {
            console.log('Family Tree:', profileData.tree);
        }
    } catch (error) {
        console.error('Error fetching family tree:', error.response ? error.response.data : error.message);
    }
}

const testID = "6000000003645825392"
getFamilyTree(testID);