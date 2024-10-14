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
            }
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
        birthYear = birthYear.match(/\d{4}/g);
        if (beforeYear) {
            let altBirthYear = birthYear - 20;
            birthYear = [altBirthYear + "", birthYear[0]];
        }
    }

    //Death year is format <span itemprop="deathDate" content="1135-uu-uu"> before circa 1135 </span>
    let deathHTML = profileData.match(/<span itemprop='deathDate' content="[^"]+">\s*([^<]+)\s*<\/span>/);
    let deathYear;
    if (deathHTML) {
        deathHTML = deathHTML[1];
        const beforeYear = deathHTML.includes('before') || deathHTML.includes('Before');
        deathYear = deathHTML.match(/\d{4}/g);
        if (beforeYear) {
            //Alt death year is maximum of min birth year + 15 and 20 years before death year
            let altDeathYear = Math.max(birthYear[0] + 15, deathYear - 20);
            if (altDeathYear < deathYear) {
                deathYear = [altDeathYear + "", deathYear[0]];
            }
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
        if (birthPlace.includes('Germany') || birthPlace.includes('German') || birthPlace.includes('Italy') || birthPlace.includes('Italian') || birthPlace.includes('Spain') || birthPlace.includes('Spanish') || birthPlace.includes('Poland') || birthPlace.includes('Polish') || birthPlace.includes('Hungary') || birthPlace.includes('Hungarian') || birthPlace.includes('France') || birthPlace.includes('French')) {
            name = "NN";
        }
    }
    let deathPlace = profileData.match(/deathDate[\s\S]*?<\/td>/);
    if (deathPlace) {
        deathPlace = deathPlace[0];
        if (deathPlace.includes('Germany') || deathPlace.includes('German') || deathPlace.includes('Italy') || deathPlace.includes('Italian') || deathPlace.includes('Spain') || deathPlace.includes('Spanish') || deathPlace.includes('Poland') || deathPlace.includes('Polish') || deathPlace.includes('Hungary') || deathPlace.includes('Hungarian')) {
            name = "NN";
        }
    }

    return { name: name, birthYear: birthYear, deathYear: deathYear, gender: gender, fatherOf: fatherOf, motherOf: motherOf };
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
                } else{
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


// generateFullTree("https://www.geni.com/people/Duncan-I-King-of-Scots/6000000005037689063");
//generateFullTree("https://www.geni.com/people/Robert-I-the-Bruce-King-of-Scots/6000000000350903117");

// //cleanLoosePeople();
// checkInconsistencies();
