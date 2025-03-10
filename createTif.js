const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { execSync, exec } = require("child_process");

// Paths
const zipFolder = "D:/Downloads/FABDEM/s5hqmjcdj8yo2ibzi9b4ew3sn";
const requiredTilesFile = "./data/requiredTiles.json";
const extractPath = "./temp_extracted_tiles";
const outputPath = "assets/elevationMaps/master.tif";

// Ensure extraction folder exists
if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });

// Load required tile names
const requiredTiles = new Set(JSON.parse(fs.readFileSync(requiredTilesFile, "utf-8")));
console.log(`Loaded ${requiredTiles.size} required tiles.`);

// Function to check if a ZIP contains a needed tile
function zipContainsTile(zipFile, tile) {
    const match = zipFile.match(/N(\d{2,3})([EW])(\d{3})-N(\d{2,3})([EW])(\d{3})/);
    if (!match) return false;

    const [_, minLat, minLonDir, minLon, maxLat, maxLonDir, maxLon] = match.map((v) =>
        isNaN(v) ? v : Number(v)
    );

    let minLonNum = minLonDir === "W" ? -minLon : minLon;
    let maxLonNum = maxLonDir === "W" ? -maxLon : maxLon;

    const tileMatch = tile.match(/N(\d{2,3})([EW])(\d{3})/);
    if (!tileMatch) return false;

    const [__, tileLat, tileLonDir, tileLon] = tileMatch;
    const tileLatNum = Number(tileLat);
    let tileLonNum = tileLonDir === "W" ? -Number(tileLon) : Number(tileLon);

    return tileLatNum >= minLat && tileLatNum <= maxLat && tileLonNum >= minLonNum && tileLonNum <= maxLonNum;
}

// **🔹 Extract all required tiles & return a list of file paths**
async function extractRequiredTiles() {
    const zipFiles = fs.readdirSync(zipFolder).filter((file) => file.endsWith(".zip"));
    let extractedFiles = [];

    let extractionPromises = zipFiles.map((zipFile) => {
        if (![...requiredTiles].some((tile) => zipContainsTile(zipFile, tile))) return Promise.resolve();

        const zipPath = path.join(zipFolder, zipFile);
        console.log(`Extracting from ZIP: ${zipFile}`);

        return new Promise((resolve, reject) => {
            const promises = [];

            fs.createReadStream(zipPath)
                .pipe(unzipper.Parse())
                .on("entry", (entry) => {
                    const fileName = path.basename(entry.path);
                    if (requiredTiles.has(fileName)) {
                        const outputFilePath = path.join(extractPath, fileName);
                        console.log(`Extracting: ${fileName}`);
                        extractedFiles.push(outputFilePath);

                        // Ensure resolve happens after writing completes
                        promises.push(
                            new Promise((fileResolve, fileReject) => {
                                entry
                                    .pipe(fs.createWriteStream(outputFilePath))
                                    .on("finish", fileResolve)
                                    .on("error", fileReject);
                            })
                        );
                    } else {
                        entry.autodrain();
                    }
                })
                .on("close", async () => {
                    await Promise.all(promises); // Wait for all files in this ZIP to finish writing
                    resolve();
                })
                .on("error", reject);
        });
    });

    await Promise.all(extractionPromises); // ✅ Ensure all files are extracted before merging
    return extractedFiles;
}

// **🔹 Check Extent of Extracted Tiles**
function checkExtent(files) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;

    files.forEach((file) => {
        try {
            let gdalOutput = execSync(`gdalinfo "${file}"`, { encoding: "utf-8" });

            const ulMatch = gdalOutput.match(/Upper Left\s+\(\s*([-.\d]+),\s*([-.\d]+)\)/);
            const lrMatch = gdalOutput.match(/Lower Right\s+\(\s*([-.\d]+),\s*([-.\d]+)\)/);

            if (ulMatch && lrMatch) {
                let ulLon = parseFloat(ulMatch[1]), ulLat = parseFloat(ulMatch[2]);
                let lrLon = parseFloat(lrMatch[1]), lrLat = parseFloat(lrMatch[2]);

                if (ulLon < minLon) minLon = ulLon;
                if (ulLat > maxLat) maxLat = ulLat;
                if (lrLon > maxLon) maxLon = lrLon;
                if (lrLat < minLat) minLat = lrLat;
            }
        } catch (error) {
            console.error(`Error checking extent for ${file}:`, error.message);
        }
    });

    console.log(`📌 Extracted Files Bounding Box: UL (${maxLat}, ${minLon}) -> LR (${minLat}, ${maxLon})`);
}

async function mergeTiles(extractedFiles) {
    if (extractedFiles.length === 0) {
        console.error("❌ No tiles extracted. Exiting.");
        process.exit(1);
    }

    console.log("🔄 Merging tiles in batches...");
    const batchSize = 10; // Adjust batch size if needed
    let batchFiles = [];
    let batchIndex = 1;

    for (let i = 0; i < extractedFiles.length; i += batchSize) {
        batchFiles = extractedFiles.slice(i, i + batchSize);
        const batchOutput = `assets/elevationMaps/batch_${batchIndex}.tif`;

        console.log(`🗂️ Merging batch ${batchIndex}:`, batchFiles);
        const gdalCommand = `gdal_merge.py -o ${batchOutput} -co COMPRESS=LZW -co BIGTIFF=YES -n -9999 -a_nodata -9999 -init -9999 ${batchFiles.join(" ")}`;

        console.log("Executing GDAL command:", gdalCommand);

        try {
            execSync(gdalCommand, { stdio: "inherit" });
        } catch (error) {
            console.error(`❌ Error merging batch ${batchIndex}:`, error.message);
            return;
        }

        batchIndex++;
    }

    // Ensure all batch files exist before final merge
    const fs = require("fs");
    const batchFilesList = fs.readdirSync("assets/elevationMaps")
        .filter(file => file.startsWith("batch_") && file.endsWith(".tif"))
        .map(file => `assets/elevationMaps/${file}`);

    if (batchFilesList.length === 0) {
        console.error("❌ No batch files found for final merge. Exiting.");
        process.exit(1);
    }

    console.log("🔄 Merging all batch files into final DEM...");
    console.log("Batch files being merged:", batchFilesList.join("\n"));

    // Final merge
    const finalCommand = `gdal_merge.py -o ${outputPath} -co COMPRESS=LZW -co BIGTIFF=YES -n -9999 -a_nodata -9999 -init -9999 ${batchFilesList.join(" ")}`;

    console.log("Executing final GDAL command:", finalCommand);

    try {
        execSync(finalCommand, { stdio: "inherit" });
    } catch (error) {
        console.error("❌ Error merging final DEM:", error.message);
        process.exit(1);
    }

    console.log(`✅ Final merged DEM saved to ${outputPath}`);
}


// **Run extraction & merging in the correct order**
(async () => {
    const extractedFiles = await extractRequiredTiles(); // ✅ Extract and return .tif files
    console.log(`All extractions complete. Extracted files:`, extractedFiles);

    // 🔹 Check extent before merging
    checkExtent(extractedFiles);

    await mergeTiles(extractedFiles); // ✅ Merge only those extracted files

    console.log("Process complete.");
})();
