const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const readline = require('readline');
const { text } = require('stream/consumers');
const exec = require('child_process').exec;

// Setup readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper to prompt the user and return a promise
function promptUser(query) {
    return new Promise(resolve => {
        rl.question(query, answer => {
            resolve(answer.trim().toLowerCase());
        });
    });
}

// Backup existing file into a subfolder
function backupFile(filePath) {
    if (fs.existsSync(filePath)) {
        const backupsDir = path.join(__dirname, 'data', 'backups');
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupsDir, `castles_${timestamp}.json`);
        fs.copyFileSync(filePath, backupPath);
        console.log(`Backed up previous file to ${backupPath}`);
    }
}

// Fetch HTML of a page
async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (error) {
        console.error(`Error fetching ${url}: ${error}`);
        return null;
    }
}

// Modified: Classify a date string from the table as 'pre', 'post', or 'unknown'
// Now accounts for mixed date information.
function classifyTableDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return 'unknown';
    const lowerDateStr = dateStr.toLowerCase();

    let preClues = 0;
    let postClues = 0;

    // Check for century references
    if (lowerDateStr.includes('11th')) preClues++;
    if (lowerDateStr.includes('12th')) preClues++;
    if (lowerDateStr.includes('13th')) preClues++;  // Default to pre for 13th
    if (lowerDateStr.includes('14th')) postClues++;
    if (lowerDateStr.includes('15th')) postClues++;
    if (lowerDateStr.includes('16th')) postClues++;
    if (lowerDateStr.includes('17th')) postClues++;
    if (lowerDateStr.includes('18th')) postClues++;
    if (lowerDateStr.includes('19th')) postClues++;
    if (lowerDateStr.includes('20th')) postClues++;

    // Extract all numeric dates (e.g., "1290", "1292", "1200")
    const yearMatches = lowerDateStr.match(/\d{3,4}/g);
    if (yearMatches) {
        yearMatches.forEach(match => {
            const year = parseInt(match);
            if (year > 1291) {
                postClues++;
            } else {
                preClues++;
            }
        });
    }

    // If clues conflict (i.e. both pre and post indicators), mark as unknown.
    if (preClues > 0 && postClues > 0) return 'unknown';
    if (postClues > 0) return 'post';
    if (preClues > 0) return 'pre';
    return 'unknown';
}

// Extract the earliest year (between 1000 and 1291) found in the text
function extractEarliestPre1291Year(text) {
    let earliest = null;
    let pre1291Found = false;
    let post1291Found = false;

    // Match explicit years
    const yearRegex = /(?<!\.)\b(1[0-2]\d{2})\b/g;
    let match;
    while ((match = yearRegex.exec(text)) !== null) {
        const year = parseInt(match[1]);
        if (year <= 1291) {
            console.log(year);
            pre1291Found = true;
            if (earliest === null || year < earliest) {
                earliest = year;
            }
        }
    }

    // If no exact years are found, check for century-based estimates
    if (!earliest) {
        if (/11th century/.test(text)) {
            earliest = "11th Century";
            pre1291Found = true;
        } else if (/12th century/.test(text)) {
            earliest = "12th Century";
            pre1291Found = true;
        } else if (/13th century/.test(text)) {
            earliest = "13th Century"; // Still ambiguous
            pre1291Found = true;
        }
    }

    // Check if post-1291 years exist
    const postYearRegex = /\b(1[3-9]\d{2})\b/g;
    while ((match = postYearRegex.exec(text)) !== null) {
        post1291Found = true;
    }

    return { earliest, pre1291Found, post1291Found };
}

// Search the page text for any reference to a pre-1291 date.
// Returns 'pre' if found, 'post' if only post-1291 numbers appear, 'mixed' if both exist, else 'unknown'
function classifyPageDates(text) {
    const { earliest, pre1291Found, post1291Found } = extractEarliestPre1291Year(text);

    if (pre1291Found) return 'pre';
    if (post1291Found) return 'post';

    return 'unknown'; // No relevant years found
}

// Extract coordinates (lat/long) from a Wikipedia page
function extractCoordinates(html) {
    const $ = cheerio.load(html);
    // Many Wikipedia pages include coordinates in a span with class "geo"
    const geoSpan = $('.geo').first();
    if (geoSpan.length) {
        const coordText = geoSpan.text().trim();
        // Coordinates are usually separated by a comma or semicolon
        const parts = coordText.replace(';', ',').split(',');
        if (parts.length >= 2) {
            const lat = parts[0].trim();
            const lon = parts[1].trim();
            return { lat, lon };
        }
    }
    return null;
}


// Extract the main content text from a Wikipedia page
function extractPageText(html) {
    const $ = cheerio.load(html);
    // Most Wikipedia pages have the main content in #mw-content-text
    const content = $('#mw-content-text').text();
    return content.trim();
}

// Process a single castle entry from a table row
async function processCastle(castle) {
    const { name, tableDate, pageUrl } = castle;
    console.log(`\nProcessing castle: ${name}`);
    console.log(`Table date info: ${tableDate}`);
    console.log(`Fetching castle page: ${pageUrl}`);

    // Classify the date from the table using the modified function
    const tableClassification = classifyTableDate(tableDate);
    console.log(`Table classification: ${tableClassification}`);

    // Fetch and process the castle's own page
    const castleHtml = await fetchHTML(pageUrl);
    if (!castleHtml) return null;
    const pageText = extractPageText(castleHtml);
    const pageClassification = classifyPageDates(pageText);
    console.log(`Page classification: ${pageClassification}`);

    // Decide whether to proceed:
    // - If both table and page indicate pre-1291, proceed automatically.
    // - If both indicate post-1291, skip.
    // - Otherwise, prompt the user.
    let proceed = false;
    if (tableClassification === 'pre' && pageClassification === 'pre') {
        proceed = true;
    } else if (tableClassification === 'post' && pageClassification === 'post' || tableClassification === 'unknown' && pageClassification === 'post') {
        console.log(`Skipping ${name} as it appears post-1291.`);
        return null;
    } else {
        console.log(`Ambiguous/conflicting date info for ${name}.`);
        console.log(`Table date: ${tableDate}`);
        console.log(`Page text snippet: ${pageText.substring(0, 300)}...`);
        exec(`start "" "${pageUrl}"`);
        const answer = await promptUser(`Include ${name}? (y/n, s to stop): `);
        if (answer === 's') {
            return "stop";
        } else if (answer === 'y' || answer === 'yes') {
            proceed = true;
        }
    }

    if (!proceed) {
        console.log(`Excluding ${name}.`);
        return null;
    }

    // If including, get the earliest pre-1291 date found on the page (if any)
    const earliestDate = extractEarliestPre1291Year(pageText);
    const coordinates = extractCoordinates(castleHtml);
    const cleanText = extractCleanText(castleHtml);
    return { name, wikiPage: pageUrl, text: cleanText, earliestDate, coordinates };
}

// Process a subpage containing one or more castle tables
async function processSubpage(url) {
    console.log(`\nProcessing subpage: ${url}`);
    const html = await fetchHTML(url);
    if (!html) return [];
    const $ = cheerio.load(html);
    const results = [];

    // Wikipedia tables usually have the class "wikitable"
    $('table.wikitable').each((i, table) => {
        // Process each table row (skipping the header row)
        $(table).find('tr').slice(1).each((j, row) => {
            const cells = $(row).find('td');
            if (cells.length === 0) return; // not a data row
            // Assume the first cell holds the castle name and link.
            const nameCell = $(cells[0]);
            const link = nameCell.find('a').attr('href');
            const name = nameCell.text().trim();

            // Assume the second cell holds the date information.
            const dateCell = $(cells[2]);
            const tableDate = dateCell.text().trim();

            if (link) {
                // Build full Wikipedia URL if needed.
                const pageUrl = link.startsWith('http') ? link : `https://en.wikipedia.org${link}`;
                results.push({ name, tableDate, pageUrl });
            }
        });
    });
    return results;
}

async function getSubpageLinks(mainUrl) {
    const html = await fetchHTML(mainUrl);
    if (!html) return [];
    const $ = cheerio.load(html);
    const subpageLinks = [];

    // Locate the h2 element with id "Lists_by_council_area"
    const heading = $('#Lists_by_council_area');
    if (!heading.length) {
        console.error("Heading with id 'Lists_by_council_area' not found. Falling back to main page.");
        return [mainUrl];
    }
    console.log("Found heading:", heading.text().trim());

    // Get the container for the heading (the div with class "mw-heading mw-heading2")
    const container = heading.parent();

    // Get all sibling elements until the next div with class "mw-heading"
    const sectionElements = container.nextUntil('div.mw-heading');

    // Look for links in this section. We want only links to pages like "List_of_castles_in_XXX"
    sectionElements.find('a').each((i, elem) => {
        const href = $(elem).attr('href');
        // Check that the href starts with '/wiki/List_of_castles_in_' 
        // and exclude the main page '/wiki/List_of_castles_in_Scotland'
        if (
            href &&
            href.startsWith('/wiki/List_of_castles_in_') &&
            href !== '/wiki/List_of_castles_in_Scotland'
        ) {
            const fullUrl = `https://en.wikipedia.org${href}`;
            if (!subpageLinks.includes(fullUrl)) {
                subpageLinks.push(fullUrl);
            }
        }
    });

    if (subpageLinks.length === 0) {
        console.warn("No subpage links found under 'Lists by council area'. Falling back to main page.");
        subpageLinks.push(mainUrl);
    }
    return subpageLinks;
}

function extractCleanText(html) {
    const $ = cheerio.load(html);

    // Remove unnecessary elements
    $('style, script, .mw-editsection, .navbar, .printfooter, .mw-parser-output .reflist, .infobox, .metadata, .navbox').remove();

    // Extract main content
    const content = $('#mw-content-text').text().trim();

    // Remove excessive newlines and spaces
    return content.replace(/\n\s*\n/g, '\n').replace(/\s{2,}/g, ' ');
}

// Main reprocessing function for "freshRun" = true
async function reprocessAllAccepted(outputPath) {
    if (!fs.existsSync(outputPath)) {
        console.log("No existing data to reprocess. Exiting.");
        return;
    }

    console.log("Reprocessing existing data with no user prompts...");
    const oldData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const newResults = [];

    for (const oldCastle of oldData) {
        // Re-fetch, re-parse, skip user input, always keep
        const updatedCastle = await reprocessCastle(oldCastle);
        if (updatedCastle) {
            newResults.push(updatedCastle);
        }
    }

    // Overwrite the file with new data
    fs.writeFileSync(outputPath, JSON.stringify(newResults, null, 2), 'utf-8');
    console.log(`Reprocessed ${newResults.length} castles, saved to ${outputPath}`);
}

async function reprocessCastle(castleData) {
    // castleData was previously accepted
    // Just re-fetch & rebuild data with new logic, no user input
    const { name, wikiPage } = castleData;
    console.log(`\nReprocessing castle (no prompts): ${name}`);
    console.log(`Fetching castle page: ${wikiPage}`);

    const castleHtml = await fetchHTML(wikiPage);
    if (!castleHtml) return null;

    const pageText = extractPageText(castleHtml);
    const earliestDate = extractEarliestPre1291Year(pageText);
    const coordinates = extractCoordinates(castleHtml);
    const cleanText = extractCleanText(castleHtml);

    return {
        name,
        wikiPage,
        text: cleanText,
        earliestDate,
        coordinates
    };
}

// Main scraper routine
async function main(freshRun = false) {
    const mainUrl = 'https://en.wikipedia.org/wiki/List_of_castles_in_Scotland';
    const outputPath = path.join(__dirname, './data/castles.json');

    if (freshRun) {
        await reprocessAllAccepted(outputPath);
        rl.close();
        return;
    }

    if (fs.existsSync(outputPath)) {
        backupFile(outputPath);
    }

    let finalResults = [];
    let processedUrls = new Set();

    // Load existing accepted castles (if any) and determine the last accepted castle.
    if (fs.existsSync(outputPath)) {
        try {
            finalResults = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            if (finalResults.length > 0) {
                // Record the wikiPage of the last accepted castle.
                var lastAcceptedPage = finalResults[finalResults.length - 1].wikiPage;
                console.log(`Resuming from castle after: ${lastAcceptedPage}`);
            } else {
                // No previous results: start processing immediately.
                lastAcceptedPage = null;
            }
        } catch (e) {
            console.error("Error reading existing file, starting fresh.");
            lastAcceptedPage = null;
        }
    } else {
        lastAcceptedPage = null;
    }

    // We use a flag to indicate when to resume processing.
    // If there's no previous data, resumeProcessing is true immediately.
    let resumeProcessing = lastAcceptedPage ? false : true;

    const subpages = await getSubpageLinks(mainUrl);

    for (const subpage of subpages) {
        const castleEntries = await processSubpage(subpage);
        for (const castle of castleEntries) {
            if (!resumeProcessing) {
                if (castle.pageUrl === lastAcceptedPage) {
                    resumeProcessing = true;
                    console.log(`Reached last accepted castle: ${castle.name}. Resuming after this castle.`);
                }
                console.log(`Skipping (already processed): ${castle.name}`);
                continue;
            }
            if (processedUrls.has(castle.pageUrl)) {
                console.log(`Skipping already processed: ${castle.name}`);
                continue;
            }
            const result = await processCastle(castle);
            if (result === "stop") {
                console.log("Stopping as requested by user.");
                fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2), 'utf-8');
                rl.close();
                process.exit(0);
            }
            if (result) {
                finalResults.push(result);
                processedUrls.add(castle.pageUrl);
            }
        }
    }

    fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2), 'utf-8');
    console.log(`\nSaved ${finalResults.length} castles to ${outputPath}`);
    rl.close();
}

//Text section length checker
async function textSectionLengthChecker() {
    //Print out all the text sections of each castle combined
    const data = JSON.parse(fs.readFileSync('./data/castles.json', 'utf8'));
    let totalLength = 0;
    for (const castle of data) {
        totalLength += castle.text.length;
    }
    console.log(`Total text length: ${totalLength}`);
    console.log(`Number of castles: ${data.length}`); 
}

// textSectionLengthChecker();

main();