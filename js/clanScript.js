const geniProfilesUrl = '/data/geni-profiles.json';

let progenitorList = [];
let geniData = {};

//Get screen width and height
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;

let superTreeWidth = 2000;
let superTreeHeight = 1000;

//Get body, unhide overflow-x
let body = document.getElementsByTagName('body')[0];
body.style.overflowX = 'visible';

//Fix position of nav, tree-options-container, and dropdown-container
makeUIFixedForClanView();
function makeUIFixedForClanView() {
    // Nav
    const nav = document.querySelector('nav');
    nav.style.position = 'fixed';
    nav.style.top = '0';
    nav.style.left = '0';
    nav.style.width = '100%';
    nav.style.zIndex = '9999'; 
  
    // The dropdown container
    const dropdown = document.querySelector('.dropdown-container');
    dropdown.style.position = 'fixed';
    dropdown.style.top = '70px';
    dropdown.style.left = '20px';
    dropdown.style.zIndex = '9999';
  
    // The tree options container
    const treeOptions = document.querySelector('.tree-options-container');
    treeOptions.style.position = 'fixed';
    treeOptions.style.top = '70px';
    treeOptions.style.right = '20px';
    treeOptions.style.zIndex = '9999';
}


// =====================
// 1. SEARCH / SELECT
// =====================
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
            suggestionDiv.dataset.id = id; 
            suggestionDiv.onclick = () => selectProgenitor(name, id);
            suggestionsContainer.appendChild(suggestionDiv);
        });
    } else {
        suggestionsContainer.style.display = 'none';
    }
}

/**
 * Called when user selects a progenitor from the dropdown
 */
function selectProgenitor(name, id) {
    document.getElementById('progenitor-search').value = name;
    document.getElementById('suggestions-container').style.display = 'none';
    console.log(`Selected progenitor: ${name}, ID: ${id}`);

    // 1. Build the specialized data set for father's priority
    const primaryParentData = buildPrimaryParentDescendants(id, geniData);

    // 2. Then call BFS-based layout + rendering with the new data
    renderTree(id, primaryParentData);
}

function buildHierarchy(rootId, data) {
    // If there's no record for this person, return null
    if (!data[rootId]) return null;
  
    const person = data[rootId];
    // Build a node object
    const node = {
      id: rootId,
      name: person.name,
      children: []
    };
  
    // Recursively build children
    if (person.children && person.children.length > 0) {
      for (let childId of person.children) {
        // THE KEY CHECK: skip if no one is alive in that child's subtree
        console.log(anyDescendantAlive(childId, data));
        if (anyDescendantAlive(childId, data)) {
          const childNode = buildHierarchy(childId, data);
          if (childNode) {
            node.children.push(childNode);
          }
        }
      }
    }
  
    return node;
  }

  function getSubtreeWidth(node, nodeWidth, hGap) {
    if (!node.children || node.children.length === 0) {
      return nodeWidth; // leaf node
    }
  
    // Sum widths of children subtrees + gaps between them
    let total = 0;
    for (let i = 0; i < node.children.length; i++) {
      let child = node.children[i];
      total += getSubtreeWidth(child, nodeWidth, hGap);
      if (i < node.children.length - 1) {
        total += hGap; // add gap between siblings
      }
    }
    // Compare child-sum to nodeWidth to ensure at least nodeWidth wide
    return Math.max(total, nodeWidth);
  }

  

  function assignPositions(node, x, y, nodeWidth, nodeHeight, hGap, vGap, nodePositions) {
    // Record the current node's position
    nodePositions[node.id] = { x, y };
  
    // If no children, return early
    if (!node.children || node.children.length === 0) {
      return;
    }
  
    // Separate children into two groups: those with children and those without
    const childless = [];
    const hasChildren = [];
    for (let c of node.children) {
      if (c.children && c.children.length > 0) {
        hasChildren.push(c);
      } else {
        childless.push(c);
      }
    }
  
    // Combine all children for layout purposes
    const allChildren = [...hasChildren, ...childless];
  
    // Calculate total width needed for children
    let totalWidth = 0;
    for (let i = 0; i < allChildren.length; i++) {
      if (i > 0) totalWidth += hGap; // Add gaps between siblings
      totalWidth += getSubtreeWidth(allChildren[i], nodeWidth, hGap);
    }
  
    // Determine the leftmost starting point for child layout
    let leftEdge = x - totalWidth / 2;
  
    // Place each child
    for (let i = 0; i < allChildren.length; i++) {
      const child = allChildren[i];
      const subtreeWidth = getSubtreeWidth(child, nodeWidth, hGap);
  
      // Center the child within its allocated space
      const childX = leftEdge + subtreeWidth / 2;
      const childY = y + vGap;
  
      // Recursively assign positions for children with descendants
      assignPositions(child, childX, childY, nodeWidth, nodeHeight, hGap, vGap, nodePositions);
  
      // Move to the next sibling position
      leftEdge += subtreeWidth + hGap;
    }
  }
  

  
  

// =====================
// 2. BUILD DESCENDANT DATA
// =====================

/**
 * Gather all descendant IDs of the root (using .children arrays in geniData).
 */
function gatherDescendants(rootId, geniData) {
    let visited = new Set();
    let queue = [rootId];
    visited.add(rootId);

    while (queue.length > 0) {
        let currentId = queue.shift();
        let person = geniData[currentId];
        if (!person) continue;

        // Follow .children if they exist
        if (person.children) {
            for (let childId of person.children) {
                if (!visited.has(childId)) {
                    visited.add(childId);
                    queue.push(childId);
                }
            }
        }
    }
    return visited; // set of all descendant IDs (including the rootId)
}

/**
 * Build a *filtered* data object that only includes
 * the selected root and its descendants, referencing father if father is in the set,
 * else mother if mother is in the set.
 */
function buildPrimaryParentDescendants(rootId, geniData) {
    // 1) Gather all descendant IDs
    const descendantsSet = gatherDescendants(rootId, geniData);

    // 2) Make a new object that includes only those IDs
    //    We'll give each person a fresh .children = [] to fill.
    const filteredData = {};
    for (let id of descendantsSet) {
        // Copy minimal fields you need for rendering
        filteredData[id] = {
            name: geniData[id].name,
            birthYear: geniData[id].birthYear,
            deathYear: geniData[id].deathYear,
            father: geniData[id].father,
            mother: geniData[id].mother,
            gender: geniData[id].gender,
            children: []
        };
    }

    // 3) For each person in the set, pick father if in set, else mother if in set
    for (let id of descendantsSet) {
        const person = filteredData[id];
        if (!person) continue;

        const fatherId = person.father;
        const motherId = person.mother;

        // Father is primary if he's also in the set
        if (fatherId && filteredData[fatherId]) {
            filteredData[fatherId].children.push(id);
        }
        // else mother is parent if *she* is in the set
        else if (motherId && filteredData[motherId]) {
            filteredData[motherId].children.push(id);
        }
        // else no parent in this tree
    }

    return filteredData;
}

// =====================
// 3. LAYOUT + RENDER
// =====================
function layoutTree(rootId, geniData) {
    // 1) Build a hierarchical tree
    const rootNode = buildHierarchy(rootId, geniData);
    if (!rootNode) {
      return {
        nodePositions: {},
        containerWidth: 1000,
        containerHeight: 600
      };
    }
  
    // 2) Prepare for layout
    const nodeWidth = 100;
    const nodeHeight = 60;
    const hGap = 40; 
    const vGap = 120;
    const nodePositions = {};
  
    // 3) Compute total tree width (to center the root)
    const totalTreeWidth = getSubtreeWidth(rootNode, nodeWidth, hGap);
    const rootX = totalTreeWidth / 2; // place root in the center
    const rootY = 50; // top padding
  
    // 4) Assign positions using DFS
    assignPositions(rootNode, rootX, rootY, nodeWidth, nodeHeight, hGap, vGap, nodePositions);
  
    // 5) Container size
    let maxX = 0, maxY = 0;
    for (let id in nodePositions) {
      let pos = nodePositions[id];
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }
  
    // Add margin to the far edges
    const containerWidth = Math.max(1000, maxX + nodeWidth + 50); 
    const containerHeight = Math.max(600, maxY + nodeHeight + 50);
  
    return { nodePositions, containerWidth, containerHeight };
  }
  

function renderTree(rootId, geniData) {
    const { nodePositions, containerWidth, containerHeight } = layoutTree(rootId, geniData);

    // Get the container
    const container = document.getElementById('tree-display');
    container.style.position = 'relative';
    container.style.width = containerWidth + 'px';
    container.style.height = containerHeight + 'px';
    container.innerHTML = '';

    // Create an SVG for lines
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", containerWidth);
    svg.setAttribute("height", containerHeight);
    svg.style.position = "absolute";
    svg.style.top = 0;
    svg.style.left = 0;
    container.appendChild(svg);

    // Create node divs
    for (let id in nodePositions) {
        const pos = nodePositions[id];
        const person = geniData[id];
    
        let nodeDiv = document.createElement('div');
        nodeDiv.style.position = 'absolute';
        nodeDiv.style.left = pos.x + 'px';
        nodeDiv.style.top = pos.y + 'px';
        nodeDiv.style.width = '100px';
        nodeDiv.style.height = '60px';
        nodeDiv.style.border = '2px solid #B37E31';
        nodeDiv.style.backgroundColor = '#f9f9f9';
        nodeDiv.style.fontFamily = '"Arial", sans-serif';
        nodeDiv.style.overflow = 'hidden';
        nodeDiv.style.display = 'flex';
        nodeDiv.style.flexDirection = 'column';
        nodeDiv.style.justifyContent = 'center';
        nodeDiv.style.alignItems = 'center';
    
        // Set border radius based on gender
        console.log(person);
        if (person.gender === 'Female') {
            nodeDiv.style.borderRadius = '20px'; // Heavily beveled for females
        } else {
            nodeDiv.style.borderRadius = '0px'; // No bevel for males
        }
    
        // nameDiv
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.width = '100%';
        nameDiv.style.display = 'flex';
        nameDiv.style.justifyContent = 'center';
        nameDiv.style.alignItems = 'center';
        nameDiv.style.textAlign = 'center';
        nameDiv.style.whiteSpace = 'normal';
        nameDiv.style.lineHeight = '1.2';
        nameDiv.style.fontSize = '14px';
        nameDiv.style.fontWeight = 'bold';
        nameDiv.style.padding = '0px 4px';
        nameDiv.innerHTML = person.name;
        nodeDiv.appendChild(nameDiv);
    
        // yearsDiv
        const yearsDiv = document.createElement('div');
        yearsDiv.style.height = '15px';
        yearsDiv.style.width = '100%';
        yearsDiv.style.fontSize = '0.8em';
        yearsDiv.style.textAlign = 'center';
        yearsDiv.style.color = '#333';
        const birth = person.birthYear || '????';
        const death = person.deathYear || '????';
        yearsDiv.textContent = `(${birth} - ${death})`;
        nodeDiv.appendChild(yearsDiv);
    
        container.appendChild(nodeDiv);
    }
    

    // Draw lines from each parent to their children
    for (let parentId in geniData) {
        let parent = geniData[parentId];
        if (parent.children && parent.children.length > 0) {
            let parentPos = nodePositions[parentId];
            if (!parentPos) continue; // skip if not in BFS scope

            let x1 = parentPos.x + 50;
            let y1 = parentPos.y + 50;

            for (let childId of parent.children) {
                let childPos = nodePositions[childId];
                if (!childPos) continue; // skip if not in BFS scope
                let x2 = childPos.x + 50;
                let y2 = childPos.y;

                let line = document.createElementNS(svgNS, 'line');
                line.setAttribute('x1', x1);
                line.setAttribute('y1', y1);
                line.setAttribute('x2', x2);
                line.setAttribute('y2', y2);
                line.setAttribute('stroke', '#B37E31');
                line.setAttribute('stroke-width', '2');
                svg.appendChild(line);
            }
        }
    }
}


// =====================
// OPTIONAL: scaleFontToFit
// =====================
function scaleFontToFit(textElement, containerWidth, containerHeight) {
    let fontSize = 20; 
    const minFontSize = 6;
    const step = 1;

    textElement.style.fontSize = fontSize + 'px';

    while (fontSize >= minFontSize) {
        const { scrollWidth, scrollHeight } = textElement;
        if (scrollWidth <= containerWidth && scrollHeight <= containerHeight) {
            break;
        } else {
            fontSize -= step;
            textElement.style.fontSize = fontSize + 'px';
        }
    }
}

// =====================
// 7. FETCH + INIT
// =====================
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
    selectProgenitor('David I', 1059);
}

async function init() {
    await getProgenitors(); 
    setInitialValue(); 

    if (screenWidth < screenHeight) {
        toggle(true);
        toggle(false);
    }
}

function isPersonAlive(person) {
    if (!person || !person.deathYear) {
        // If missing info, let's call it unknown => skip or treat as "alive"
        return false;
      }
      const dy = person.deathYear.toString().toLowerCase();
      if (dy === 'alive') {
        return true;
      } else {
        return false;
      }
}

function anyDescendantAlive(personId, data) {
    const person = data[personId];
    if (!person) return false; // no record
  
    // If the person is alive, done
    if (isPersonAlive(person)) {
      return true;
    }
  
    // Otherwise, check if any child is alive or leads to alive
    if (person.children) {
      for (let childId of person.children) {
        if (anyDescendantAlive(childId, data)) {
          return true;
        }
      }
    }
    return false;
  }

init();
