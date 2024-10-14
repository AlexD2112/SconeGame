const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Define file paths
const mapDataPath = path.join(__dirname, './data/map-data.json');
const familyTreePath = path.join(__dirname, './data/family-trees.json');

const loadMapData = () => {
    const rawData = fs.readFileSync(mapDataPath);
    return JSON.parse(rawData);
};

const processFamilyTrees = async () => {
    const mapData = loadMapData();

    // Check every region and update two seperate maps- a map of clan names to members, and a map of members to titles.
    const clanMap = {};
    const titleMap = {};
    
    for (const region of Object.values(mapData.regions)) {
        // Check if the region has an owner, under "possessor" key
        if (region.possessor) {
            const clanName = region.possessor_clan;
            const member = region.possessor;
            const title = region.status;

            // Update clan map
            if (!clanMap[clanName]) {
                clanMap[clanName] = [member];
            } else if (!clanMap[clanName].includes(member)) {
                clanMap[clanName].push(member);
            }

            // Update title map- member can have multiple titles. Should be identified as part of an array of titles, with keys both "title" and "region"
            if (!titleMap[member]) {
                titleMap[member] = [{ title, region: region.name }];
            } else {
                titleMap[member].push({ title: title, region: region.name });
            }
        } else {
            // Landowners will be identified as part of the notable_landowners array, each value having both "Name" and "Clan" keys. Title here is "Laird"
            for (const landowner of region.notable_landowners) {
                const member = landowner.name;
                const clanName = landowner.clan;
                const title = 'Laird';

                // Update clan map
                if (!clanMap[clanName]) {
                    clanMap[clanName] = [member];
                } else if (!clanMap[clanName].includes(member)) {
                    clanMap[clanName].push(member);
                }

                // Update title map
                if (!titleMap[member]) {
                    titleMap[member] = [{ title: title, region: region.name }];
                } else {
                    titleMap[member].push({ title: title, region: region.name });
                }
            }
        }
    }

    // Save family data to a JSON file
    const familyData = { clanMap, titleMap };
    fs.writeFileSync(familyTreePath, JSON.stringify(familyData, null, 2));
}

processFamilyTrees();