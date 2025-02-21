const fs = require('fs');
const path = require('path');
const axios = require('axios');

const geniDataPath = path.join(__dirname, './data/geni-profiles.json');

let geniData;

const blackList = [
    'https://www.geni.com/people/Robert-de-Tyndale/6000000010337054868',
    'https://www.geni.com/people/Aliva-de-Braose/6000000000796840899'
];

const loadGeniData = async () => {
    const rawData = fs.readFileSync(geniDataPath);
    return JSON.parse(rawData);
};

const generateFamilyTree = async (profileLink, father = null, mother = null) => {
    try {
        // Check the name under content in section marked <h1 itemprop="name">Duncan I, King of Scots</h1>
        let characterID = Object.keys(geniData).find(id => geniData[id].geni_profile === profileLink);
        if (characterID && characterID.birthYear) {
            if (father) {
                geniData[characterID].father = father;
            }n
            if (mother) {
                geniData[characterID].mother = mother;
            }
            return characterID;
        }
        const profileData = await getProfileData(profileLink);

        if (!characterID) {
            //Find next available ID
            const ids = Object.keys(geniData).map(id => parseInt(id));
            const maxID = Math.max(...ids);
            characterID = (maxID + 1).toString();
            geniData[characterID] = {}
        }
        if (!geniData[characterID].name) {
            geniData[characterID].name = profileData.name;
        }
        geniData[characterID].birthYear = profileData.birthYear;
        if (profileData.deathYear) {
            //Check if minimum value is 1292 or greater. If it is, set to "alive" instead
            const deathYears = profileData.deathYear.map(year => parseInt(year));
            if (Math.min(...deathYears) >= 1292) {
                profileData.deathYear = "alive";
            } else if (Math.max(...deathYears) >= 1292) {
                console.log(`May be alive: ${profileData.name}`);
            }
        }
        geniData[characterID].deathYear = profileData.deathYear;
        geniData[characterID].gender = profileData.gender;
        geniData[characterID].geni_profile = profileLink;
        console.log(geniData[characterID].name);

        //Find minimum value in birth year array. If it is 1292 or greater, delete. Will need to convert to number first
        if (profileData.birthYear) {
            const birthYears = profileData.birthYear.map(year => parseInt(year));
            if (Math.min(...birthYears) >= 1292 || profileData.name.includes('NN') || profileData.name.includes('Unknown') || profileData.name.includes('N.N')) {
                delete geniData[characterID];
                console.log(`Deleted!`)
                return null;
            }
        } else {
            delete geniData[characterID];
            console.log(`Deleted!`)
            return null;
        }


        if (father) {
            geniData[characterID].father = father;
        }
        if (mother) {
            geniData[characterID].mother = mother;
        }

        if (profileData.fatherOf) {
            const childPromises = profileData.fatherOf.map(childLink => generateFamilyTree(childLink, characterID, null));
            const childIDs = await Promise.all(childPromises);
            geniData[characterID].children = childIDs.filter(id => id);
        }

        if (profileData.motherOf) {
            const childPromises = profileData.motherOf.map(childLink => generateFamilyTree(childLink, null, characterID));
            const childIDs = await Promise.all(childPromises);
            geniData[characterID].children = childIDs.filter(id => id);
        }

        return characterID;
    } catch (error) {
        console.error(`Failed to fetch or parse data for ${profileLink}:`, error.message);
        return null;
    }
};

const getProfileData = async (profileLink) => {
    try {
        const response = await axios.get(profileLink);
        const profileData = response.data;

        //Save data to file duncan-data.json in data folder
        let name = profileData.match(/<h1 itemprop="name">(.+)<\/h1>/)[1];
        //Name should be name before first comma
        name = name.split(',')[0];

        //Birthdate is value in here: <time id="birth_date" itemprop="birthDate" content="1001-08-15">August 15, 1001</time>
        let birthYear = profileData.match(/<time id="birth_date" itemprop="birthDate" content="(.+)">(.+)<\/time>/);
        if (!birthYear) {
            birthYear = null;
        } else {
            birthYear = birthYear[0];
            //Only grab text between > and <, which is the date
            birthYear = birthYear.match(/>([^<]+)</)[1];
            const beforeYear = birthYear.includes('before') || birthYear.includes('Before');
            const circaYear = birthYear.includes('circa') || birthYear.includes('Circa');
            birthYear = birthYear.match(/\d{4}/g);
            if (beforeYear) {
                let altBirthYear = parseInt(birthYear[0]) - 20;
                birthYear = [altBirthYear + "", birthYear[0]];
            }
            if (circaYear) {
                //Birth year should be 15 years before and 15 years after the year
                let minBirthYear = parseInt(birthYear[0]) - 15;
                let maxBirthYear = parseInt(birthYear[0]) + 15;
                birthYear = [minBirthYear + "", maxBirthYear + ""];
            }
        }

        //Death year is format <span itemprop="deathDate" content="1135-uu-uu"> before circa 1135 </span>
        let deathHTML = profileData.match(/<span itemprop='deathDate' content="[^"]+">\s*([^<]+)\s*<\/span>/);
        let deathYear;
        if (deathHTML) {
            deathHTML = deathHTML[1];
            const beforeYear = deathHTML.includes('before') || deathHTML.includes('Before');
            const circaYear = deathHTML.includes('circa') || deathHTML.includes('Circa');
            deathYear = deathHTML.match(/\d{4}/g);
            if (beforeYear) {
                //Alt death year is maximum of min birth year + 15 and 20 years before death year
                let altDeathYear = Math.max(parseInt(birthYear[0]) + 15, parseInt(deathYear[0]) - 20);
                if (altDeathYear < deathYear) {
                    deathYear = [altDeathYear + "", deathYear[0]];
                }
            }
            if (circaYear) {
                //Death year should be 15 years before and 15 years after the year, though check minimum value is greater than birth year
                let minDeathYear = Math.max(parseInt(birthYear[0]), parseInt(deathYear[0]) - 15);
                let maxDeathYear = parseInt(deathYear[0]) + 15;
                deathYear = [minDeathYear + "", maxDeathYear + ""];
            }
        } else {
            //deathYear should be 3 years after latest birth year- if multiple birth years, use the latest one (biggest number)
            deathYear = null;
        }

        //Check gender by finding index of first "Son of" or "Daughter of". If it's a son, son of will appear first
        let gender;
        const sonIndex = profileData.indexOf('Son of');
        const daughterIndex = profileData.indexOf('Daughter of');
        if (sonIndex != -1 && (sonIndex < daughterIndex || daughterIndex === -1)) {
            gender = "Male"
        } else {
            gender = "Female"
        }

        let fatherOf = null;
        let motherOf = null;
        if (gender === "Male") {
            //Make an array of everyone who this is a father of. This is every href link after Father of and before the next <br>. They aren't contained in a span or anything
            fatherOf = profileData.match(/Father of[\s\S]*?<br\/>/);
            if (fatherOf) {
                fatherOf = fatherOf[0].match(/href="([^"]+)"/g);
                //Extract the link from the href="link" format
                fatherOf = fatherOf.map(link => link.match(/href="([^"]+)"/)[1]);
                fatherOf = fatherOf.filter(link => !blackList.includes(link));
            }
        } else {
            motherOf = profileData.match(/Mother of[\s\S]*?<br\/>/);
            if (motherOf) {
                motherOf = motherOf[0].match(/href="([^"]+)"/g);
                motherOf = motherOf.map(link => link.match(/href="([^"]+)"/)[1]);
                motherOf = motherOf.filter(link => !blackList.includes(link));
            }
        }
        //If profile is blacklisted, remove fatherof and motherof sections so it doesn't perpetuate lines of blacklisted people
        if (blackList.includes(profileLink)) {
            fatherOf = null;
            motherOf = null;
        }

        //Check birthplace and death. If it includes Germany, German, Italy, Italian, Spain, Spanish, Poland, Polish, Hungary, Hungarian, than set name to NN
        let birthPlace = profileData.match(/birth_location[\s\S]*?<\/td>/);
        if (birthPlace) {
            birthPlace = birthPlace[0];
            // if (birthPlace.includes('Germany') || birthPlace.includes('German') || birthPlace.includes('Italy') || birthPlace.includes('Italian') || birthPlace.includes('Spain') || birthPlace.includes('Spanish') || birthPlace.includes('Poland') || birthPlace.includes('Polish') || birthPlace.includes('Hungary') || birthPlace.includes('Hungarian') || birthPlace.includes('France') || birthPlace.includes('French')) {
            //     name = "NN";
            // }
        }
        let deathPlace = profileData.match(/deathDate[\s\S]*?<\/td>/);
        if (deathPlace) {
            deathPlace = deathPlace[0];
            // if (deathPlace.includes('Germany') || deathPlace.includes('German') || deathPlace.includes('Italy') || deathPlace.includes('Italian') || deathPlace.includes('Spain') || deathPlace.includes('Spanish') || deathPlace.includes('Poland') || deathPlace.includes('Polish') || deathPlace.includes('Hungary') || deathPlace.includes('Hungarian')) {
            //     name = "NN";
            // }
        }

        return { name: name, birthYear: birthYear, deathYear: deathYear, gender: gender, fatherOf: fatherOf, motherOf: motherOf };
    }
    catch (error) {
        //Have computer timeout for 2 seconds and try again
        console.log(`Error fetching data for ${profileLink}:`, error.message);
        //Await for two seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getProfileData(profileLink);
    }
}

//Create async function to generate family tree
// const runAsync = async () => {
//     // await generateFamilyTree("https://www.geni.com/people/Uchtred-fitz-Uchtred/6000000011782206678");
//     // await generateFamilyTree("https://www.geni.com/people/Duncan-I-King-of-Scots/6000000005037689063");
//     // await generateFamilyTree("https://www.geni.com/people/Gille-M%C3%ADch%C3%A9il-MacDuff-Earl-of-Fife/6000000037060601014");
//     //await generateFamilyTree("https://www.geni.com/people/Beth%C3%B3c-ingen-Domnaill/6000000003645825784");
// };

const generateFullTree = async (profileLink) => {
    //Wait for geni data to be loaded. Once it is, generate the full tree
    geniData = await loadGeniData();
    await generateFamilyTree(profileLink);
    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

const cleanLoosePeople = async () => {
    geniData = await loadGeniData();
    // Delete all people with no birth year and no children
    const people = Object.keys(geniData);
    for (const person of people) {
        if (!geniData[person].birthYear && !geniData[person].children) {
            delete geniData[person];
        }
    }
    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

const checkInconsistencies = async () => {
    //Make sure everyones earliest birth year is less than their latest death year, their earliest birth year is at least 15 years before every childs latest birth year, and their latest death year is after (or the same year as) every childs earliest birth year
    geniData = await loadGeniData();
    let people = Object.keys(geniData);

    let i = 0;
    const promises = [];

    //Make people an array of only living people and their parents
    let people2 = [];
    for (const person of Object.keys(geniData)) {
        if (geniData[person].deathYear === "alive") {
            people.push(person);
            if (geniData[person].father) {
                people2.push(geniData[person].father);
            }
            if (geniData[person].mother) {
                people2.push(geniData[person].mother);
            }
        }
    }
    //Delete duplicates
    people2 = [...new Set(people2)];
    people = [];
    people = people.concat(people2);
    //Log length of people

    for (const person of people) {
        //Only check people that are alive and their parents
        if (!geniData[person]) {
            console.log(person);
        }
        if (geniData[person].birthYear && geniData[person].deathYear) {
            const birthYears = geniData[person].birthYear.map(year => parseInt(year));
            let deathYears;
            if (geniData[person].deathYear === "alive") {
                deathYears = [2021];
            } else {
                deathYears = geniData[person].deathYear.map(year => parseInt(year));
            }
            const children = geniData[person].children;
            if (children) {
                for (const child of children) {
                    let childBirthYears = geniData[child].birthYear;
                    let childDeathYears = geniData[child].deathYear;
                    if (!childBirthYears) {
                    } else if (!childDeathYears) {
                    } else {
                        childBirthYears = childBirthYears.map(year => parseInt(year));
                        if (Math.min(...birthYears) + 15 > Math.max(...childBirthYears)) {
                            i++;
                            console.log("Earliest birth year of parent" + geniData[person].name + ", +15:", Math.min(...birthYears) + 15);
                            console.log("Latest birth year of child:", Math.max(...childBirthYears));
                            console.log("Latest death year of parent:", Math.max(...deathYears));
                            //If birth year is within 5 years of a possible time, just adjust it to that 
                            if (Math.min(...birthYears) + 15 <= Math.max(...childBirthYears) - 5) {
                                geniData[person].birthYear = ["" + (Math.max(...childBirthYears) - 15)];
                                console.log(`${geniData[person].name} has birth year adjusted to ${Math.max(...childBirthYears) - 15}`);
                            } else if (child > 1050) {
                                geniData[child].birthYear = ["" + (Math.min(...birthYears) + 15)];
                                console.log(`${geniData[child].name} has birth year adjusted to ${Math.min(...birthYears) + 15}`);
                            } else {
                                console.log(`${geniData[person].name}, at ${geniData[person].geni_profile} has inconsistent birth/death years with ${geniData[child].name}`);
                            }
                        } else if (Math.max(...deathYears) < Math.min(...childBirthYears) - 1) {
                            i++;
                            console.log("Earliest birth year of parent " + geniData[person].name + ":", Math.min(...birthYears));
                            console.log("Latest birth year of child:", Math.max(...childBirthYears));
                            console.log("Latest death year of parent:", Math.max(...deathYears));
                            console.log(`${geniData[person].name}, at ${geniData[person].geni_profile} has inconsistent birth/death years with ${geniData[child].name}`);
                            // Check if parent has a death date online- if not, just change their death date to 5 years after the childs birth date
                            // const promise = getProfileData(geniData[person].geni_profile).then(data => {
                            //     if (!data.deathYear) {
                            //         geniData[person].deathYear = [Math.min(...childBirthYears) + 5];
                            //         console.log(`${geniData[person].name} has no death year, so it was set to ${Math.min(...childBirthYears) + 5}`);
                            //     }
                            // });
                            // promises.push(promise);
                        }
                    }
                }
            }

            if (Math.min(...birthYears) > Math.max(...deathYears)) {
                i++;
                console.log(`${geniData[person].name} at ${geniData[person].geni_profile} has inconsistent birth/death years`);
            }
        } else {
            i++;
            if (!geniData[person].birthYear) {
                console.log(`${geniData[person].name} has no birth year`);
            } else if (!geniData[person].deathYear) {
                //Check if minimum value of birth year is 1250 or greater. If it is, set to "alive" instead
                const birthYears = geniData[person].birthYear.map(year => parseInt(year));
                if (Math.min(...birthYears) >= 1250 || Math.max(...birthYears) >= 1290) {
                    geniData[person].deathYear = "alive";
                } else if (Math.min(...birthYears) <= 1231 && Math.max(...birthYears) <= 1250) {
                    //Two death options to be put in array- 45 years after birth year and the minimum value between 10 years before 1290 and 65 years after latest birth year
                    let deathYearOption1 = Math.min(...birthYears) + 45;
                    let deathYearOption2 = Math.min(1290 - 10, Math.max(...birthYears) + 65);
                    geniData[person].deathYear = ["" + deathYearOption1, "" + deathYearOption2];
                } else {
                    console.log(`${geniData[person].name} has no death year`);
                }
            } else {
                console.log(`${geniData[person].name} ERRORED INCORRECTLY!`);
            }
        }
    }

    //await Promise.all(promises);

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
    console.log(i);
    console.log(people.length);
}

const pickBirthYear = async (person = null) => {
    //Make sure every live person has one single birth year
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    if (person) {
        people = [person];
    }

    const promises = [];

    let i = 0;

    for (const person of people) {
        if (!geniData[person]) {
            console.log(person + "purged");
            continue;
        }
        if (geniData[person].deathYear === "alive") {
            //Pick earliest date from calculatePureBirthRange
            const birthYear = await calculatePureBirthRange(person);
            console.log(`${geniData[person].name} has birth year range ${birthYear}`);
        }
    }

    await Promise.all(promises);

    //Pick earlier birth year for people with multiple birth years, and purge people whose earliest birth year is 1292 or greater
    for (const person of Object.keys(geniData)) {
        if (geniData[person].birthYear) {
            const birthYears = geniData[person].birthYear.map(year => parseInt(year));
            if (birthYears.length > 1) {
                geniData[person].birthYear = ["" + Math.min(...birthYears)];
            }
            if (Math.min(...birthYears) >= 1292) {
                runPurge(person);
            }
        }
    }

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

const calculatePureBirthRange = async (person) => {
    // If person has no children, return their current birth range
    if (!geniData[person].children || geniData[person].children.length === 0) {
        return geniData[person].birthYear;
    }
    // Otherwise, calculate based on the children's birth ranges
    const children = geniData[person].children;

    const parentBirthYears = geniData[person].birthYear.map(year => parseInt(year));
    let minParentBirth = Math.min(...parentBirthYears);
    let maxParentBirth = Math.max(...parentBirthYears);
    for (const child of children) {
        calculatePureBirthRange(child);
        const childBirthYears = geniData[child].birthYear.map(year => parseInt(year));
        const minChildBirth = Math.min(...childBirthYears);
        const maxChildBirth = Math.max(...childBirthYears);

        console.log(`Parent ${geniData[person].name} has birth year range ${minParentBirth} - ${maxParentBirth}`);
        console.log(`Child ${geniData[child].name} has birth year range ${minChildBirth} - ${maxChildBirth}`);

        if (!geniData[person].birthYear) {
            console.log(`${geniData[person].name} has no birth year`);
            //Break everything and stop code by causing an error
            let x = null;
            return x[7];
        }

        //Exclude any values from parent birth year that are less than 15 years before the child's maximum birth year. If minimum parent birth year doesn't work, break everything and stop code by causing an error
        if (minParentBirth > (maxChildBirth - 15)) {
            //Check if its a lone child (no children of its own) breaking things- if it is, PURGE IT
            if ((!geniData[child].children || geniData[child].children.length === 0) && child > 1050) {
                console.log(`${geniData[child].name} is a lone child and has no children of their own`);
                runPurge(child);
            } else {
                //Check if moving child birth year forward up to 5 years would work
                console.log("Ope, issue");
                if (minParentBirth <= (maxChildBirth - 10)) {
                    console.log(`Trying to solve!`);
                    //Check range of possible child birth years by child's children
                    let minGrandchildBirth = 3000;
                    for (const grandchild of geniData[child].children) {
                        minGrandchildBirth = Math.min(minGrandchildBirth, Math.min(...geniData[grandchild].birthYear.map(year => parseInt(year))));
                    }
                    //See what maximum child birth year could be
                    console.log(maxChildBirth, minGrandchildBirth - 15);
                    if (maxChildBirth >= (minGrandchildBirth - 15)) {
                        //Change child birth year by the minimum value to not break things. This means moving it up to until 15 years after the parent's birth year. Make sure it's less than minimum grandchild birth year - 15
                        if (minGrandchildBirth - 15 < minParentBirth + 15) {
                            console.log("Solved!");
                            geniData[child].birthYear = ["" + (minParentBirth + 15), "" + maxChildBirth];
                        } else {
                            //Break everything and die
                            onsole.log(`${geniData[person].name} has birth year ${minParentBirth} which is less than 15 years before ${geniData[child].name}'s birth year -15, ${maxChildBirth - 15}`);
                            let x = null;
                            return x[7];
                        }
                    } else {
                        //Break everything and die
                        console.log(`${geniData[person].name} has birth year ${minParentBirth} which is less than 15 years before ${geniData[child].name}'s birth year -15, ${maxChildBirth - 15}`);
                        let x = null;
                        return x[7];
                    }
                } else {
                    console.log(`${geniData[person].name} has birth year ${minParentBirth} which is less than 15 years before ${geniData[child].name}'s birth year -15, ${maxChildBirth - 15}`);
                    //Break everything and stop code by causing an error
                    let x = null;
                    return x[7];
                }
            }
        }
        else {
            maxParentBirth = Math.min(maxParentBirth, maxChildBirth - 15);
            //Change min child birth in geniData to min parent birth + 15
            geniData[child].birthYear = ["" + (minParentBirth + 15), "" + maxChildBirth];
            if (minChildBirth > maxChildBirth) {
                console.log(minChildBirth, maxChildBirth);
                console.log(`${geniData[child].name} has birth year ${minChildBirth} which is more than ${maxChildBirth}`);
                //Break everything and stop code by causing an error
                let x = null;
                return x[7];
            }
        }
    }
    // The parent's range is 15+ years older than the child's minimum birth year
    return [minParentBirth, maxParentBirth];
}


const purge = async () => {
    //Delete all people whose max birth year is 1292 or greater that have no children with a min birth year of 1291 or lesser. Delete every child descendant of them, and remove them from their parents children list
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;

    for (const person of people) {
        if (!geniData[person]) {
            continue;
        }
        if (geniData[person].birthYear) {
            const birthYears = geniData[person].birthYear.map(year => parseInt(year));
            if (Math.max(...birthYears) >= 1292) {
                const children = geniData[person].children;
                if (children) {
                    let valid = false;
                    for (const child of children) {
                        if (geniData[child].birthYear) {
                            const childBirthYears = geniData[child].birthYear.map(year => parseInt(year));
                            if (Math.min(...childBirthYears) <= 1291) {
                                valid = true;
                                break;
                            }
                        }
                    }
                    if (!valid) {
                        i++;
                        //Delete person and all children
                        runPurge(person);
                    }
                } else {
                    i++;
                    runPurge(person);
                }
            }
        }
    }
    console.log(i);

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

const runPurge = (person) => {
    if (person < 1050) {
        console.log(`Error: ${geniData[person].name} is important and should not be deleted`);
        return;
    }
    console.log(person);
    const children = geniData[person].children;
    if (children) {
        for (const child of children) {
            runPurge(child);
        }
    }
    if (geniData[person].father && geniData[geniData[person].father]) {
        const father = geniData[person].father;
        const fatherChildren = geniData[father].children;
        const index = fatherChildren.indexOf(person);
        fatherChildren.splice(index, 1);
    }
    if (geniData[person].mother && geniData[geniData[person].mother]) {
        const mother = geniData[person].mother;
        const motherChildren = geniData[mother].children;
        const index = motherChildren.indexOf(person);
        motherChildren.splice(index, 1);
    }
    delete geniData[person];
    return true;
}

const fixCirca = async () => {
    //Regrab birth year data for everyone who is alive or their parents
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let promises = [];
    let peopleToFix = [];

    for (person of people) {
        if (geniData[person].deathYear === "alive") {
            peopleToFix.push(person);

            if (geniData[person].father) {
                peopleToFix.push(geniData[person].father);
            }

            if (geniData[person].mother) {
                peopleToFix.push(geniData[person].mother);
            }
        }
    }
    //Delete duplicates
    peopleToFix = [...new Set(peopleToFix)];

    const chunkSize = 20; // Number of promises to resolve at a time

    for (let i = 0; i < peopleToFix.length; i += chunkSize) {
        const chunk = peopleToFix.slice(i, i + chunkSize).map(person =>
            getProfileData(geniData[person].geni_profile).then(data => {
                if (data.birthYear) {
                    geniData[person].birthYear = data.birthYear;
                }
                console.log(`Processed ${geniData[person].name}`);
            })
        );

        await Promise.all(chunk);
        console.log(`Finished processing chunk ${Math.ceil((i + 1) / chunkSize)}`);
    }

    console.log("All profiles processed");

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}


// generateFullTree("https://www.geni.com/people/Duncan-I-King-of-Scots/6000000005037689063");
//generateFullTree("https://www.geni.com/people/Robert-I-the-Bruce-King-of-Scots/6000000000350903117");
// generateFullTree("https://www.geni.com/people/Empress-Matilda/6000000002106021492");

// //cleanLoosePeople();
// checkInconsistencies();
// pickBirthYear();

// purge();

// fixCirca();
// const runAsync = async () => {
//     await loadGeniData().then(data => {
//         geniData = data;
//     });
//     runPurge("2021");
//     fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
//     // let response = await calculatePureBirthRange("1554");
//     // console.log(response);
// }
// runAsync();

const checkAlive = async () => {
    //Make sure everyone alive only has one birth year. Make sure no one has a death year after 1291 or a birth year after 1291
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;

    for (const person of people) {
        if (geniData[person].deathYear === "alive") {
            if (geniData[person].birthYear) {
                const birthYears = geniData[person].birthYear.map(year => parseInt(year));
                if (birthYears.length > 1) {
                    i++;
                    console.log(`${geniData[person].name} has multiple birth years`);
                }
                if (Math.max(...birthYears) > 1291) {
                    i++;
                    console.log(`${geniData[person].name} has birth year ${Math.max(...birthYears)}`);
                }
            }
        } else {
            if (geniData[person].deathYear) {
                const deathYears = geniData[person].deathYear.map(year => parseInt(year));
                if (Math.max(...deathYears) > 1291) {
                    i++;
                    console.log(`${geniData[person].name} has death year ${Math.max(...deathYears)}`);
                }
            }
            if (geniData[person].birthYear) {
                const birthYears = geniData[person].birthYear.map(year => parseInt(year));
                if (Math.max(...birthYears) > 1291) {
                    i++;
                    console.log(`${geniData[person].name} has birth year ${Math.max(...birthYears)}`);
                }
            }
        }
    }
}

// checkAlive();

const purgeUnpurged = async () => {
    //Find everyone with a nonexistent mother or father. Purge them.
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;
    for (const person of people) {
        if (!geniData[person]) {
            continue;
        }
        if (geniData[person].father && !geniData[geniData[person].father]) {
            i++;
            runPurge(person);
        }
        if (!geniData[person]) {
            continue;
        }
        if (geniData[person].mother && !geniData[geniData[person].mother]) {
            i++;
            runPurge(person);
        }
    }
    console.log(i);
    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

// purgeUnpurged();

const listLooseKids = async () => {
    //Find everyone with a nonexistent kid. Log them.
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;

    for (const person of people) {
        if (geniData[person].children) {
            for (const child of geniData[person].children) {
                if (!geniData[child]) {
                    i++;
                    console.log(child);
                }
            }
        }
    }
}

const checkMessedUpBirthDates = async () => {
    //Find everyone who is alive. Check if their birth year is over 5 years different than that listed on geni. If it is, log them.
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;

    let promises = [];

    for (const person of people) {
        if (geniData[person].deathYear === "alive") {
            if (geniData[person].birthYear) {
                const birthYears = geniData[person].birthYear.map(year => parseInt(year));
                if (birthYears.length > 1) {
                    i++;
                    console.log(`${geniData[person].name} has multiple birth years`);
                }
                if (Math.max(...birthYears) > 1291) {
                    i++;
                    console.log(`${geniData[person].name} has birth year ${Math.max(...birthYears)}`);
                }

                //Check profile data to see if it matches
                const promise = getProfileData(geniData[person].geni_profile).then(data => {
                    if (data.birthYear) {
                        //Should only be one birth year in geniData
                        const geniBirthYear = parseInt(geniData[person].birthYear[0]);

                        //Check if geni birth year range is over 5 years off of the birth year stored in data. There should be a 5 year buffer. There might be multiple years coming from getProfileData, but stored data should only have 1
                        if ((geniBirthYear < Math.min(...data.birthYear) - 5) || (geniBirthYear > Math.max(...data.birthYear) + 5)) {
                            //If there is only one birth year, check if this would screw with parent/child relationships
                            if (data.birthYear.length === 1) {
                                const birthYear = parseInt(data.birthYear[0]);
                                let problem = false;
                                if (geniData[person].children) {
                                    for (const child of geniData[person].children) {
                                        if (geniData[child].birthYear) {
                                            const childBirthYears = geniData[child].birthYear.map(year => parseInt(year));
                                            if (childBirthYears.length > 1) {
                                                i++;
                                                console.log(`${geniData[child].name} has multiple birth years`);
                                                problem = true;
                                            } else {
                                                const childBirthYear = childBirthYears[0];
                                                if (birthYear + 15 > childBirthYear) {
                                                    i++;
                                                    console.log(`${geniData[person].name} has birth year ${geniBirthYear} which is less than 15 years older than ${geniData[child].name}'s birth year`);
                                                    problem = true;
                                                }
                                            }
                                        }
                                    }
                                }
                                if (geniData[person].father) {
                                    const father = geniData[person].father;
                                    if (geniData[father].birthYear) {
                                        const fatherBirthYears = geniData[father].birthYear.map(year => parseInt(year));
                                        if (fatherBirthYears.length > 1) {
                                            i++;
                                            console.log(`${geniData[father].name} has multiple birth years`);
                                            problem = true;
                                        } else {
                                            const fatherBirthYear = fatherBirthYears[0];
                                            if (fatherBirthYear + 15 > birthYear) {
                                                i++;
                                                console.log(`${geniData[father].name} has birth year ${fatherBirthYear} which is less than 15 years older than ${geniData[person].name}'s birth year`);
                                                problem = true;
                                            }
                                        }
                                    } else {
                                        i++;
                                        console.log(`${geniData[father].name} has no birth year`);
                                        problem = true;
                                    }
                                }
                                if (geniData[person].mother) {
                                    const mother = geniData[person].mother;
                                    if (geniData[mother].birthYear) {
                                        const motherBirthYears = geniData[mother].birthYear.map(year => parseInt(year));
                                        if (motherBirthYears.length > 1) {
                                            i++;
                                            console.log(`${geniData[mother].name} has multiple birth years`);
                                            problem = true;
                                        } else {
                                            const motherBirthYear = motherBirthYears[0];
                                            if (motherBirthYear + 15 > birthYear) {
                                                i++;
                                                console.log(`${geniData[mother].name} has birth year ${motherBirthYear} which is less than 15 years older than ${geniData[person].name}'s birth year`);
                                                problem = true;
                                            }
                                        }
                                    } else {
                                        i++;
                                        console.log(`${geniData[mother].name} has no birth year`);
                                        problem = true;
                                    }
                                }
                                if (!problem) {
                                    //Change geni birth year to match data birth year
                                    // geniData[person].birthYear = ["" + birthYear];
                                    console.log(`${geniData[person].name} can have birth year adjusted to ${birthYear}`);
                                }
                            }
                            i++;
                            // console.log(`${geniData[person].name} has birth year ${geniBirthYear} which is over 5 years off of ${data.birthYear}`);
                        }

                    }
                });
                promises.push(promise);
            } else {
                i++;
                console.log(`${geniData[person].name} has no birth year`);
            }
        }
    }

    //Manage promises in batches
    const chunkSize = 20; // Number of promises to resolve at a time

    for (let i = 0; i < promises.length; i += chunkSize) {
        const chunk = promises.slice(i, i + chunkSize);
        await Promise.all(chunk);
        console.log(`Finished processing chunk ${Math.ceil((i + 1) / chunkSize)}`);
    }

    console.log(i);
}

// checkMessedUpBirthDates();

// const findOrphanedLines = async () => {
//     //Make sure there is no one with a father or mother who is not in the data whose id is greater than 1050
//     geniData = await loadGeniData();
//     let people = Object.keys(geniData);
//     let i = 0;

//     for (const person of people) {
//         if (geniData[person].father && !geniData[geniData[person].father]) {
//             i++;
//             console.log(`${geniData[person].name} has a father who is not in the data`);
//         }
//         if (geniData[person].mother && !geniData[geniData[person].mother]) {
//             i++;
//             console.log(`${geniData[person].name} has a mother who is not in the data`);
//         }
//         if (!geniData[person].father && !geniData[person].mother && person > 1050) {
//             i++;
//             console.log(`${geniData[person].name} has no parents`);
//         }
//     }
// }

// const runAsync = async () => {
//     geniData = await loadGeniData();
//     runPurge("1333");
//     console.log(geniData["1333"]);
//     fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));

//     // let profileData = await getProfileData("https://www.geni.com/people/Robert-I-the-Bruce-King-of-Scots/6000000000350903117");
//     // console.log(profileData);
// }

// runAsync();

// const compileDuplicates = async () => {
//     geniData = await loadGeniData();
//     let people = Object.keys(geniData);
//     let linksToIDs = {};

//     for (const person of people) {
//         if (linksToIDs[geniData[person].geni_profile]) {
//             linksToIDs[geniData[person].geni_profile].push(person);
//         } else {
//             linksToIDs[geniData[person].geni_profile] = [person];
//         }
//     }

//     //Filter out links with only one ID
//     let duplicates = {};
//     for (const link of Object.keys(linksToIDs)) {
//         if (linksToIDs[link].length > 1) {
//             duplicates[link] = linksToIDs[link];
//         }
//     }

//     console.log(duplicates);

//     //Merge duplicates.
//     for (const link of Object.keys(duplicates)) {
//         const ids = duplicates[link];
//         const firstID = ids[0];

//         const person = geniData[firstID];
//         const father = person.father;
//         const mother = person.mother;
//         const children = person.children;
//         const birthYear = person.birthYear;
//         const deathYear = person.deathYear;

//         let issue = false;
//         for (let i = 1; i < ids.length; i++) {
//             const id = ids[i];
//             const newPerson = geniData[id];
//             const newFather = newPerson.father;
//             const newMother = newPerson.mother;
//             const newChildren = newPerson.children;
//             const newBirthYear = newPerson.birthYear;
//             const newDeathYear = newPerson.deathYear;

//             //Check if different father/mother/children/birthYear/deathYear
//             if (father && newFather && geniData[father].geni_profile !== geniData[newFather].geni_profile) {
//                 console.log(`Father mismatch: ${person.name} and ${newPerson.name}`);
//                 issue = true;
//             } else {
//                 if (!father && newFather) {
//                     geniData[firstID].father = newFather;
//                 }
//             }
//             if (mother && newMother && geniData[mother].geni_profile !== geniData[newMother].geni_profile) {
//                 console.log(`Mother mismatch: ${person.name} and ${newPerson.name}`);
//                 issue = true;
//             } else {
//                 if (!mother && newMother) {
//                     geniData[firstID].mother = newMother;
//                 }
//             }
//             if (children && newChildren && !arraysEqual(children, newChildren)) {
//                 console.log(`Children mismatch: ${person.name} and ${newPerson.name}`);
//                 issue = true;
//             } else {
//                 if (!children && newChildren) {
//                     geniData[firstID].children = newChildren;
//                 }
//             }
//         }
//         if (!issue) {
//             for (let i = 1; i < ids.length; i++) {
//                 const id = ids[i];

//                 //Search for anywhere "id" is in the data as a child and replace it with firstID
//                 for (const person of people) {
//                     if (geniData[person] && geniData[person].children) {
//                         const index = geniData[person].children.indexOf(id);
//                         if (index !== -1) {
//                             geniData[person].children[index] = firstID;
//                         }
//                     }
//                 }

//                 delete geniData[id];
//             }
//             delete duplicates[link];
//             console.log(`Merged ${ids.length} duplicates into ${geniData[firstID].name}`);
//         }
//     }

//     // for (const link of Object.keys(duplicates)) {
//     //     const ids = duplicates[link];
//     //     const firstID = ids[0];

//     //     const person = geniData[firstID];
//     //     const father = person.father;
//     //     const mother = person.mother;
//     //     const children = person.children;
//     //     const birthYear = person.birthYear;
//     //     const deathYear = person.deathYear;



//     //     for (let i = 1; i < ids.length; i++) {
//     //         const id = ids[i];
//     //         const newPerson = geniData[id];
//     //         const newFather = newPerson.father;
//     //         const newMother = newPerson.mother;
//     //         const newChildren = newPerson.children;
//     //         const newBirthYear = newPerson.birthYear;
//     //         const newDeathYear = newPerson.deathYear;


//     //         //Check if different father/mother/children/birthYear/deathYear
//     //         if (father !== newFather && father && newFather) {
//     //             console.log(`Father mismatch: ${person.name} and ${newPerson.name}`);
//     //         } else {
//     //             if (!father && newFather) {
//     //                 geniData[firstID].father = newFather;
//     //             }
//     //         }
//     //         if (mother !== newMother && mother && newMother) {
//     //             console.log(`Mother mismatch: ${person.name} and ${newPerson.name}`);
//     //         } else {
//     //             if (!mother && newMother) {
//     //                 geniData[firstID].mother = newMother;
//     //             }
//     //         }
//     //         if (children && newChildren && !arraysEqual(children, newChildren)) {
//     //             console.log(children);
//     //             console.log(newChildren);
//     //             console.log(children !== newChildren);
//     //             console.log(`Children mismatch: ${person.name} and ${newPerson.name}`);
//     //         } else {
//     //             if (!children && newChildren) {
//     //                 geniData[firstID].children = newChildren;
//     //             }
//     //         }
//     //     }
//     // }

//     fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
// }

// const arraysEqual = (arr1, arr2) => {
//     if (arr1.length !== arr2.length) return false;
//     return arr1.every((element, index) => element === arr2[index]);
// }

// compileDuplicates();

const replaceBirthAndDeath = async () => {
    //Replace birth and death years with the ones from geni via getProfileData
    geniData = await loadGeniData();

    let people = Object.keys(geniData);
    let promises = [];

    for (const person of people) {
        const promise = getProfileData(geniData[person].geni_profile).then(data => {
            geniData[person].birthYear = data.birthYear;
            geniData[person].deathYear = data.deathYear;
            console.log(`Processed ${geniData[person].name}`);
        });
        promises.push(promise);
    }

    //Manage promises one by one, delaying for 10ms between each
    for (const promise of promises) {
        await promise;
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

// replaceBirthAndDeath();

const markAlive = async () => {
    //Mark everyone who dies after 1291 as alive
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;
    let j = 0;

    for (const person of people) {
        if (geniData[person].deathYear && geniData[person].deathYear !== "alive") {
            const deathYears = geniData[person].deathYear.map(year => parseInt(year));
            if (Math.min(...deathYears) <= 1291 && Math.max(...deathYears) > 1291) {
                // geniData[person].deathYear = "alive";
                //Check if death years are exactly 30 years apart
                if (Math.max(...deathYears) - Math.min(...deathYears) === 30) {
                    //Take middle value- if after 1291, mark as alive
                    const middleYear = Math.min(...deathYears) + 15;
                    if (middleYear > 1291) {
                        geniData[person].deathYear = "alive";
                        // console.log(`${geniData[person].name} has death year ${Math.min(...deathYears)} - ${Math.max(...deathYears)} and was marked as alive`);
                        j++;
                    } else {
                        console.log(`${geniData[person].name} is a circa, but has death year ${Math.min(...deathYears)} - ${Math.max(...deathYears)}`);
                        //Set latest death year to 1291
                        geniData[person].deathYear = [
                            Math.min(...deathYears) + "",
                            1291 + ""
                        ]
                        i++;
                    }
                } else {
                    //Take average of death years- if after 1291, mark as alive, if before 1291, set latest death year to 1291
                    const averageYear = Math.round((Math.min(...deathYears) + Math.max(...deathYears)) / 2);

                    if (averageYear > 1291) {
                        geniData[person].deathYear = "alive";
                        // console.log(`${geniData[person].name} has death year ${Math.min(...deathYears)} - ${Math.max(...deathYears)} and was marked as alive`);
                        j++;
                    } else {
                        console.log(`${geniData[person].name} is a circa, but has death year ${Math.min(...deathYears)} - ${Math.max(...deathYears)}`);
                        //Set latest death year to 1291
                        geniData[person].deathYear = [
                            Math.min(...deathYears) + "",
                            1291 + ""
                        ]
                        i++;
                    }
                }
            } else if (Math.min(...deathYears) >= 1291) {
                geniData[person].deathYear = "alive";
                // console.log(`${geniData[person].name} has death year ${Math.min(...deathYears)} and was marked as alive`);
                j++;
            }
        } else if (!geniData[person].deathYear) {
            //If at most 40 from birth year, mark as alive
            if (geniData[person].birthYear) {
                const birthYears = geniData[person].birthYear.map(year => parseInt(year));
                // Check if birth years are exactly 30 years apart
                if (Math.max(...birthYears) - Math.min(...birthYears) === 30) {
                    // Take middle value - if after 1291, purge
                    const middleYear = Math.min(...birthYears) + 15;
                    if (middleYear > 1291) {
                        runPurge(person);
                    } else {
                        // console.log(`${geniData[person].name} has birth years ${Math.min(...birthYears)} - ${Math.max(...birthYears)}`);
                    }
                }

                // Check if average of birth years is below 1291. If it is, set latest birth year to 1291. If it isn't, purge the person
                if (Math.max(...birthYears) > 1291) {
                    const averageYear = Math.round((Math.min(...birthYears) + Math.max(...birthYears)) / 2);
                    if (averageYear > 1291) {
                        runPurge(person);
                    } else {
                        console.log(`${geniData[person].name} has birth years ${Math.min(...birthYears)} - ${Math.max(...birthYears)}`);
                        // Set latest birth year to 1291
                        geniData[person].birthYear = [
                            Math.min(...birthYears) + "",
                            1291 + ""
                        ];
                        i++;
                    }
                }

                if (Math.min(...birthYears) >= 1250 && Math.max(...birthYears) <= 1291) {
                    geniData[person].deathYear = "alive";
                    // console.log(`${geniData[person].name} has no death year, so it was set to alive`);
                    j++;
                } else if (Math.min(...birthYears) >= 1235 && Math.max(...birthYears) <= 1291) {
                    //If has kids, mark as alive. If no kids, mark death year as 1291
                    if (geniData[person].children && geniData[person].children.length > 0) {
                        geniData[person].deathYear = "alive";
                        // console.log(`${geniData[person].name} has no death year, so it was set to alive`);
                        j++;
                    } else {
                        geniData[person].deathYear = ["1291"];
                        // console.log(`${geniData[person].name} has no death year, so it was set to 1291`);
                        i++;
                    }
                }
            }
        }
    }

    //Await for 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
    console.log(i);
    console.log(j);
}

// markAlive();

const OBSOLETEchooseBirthDates = async () => {
    geniData = await loadGeniData();
    const individuals = new Map(Object.entries(geniData));

    individuals.forEach((person, id) => {
        if (person.children && person.children.length > 0) {
            let gender = person.gender;
            let isMale = gender == "Male";
            person.children.forEach((childId) => {
                const child = individuals.get(childId);
                if (child) {
                    // Verify that the child references this person as a parent
                    if (child.father !== id && child.mother !== id) {
                        //Check if this parent is a mother or father based on gender (Male or Female)
                        if (isMale) {
                            if (!individuals.get(child.father)) {
                                //Swap father
                                child.father = id;
                            }
                        } else {
                            if (!individuals.get(child.mother)) {
                                //Swap mother
                                child.mother = id;
                            }
                        }
                        console.warn(`Inconsistency detected: Child ${childId} does not reference ${id} as a parent.`);
                    }
                } else {
                    console.warn(`Child with ID ${childId} not found for parent ${id}.`);
                }
            });
        }
        //Check if father and mother have this as child
        if (person.father) {
            const father = individuals.get(person.father);
            if (father) {
                if (!father.children || !father.children.includes(id)) {
                    console.warn(`Inconsistency detected: Father ${person.father} does not reference ${id} as a child.`);
                }
            } else {
                console.warn(`Father with ID ${person.father} not found for child ${id}.`);
            }
        }
        if (person.mother) {
            const mother = individuals.get(person.mother);
            if (mother) {
                if (!mother.children || !mother.children.includes(id)) {
                    console.warn(`Inconsistency detected: Mother ${person.mother} does not reference ${id} as a child.`);
                }
            } else {
                console.warn(`Mother with ID ${person.mother} not found for child ${id}.`);
            }
        }
    });

    //Pick birth years for everyone who is alive. First, create a map of people to birth year ranges. Than, create an array of the lowest generation people, those without children, and choose the birth date in their range that is closest to the average while still being at most 1 year after their parents death dates.
    let birthYearRanges = new Map();
    let lowestGeneration = [];
    let people = Object.keys(geniData);
    
    for (const person of people) {
        if (geniData[person].deathYear === "alive") {
            if (geniData[person].birthYear) {
                const birthYears = geniData[person].birthYear.map(year => parseInt(year));
                birthYearRanges.set(person, birthYears);
            }
        }
    }

    for (const person of birthYearRanges.keys()) {
        if (!geniData[person].children || geniData[person].children.length === 0) {
            lowestGeneration.push(person);
        }
    }

    for (const person of lowestGeneration) {
        let birthYears = birthYearRanges.get(person);
        if (birthYears) {
            //Average should be average of first and last
            // console.log(person);
            let average = (birthYears[0] + birthYears[1]) / 2;

            //Find latest parent death year
            let earliestDeathYear = 1291;
            if (geniData[person].father) {
                const father = geniData[person].father;
                if (geniData[father].deathYear && geniData[father].deathYear !== "alive") {
                    earliestDeathYear = Math.min(earliestDeathYear, Math.max(...geniData[father].deathYear.map(year => parseInt(year))));
                }
            }
            if (geniData[person].mother) {
                const mother = geniData[person].mother;
                if (geniData[mother].deathYear && geniData[mother].deathYear !== "alive") {
                    earliestDeathYear = Math.min(earliestDeathYear, Math.max(...geniData[mother].deathYear.map(year => parseInt(year))));
                }
            }

            // console.log(person);
            // console.log(earliestDeathYear);

            //Birth year be above minimum birth year, but below maximum birth year and parents death year + 1. Create a new range with these constriants, and pick the birth year closest to the average
            let newBirthYears = [];
            newBirthYears[0] = birthYears[0];
            newBirthYears[1] = Math.min(birthYears[1], earliestDeathYear + 1);
            if (newBirthYears[1] < newBirthYears[0]) {
                console.log(`${geniData[person].name} has birth year ${newBirthYears[0]} which is more than ${newBirthYears[1]}`);
            } else {
                birthYearRanges.set(person, newBirthYears);
            }
        } else {
            console.log(`${geniData[person].name} has no birth year`);
        }
    }
}

const chooseBirthDates = async () => {
    geniData = await loadGeniData();
    const individuals = new Map(Object.entries(geniData));

    // Initial consistency checks (keeping as per your instruction)
    individuals.forEach((person, id) => {
        if (person.children && person.children.length > 0) {
            let gender = person.gender;
            let isMale = gender == "Male";
            person.children.forEach((childId) => {
                const child = individuals.get(childId);
                if (child) {
                    // Verify that the child references this person as a parent
                    if (child.father !== id && child.mother !== id) {
                        // Check if this parent is a mother or father based on gender (Male or Female)
                        if (isMale) {
                            if (!individuals.get(child.father)) {
                                // Swap father
                                child.father = id;
                            }
                        } else {
                            if (!individuals.get(child.mother)) {
                                // Swap mother
                                child.mother = id;
                            }
                        }
                        console.warn(`Inconsistency detected: Child ${childId} does not reference ${id} as a parent.`);
                    }
                } else {
                    console.warn(`Child with ID ${childId} not found for parent ${id}.`);
                }
            });
        }
        // Check if father and mother have this as child
        if (person.father) {
            const father = individuals.get(person.father);
            if (father) {
                if (!father.children || !father.children.includes(id)) {
                    console.warn(`Inconsistency detected: Father ${person.father} does not reference ${id} as a child.`);
                }
            } else {
                console.warn(`Father with ID ${person.father} not found for child ${id}.`);
            }
        }
        if (person.mother) {
            const mother = individuals.get(person.mother);
            if (mother) {
                if (!mother.children || !mother.children.includes(id)) {
                    console.warn(`Inconsistency detected: Mother ${person.mother} does not reference ${id} as a child.`);
                }
            } else {
                console.warn(`Mother with ID ${person.mother} not found for child ${id}.`);
            }
        }
    });

    // Initialize adjusted birth year ranges
    let adjustedBirthYearRanges = new Map();
    let people = Object.keys(geniData);

    for (const person of people) {
        const personData = geniData[person];
        if (personData.birthYear) {
            const birthYears = personData.birthYear.map(year => parseInt(year));
            let minYear, maxYear;
            if (birthYears.length === 1) {
                minYear = maxYear = birthYears[0];
            } else {
                minYear = birthYears[0];
                maxYear = birthYears[1];
            }
            adjustedBirthYearRanges.set(person, [minYear, maxYear]);
        } else {
            console.warn(`${personData.name} has no birth year`);
        }
    }

    // Identify alive people
    let alivePeople = new Set();
    for (const person of adjustedBirthYearRanges.keys()) {
        if (geniData[person].deathYear === "alive") {
            alivePeople.add(person);
        }
    }

    // Build parent-child relationships among alive people
    let childToParents = new Map();
    let parentToChildren = new Map();
    for (const person of alivePeople) {
        const personData = geniData[person];
        // Initialize relationships
        childToParents.set(person, []);
        if (personData.children && personData.children.length > 0) {
            parentToChildren.set(person, []);
        }
    }
    for (const person of alivePeople) {
        const personData = geniData[person];
        // Record parents
        if (personData.father && alivePeople.has(personData.father)) {
            childToParents.get(person).push(personData.father);
            if (!parentToChildren.has(personData.father)) {
                parentToChildren.set(personData.father, []);
            }
            parentToChildren.get(personData.father).push(person);
        }
        if (personData.mother && alivePeople.has(personData.mother)) {
            childToParents.get(person).push(personData.mother);
            if (!parentToChildren.has(personData.mother)) {
                parentToChildren.set(personData.mother, []);
            }
            parentToChildren.get(personData.mother).push(person);
        }
    }

    // Identify youngest generation (those without children)
    let youngestGeneration = [];
    for (const person of alivePeople) {
        if (!parentToChildren.has(person) || parentToChildren.get(person).length === 0) {
            youngestGeneration.push(person);
        }
    }

    // Function to attempt assigning birth years recursively
    const assignBirthYears = (person, assignedBirthYears) => {
        const personData = geniData[person];
        const [minYear, maxYear] = adjustedBirthYearRanges.get(person);
        let initialAverage = Math.round((minYear + maxYear) / 2);
        // Try possible birth years within range
        for (let birthYear = initialAverage; birthYear >= minYear; birthYear--) {
            if (birthYear <= maxYear) {
                assignedBirthYears.set(person, birthYear);
                let constraintsSatisfied = true;

                // Check constraints with parents
                for (const parent of childToParents.get(person)) {
                    if (assignedBirthYears.has(parent)) {
                        if (assignedBirthYears.get(parent) > birthYear - 15) {
                            constraintsSatisfied = false;
                            break;
                        }
                    }
                }

                if (!constraintsSatisfied) {
                    continue;
                }

                // Assign birth years to parents
                for (const parent of childToParents.get(person)) {
                    if (!assignedBirthYears.has(parent)) {
                        const [parentMinYear, parentMaxYear] = adjustedBirthYearRanges.get(parent);
                        // Parent must be at least 15 years older than this child
                        const parentMaxPossibleYear = Math.min(parentMaxYear, birthYear - 15);
                        // Parent's birth year must be within their range
                        if (parentMinYear > parentMaxPossibleYear) {
                            constraintsSatisfied = false;
                            break;
                        }
                        // Recursively assign birth year to parent
                        const success = assignBirthYears(parent, assignedBirthYears);
                        if (!success) {
                            constraintsSatisfied = false;
                            break;
                        }
                    } else {
                        // Parent already assigned, check constraint
                        if (assignedBirthYears.get(parent) > birthYear - 15) {
                            constraintsSatisfied = false;
                            break;
                        }
                    }
                }

                if (constraintsSatisfied) {
                    return true;
                } else {
                    assignedBirthYears.delete(person);
                }
            }
        }

        // Try increasing birth year if decreasing didn't work
        for (let birthYear = initialAverage + 1; birthYear <= maxYear; birthYear++) {
            if (birthYear >= minYear) {
                assignedBirthYears.set(person, birthYear);
                let constraintsSatisfied = true;

                // Check constraints with parents
                for (const parent of childToParents.get(person)) {
                    if (assignedBirthYears.has(parent)) {
                        if (assignedBirthYears.get(parent) > birthYear - 15) {
                            constraintsSatisfied = false;
                            break;
                        }
                    }
                }

                if (!constraintsSatisfied) {
                    continue;
                }

                // Assign birth years to parents
                for (const parent of childToParents.get(person)) {
                    if (!assignedBirthYears.has(parent)) {
                        const [parentMinYear, parentMaxYear] = adjustedBirthYearRanges.get(parent);
                        // Parent must be at least 15 years older than this child
                        const parentMaxPossibleYear = Math.min(parentMaxYear, birthYear - 15);
                        // Parent's birth year must be within their range
                        if (parentMinYear > parentMaxPossibleYear) {
                            constraintsSatisfied = false;
                            break;
                        }
                        // Recursively assign birth year to parent
                        const success = assignBirthYears(parent, assignedBirthYears);
                        if (!success) {
                            constraintsSatisfied = false;
                            break;
                        }
                    } else {
                        // Parent already assigned, check constraint
                        if (assignedBirthYears.get(parent) > birthYear - 15) {
                            constraintsSatisfied = false;
                            break;
                        }
                    }
                }

                if (constraintsSatisfied) {
                    return true;
                } else {
                    assignedBirthYears.delete(person);
                }
            }
        }

        // If no valid birth year found
        return false;
    };

    // Assign birth years starting from the youngest generation
    let assignedBirthYears = new Map();
    for (const person of youngestGeneration) {
        if (!assignedBirthYears.has(person)) {
            const success = assignBirthYears(person, assignedBirthYears);
            if (!success) {
                console.warn(`Could not assign birth years consistently starting from ${geniData[person].name}`);
            }
        }
    }

    // Update geniData with assigned birth years
    for (const [person, birthYear] of assignedBirthYears.entries()) {
        geniData[person].birthYear = [birthYear.toString()];
    }

    // Optionally, save or return the updated geniData
    // return geniData;
    //Save data
    fs.writeFileSync(path.join(__dirname, './data/geni-profilesTEST.json'), JSON.stringify(geniData, null, 2));
};
chooseBirthDates();
// const runAsync = async () => {
//     geniData = await loadGeniData();
//     runPurge("2719");
//     //Wait 5 seconds
//     await new Promise(resolve => setTimeout(resolve, 5000));
//     fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
// }

// runAsync();

const mergeGeniDatas = async () => {
    geniData = await loadGeniData();
    //Load in the other geni data
    const rawData = fs.readFileSync(path.join(__dirname, './data/geni-correct-births.json'));
    const geniData2 = JSON.parse(rawData);

    //For people up to 2798, take all data from geniData2. Also, if there is a tags array including the string "excluded" in geniData, add that to the tags array in geniData2 (which may not exist)
    for (let i = 1; i <= 2798; i++) {
        if (geniData2[i]) {
            //First, save the tags array from geniData
            let tags = [];
            if (geniData[i].tags) {
                tags = geniData[i].tags;
            }
            //Then, set geniData to geniData2
            geniData[i] = geniData2[i];
            //Then, add the tags array back in
            geniData[i].tags = tags;
        } else {
            //If not in geniData2, delete from geniData
            delete geniData[i];
        }
    }

    fs.writeFileSync(geniDataPath, JSON.stringify(geniData, null, 2));
}

const checkDuplicated = async () => {
    //check if there are any people in geniData who have the same geni_profile as someone else
    geniData = await loadGeniData();
    let people = Object.keys(geniData);
    let i = 0;
    let people2 = [];
    for (const person of people) {
        if (people2.includes(geniData[person].geni_profile)) {
            i++;
            console.log(geniData[person].name);
        } else {
            people2.push(geniData[person].geni_profile);
        }
    }
    console.log(i);
}

checkDuplicated();