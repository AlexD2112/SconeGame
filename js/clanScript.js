const geniProfilesUrl = '/data/geni-profiles.json';

let progenitorList = [];
let geniData = {};

//Get screen width and height
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;

function filterSuggestions() {
    const searchInput = document.getElementById('progenitor-search').value.toLowerCase();
    const suggestionsContainer = document.getElementById('suggestions-container');
    suggestionsContainer.innerHTML = '';

    const filteredSuggestions = progenitorList.filter(({ name }) => name.toLowerCase().includes(searchInput));

    if (filteredSuggestions.length > 0 && searchInput) {
        suggestionsContainer.style.display = 'block';
        filteredSuggestions.forEach(({ name, id }) => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.innerText = name;
            suggestionDiv.dataset.id = id; // Store the ID in the data attribute
            suggestionDiv.onclick = () => selectProgenitor(name, id); // Pass the ID to the select function
            suggestionsContainer.appendChild(suggestionDiv);
        });
    } else {
        suggestionsContainer.style.display = 'none';
    }
}

// Handle selecting a progenitor
function selectProgenitor(name, id) {
    document.getElementById('progenitor-search').value = name;
    document.getElementById('suggestions-container').style.display = 'none';
    console.log(`Selected progenitor: ${name}, ID: ${id}`);
    createTree(id);
}

function createTree(progenitorId) {
    const treeDisplay = document.getElementById('tree-display');
    treeDisplay.innerHTML = ''; // Clear previous tree

    // Get progenitor data from your geniData
    const progenitor = geniData[progenitorId];
    console.log("Here!");
    console.log(geniData);

    if (!progenitor) {
        treeDisplay.innerHTML = `<p>No data available for this person.</p>`;
        return;
    }

    // Create the root of the tree (progenitor)
    const root = document.createElement('div');
    root.classList.add('tree-node');
    root.innerHTML = `<strong>${progenitor.name}</strong> (${progenitor.birthYear || 'Unknown'} - ${progenitor.deathYear || 'Unknown'})`;

    treeDisplay.appendChild(root);

    // If 'Show Descendants' is checked, show descendants
    if (document.getElementById('show-descendants').checked && progenitor.children) {
        const descendants = createDescendantsTree(progenitorId);
        treeDisplay.appendChild(descendants);
    }

    // If 'Show Ancestors' is checked, show ancestors
    if (document.getElementById('show-ancestors').checked) {
        const ancestors = createAncestorsTree(progenitorId);
        treeDisplay.appendChild(ancestors);
    }
}

// Function to create descendants' tree
function createDescendantsTree(personId) {
    const descendantsContainer = document.createElement('div');
    descendantsContainer.classList.add('descendants-container');

    const person = geniData[personId];
    if (person.children) {
        person.children.forEach(childId => {
            const childDiv = document.createElement('div');
            childDiv.classList.add('tree-node');
            const child = geniData[childId];
            childDiv.innerHTML = `<strong>${child.name}</strong> (${child.birthYear || 'Unknown'} - ${child.deathYear || 'Unknown'})`;

            // Recursively add the children's descendants
            const grandChildrenDiv = createDescendantsTree(childId);
            childDiv.appendChild(grandChildrenDiv);

            descendantsContainer.appendChild(childDiv);
        });
    }

    return descendantsContainer;
}

// Function to create ancestors' tree
function createAncestorsTree(personId) {
    const ancestorsContainer = document.createElement('div');
    ancestorsContainer.classList.add('ancestors-container');

    const person = geniData[personId];
    if (person.father || person.mother) {
        if (person.father) {
            const fatherDiv = document.createElement('div');
            fatherDiv.classList.add('tree-node');
            const father = geniData[person.father];
            fatherDiv.innerHTML = `<strong>${father.name}</strong> (${father.birthYear || 'Unknown'} - ${father.deathYear || 'Unknown'})`;

            // Recursively add the father's ancestors
            const grandFathersDiv = createAncestorsTree(person.father);
            fatherDiv.appendChild(grandFathersDiv);

            ancestorsContainer.appendChild(fatherDiv);
        }

        if (person.mother) {
            const motherDiv = document.createElement('div');
            motherDiv.classList.add('tree-node');
            const mother = geniData[person.mother];
            motherDiv.innerHTML = `<strong>${mother.name}</strong> (${mother.birthYear || 'Unknown'} - ${mother.deathYear || 'Unknown'})`;

            // Recursively add the mother's ancestors
            const grandMothersDiv = createAncestorsTree(person.mother);
            motherDiv.appendChild(grandMothersDiv);

            ancestorsContainer.appendChild(motherDiv);
        }
    }

    return ancestorsContainer;
}


// Toggle the options panel visibility
function toggle(isOptions) {
    let collapseOther = false;
    if (screenWidth < screenHeight) {
        collapseOther = true;
    }

    if (isOptions) {
        const panel = document.querySelector('.tree-options-container');
        const toggleButton = document.getElementById('toggle-options');

        panel.classList.toggle('collapsed');
        toggleButton.classList.toggle('collapsed');

        if (collapseOther) {
            const searchPanel = document.querySelector('.dropdown-container');
            const searchButton = document.getElementById('toggle-search');

            searchPanel.classList.add('collapsed');
            searchButton.classList.add('collapsed');
        }
    } else {
        const panel = document.querySelector('.dropdown-container');
        const toggleButton = document.getElementById('toggle-search');

        panel.classList.toggle('collapsed');
        toggleButton.classList.toggle('collapsed');

        if (collapseOther) {
            const optionsPanel = document.querySelector('.tree-options-container');
            const optionsButton = document.getElementById('toggle-options');

            optionsPanel.classList.add('collapsed');
            optionsButton.classList.add('collapsed');
        }
    }
}

async function getProgenitors() {
    try {
        const response = await fetch(geniProfilesUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch Geni profiles');
        }
        geniData = await response.json();
        console.log('Geni profiles:', geniData);
        
        progenitorList = Object.entries(geniData).map(([key, profile]) => ({
            name: profile.name,
            id: key
        }));
        console.log('Progenitors:', progenitorList);
    } catch (error) {
        console.error('Error fetching Geni profiles:', error);
    }
}



function setInitialValue() {
    const searchInput = document.getElementById('progenitor-search');
    searchInput.value = 'David I';

    selectProgenitor('David I', 1059)
}

async function init() {
    await getProgenitors();  // Wait for getProgenitors to complete
    setInitialValue();  // Run setInitialValue after getProgenitors finishes

    if (screenWidth < screenHeight) {
        toggle(true);
        toggle(false);
    }
}


init();