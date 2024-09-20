const express = require('express');
const app = express();
const path = require('path');

// Serve static files
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/data', express.static(path.join(__dirname, '../data')));

// Serve the main HTML file
// Route for each HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/home.html'));
});

app.get('/map', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/map.html'));
});

app.get('/estate', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/estate.html'));
});

app.get('/claimants', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/claimants.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/profile.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
