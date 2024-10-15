const geniProfilesUrl = '/data/geni-profiles.json';

let progenitorList = [];

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

function createTree(id) {

}

// Toggle the options panel visibility
function toggle(isOptions) {
    if (isOptions) {
        const panel = document.querySelector('.tree-options-container');
        const toggleButton = document.getElementById('toggle-options');

        panel.classList.toggle('collapsed');
        toggleButton.classList.toggle('collapsed');
    } else {
        const panel = document.querySelector('.dropdown-container');
        const toggleButton = document.getElementById('toggle-search');

        panel.classList.toggle('collapsed');
        toggleButton.classList.toggle('collapsed');
    }
}

function getProgenitors() {
    fetch(geniProfilesUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch Geni profiles');
            }
            return response.json();
        })
        .then(data => {
            console.log('Geni profiles:', data);
            // Map the data to an array of objects with name and id
            progenitorList = Object.entries(data).map(([key, profile]) => ({
                name: profile.name,
                id: key
            }));
            console.log('Progenitors:', progenitorList);
        })
        .catch(error => {
            console.error('Error fetching Geni profiles:', error);
        });
}


function setInitialValue() {
    const searchInput = document.getElementById('progenitor-search');
    searchInput.value = 'David I';

    selectProgenitor('David I', 1059)
}

getProgenitors();
setInitialValue();
