//Keys
mapboxgl.accessToken = 'pk.eyJ1IjoibmFuY3kzMjQiLCJhIjoiY21oMTEyejlmMDY1YzJycHVwYXVyZ2U1ZiJ9.YSOrhRs2Nuc7-00ALC3Q_w';
const apiKey = 'd60975b1-a097-482a-8862-c3d62b381b0a';

//Constants and globals
const topbar = document.getElementById('topbar');
const originaltopbarHTML = topbar.innerHTML;
let currentTerminalName =  "";
const layers = {
    ferries: "ferry-particles-layer",
    routes: "ferryRoutesLayer",
    terminals: "terminalLayer",
    ferrylocations: "ferryData-layer"
};

//Initialize map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/nancy324/cmhxwciko001u01sq7rf76i37',
    zoom: 8.2,
    center: [-122.5, 47.95],
    minZoom: 8.2,
});

//Load Ferry Routes layer and Route Animation
map.on('load', async () => {
    const response = await fetch('assets/WSDOT_-_Ferry_Routes.geojson');
    const ferryRoutes = await response.json();

    map.addSource('ferryRoutes', {
        type: 'geojson',
        data: ferryRoutes
    });

    
    map.addLayer({
        id: 'ferryRoutesLayer',
        type: 'line',
        source: 'ferryRoutes',
        paint: { 'line-color': '#0066cc', 'line-width': 2 }
    });
    
    // ---- PARTICLE ANIMATION SETUP ----

    // Prepare route data
    const routes = [];

    ferryRoutes.features.forEach(f => {
        const geom = f.geometry;
        if (!geom || !geom.coordinates) return;

        if (geom.type === "LineString") {
            const coords = geom.coordinates;
            if (coords.length > 1) {
                routes.push(coords);              
                routes.push([...coords].reverse());
            }
        }

        else if (geom.type === "MultiLineString") {
            geom.coordinates.forEach(line => {
                if (line.length > 1) {
                    routes.push(line);               
                    routes.push([...line].reverse()); 
                }
            });
        }
    });

    // Create particles for each route
    const particles = [];
    const PARTICLES_PER_ROUTE = 1; // adjust density
    routes.forEach((route, routeIdx) => {
        for (let i = 0; i < PARTICLES_PER_ROUTE; i++) {
            particles.push({
                routeIdx,
                progress: 0,
            });
        }
    });

    // Add GeoJSON source for particle symbols
    map.addSource('ferry-particles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    // Add symbol layer for particles
    map.addLayer({
        id: 'ferry-particles-layer',
        type: 'symbol',
        source: 'ferry-particles',
        layout: {
            'icon-image': 'cute2', // or a custom particle sprite
            'icon-size': .05,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        },
        paint: {
            'icon-color': '#ffcc00'
        }
    });

    // Animate particles along the routes
    function animateParticles() {
        const features = particles.map(p => {
            const route = routes[p.routeIdx];
            const totalSegments = route.length - 1;
            let idx = Math.floor(p.progress * totalSegments);
            if (idx >= totalSegments) idx = totalSegments - 1;

            const t = p.progress * totalSegments - idx;

            const [lng1, lat1] = route[idx];
            const [lng2, lat2] = route[idx + 1];

            const lng = lng1 + (lng2 - lng1) * t;
            const lat = lat1 + (lat2 - lat1) * t;

            // Increment progress
            p.progress += 0.0003; // speed
            if (p.progress > 1) p.progress = 0;

            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: {}
            };
        });

        map.getSource('ferry-particles').setData({
            type: 'FeatureCollection',
            features
        });

        requestAnimationFrame(animateParticles);
    }
    
    // Start the animation
    animateParticles();
    loadFerryData();
    loadterminalData();
});

//Load specific ferry information on click
map.on('click', 'ferryData-layer', e => {
    const v = e.features[0].properties;
    const topbar = document.getElementById('topbar');

    map.flyTo({
        center: [e.lngLat.lng,e.lngLat.lat+0.012],
        zoom: 13.5,
        speed: 1.2,      
        curve: 1.42,      
        essential: true   
    });

    topbar.innerHTML = `
        <h3><strong>${v.VesselName}</strong></h3>
        <button id="backButton">Back to port list</button>
        <table class="ferry-schedule-table">
            <tr>
                <th>Speed</th>
                <th>Position</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>ETA</th>
            </tr>
            <tr>
                <td>${parseFloat(v.Speed).toFixed(1)} kn</td>
                <td>[${e.lngLat.lng.toFixed(4)}, ${e.lngLat.lat.toFixed(4)}]</td>
                <td>${v.Departing}</td>
                <td>${v.Arriving}</td>
                <td>${v.Eta}</td>
            </tr>
        </table>
    `;
    backButton();
});

//Load specfic terminal schedule on click
map.on('click', 'terminalData-layer', e => {
    const v = e.features[0].properties;
    currentTerminalName = v.TerminalName;
    loadScheduleData(v.TerminalID);
    map.flyTo({
        center: [e.lngLat.lng, e.lngLat.lat+0.012],
        zoom: 13.5,
        speed: 1.2,      
        curve: 1.42,      
        essential: true   
    });
});

/*
  Create a GeoJSON from ferry vessel data and update the map
  data: api data from WSDOT Ferry Vessel API
*/
function handleFerryData(data) {
    const vessels = data || [];
    if (!data) {
        console.warn("No vessel data returned from API", data);
       return; // stop function safely
    }
    
    const geojson = {
        type: "FeatureCollection",
        features: vessels.map(v => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [v.Longitude, v.Latitude] },
            properties: {
                VesselName: v.VesselName,
                Departing: v.DepartingTerminalName,
                Arriving: v.ArrivingTerminalName,
                InService: v.InService,
                Speed: v.Speed,
                Status: v.VesselWatchStatus,
                Eta: v.Eta
                    ? new Date(parseInt(v.Eta.replace(/\/Date\((\d+).*/, '$1'))).toLocaleString()
                    : "Docked (no ETA)"
            }
        }))
    };

    updateMap(geojson);
    
    updateMap(geojson);
    const topbar = document.getElementById('topbar');
    const spinner = topbar.querySelector('.spinner');
    if (spinner) {
        spinner.remove();
    }
}

//Load ferry vessel location data via JSONP
function loadFerryData() {
    const oldScript = document.getElementById('jsonpScript');
    if (oldScript) oldScript.remove();
    const script = document.createElement("script");
    script.id = 'jsonpScript';
    script.src = `https://www.wsdot.wa.gov/Ferries/API/Vessels/rest/vessellocations?apiaccesscode=${apiKey}&callback=handleFerryData`;
    document.body.appendChild(script);
}

/*
  Update map with ferry vessel or terminal data
  geojson: geojson data to add to map
*/
function updateMap(geojson) {
    const isTerminal = !!geojson.features?.[0]?.properties?.TerminalName;

    if (!isTerminal) {
        if (!map.getSource('ferryData')) {
            map.addSource('ferryData', { type: 'geojson', data: geojson });
        } else {
            map.getSource('ferryData').setData(geojson);
        }

        if (!map.getLayer('ferryData-layer')) {
            map.addLayer({
                id: 'ferryData-layer',
                type: 'symbol',
                source: 'ferryData',
                layout: {
                    visibility: 'none',
                    'icon-image': 'cute2',
                    'icon-size': 0.05, 
                    'icon-allow-overlap': true                }
            });
        }
    } else {
        if (!map.getSource('terminalData')) {
            map.addSource('terminalData', { type: 'geojson', data: geojson });
        } else {
            map.getSource('terminalData').setData(geojson);
        }

        if (!map.getLayer('terminalData-layer')) {
            map.addLayer({
                id: 'terminalData-layer',
                type: 'symbol',
                source: 'terminalData',
                layout: {
                    'icon-image': 'ferryport',
                    'icon-size': 0.12,
                    'icon-allow-overlap': true
                },
                paint: {
                    'icon-color': '#FFD700'
                }
            });
        }
    }
}

/*
  Create a GeoJSON for each ferry terminal and update the map and dropdown
  data: api data from WSDOT Ferry Terminal API
*/
function handleTerminalData(data) {
    const terminals = data || [];
    if (!data) {
        console.warn("No Terminal data returned from API", data);
       return;
    }
    const geojson = {
        type: "FeatureCollection",
        features: terminals.map(v => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [v.Longitude, v.Latitude] },
            properties: {
                TerminalName: v.TerminalName,
                TerminalID: v.TerminalID
            }
        }))
    };
    const select = document.getElementById('portSelect');

    select.innerHTML = '<option disabled selected>Select a Ferry Terminal:</option>';

    terminals.forEach(t => {
        const option = document.createElement('option');
        option.value = t.TerminalID;
        option.textContent = t.TerminalName;
        option.dataset.lat = t.Latitude;
        option.dataset.lng = t.Longitude;
        select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
        const selected = e.target.options[e.target.selectedIndex];
        loadScheduleData(e.target.value);
        currentTerminalName = e.target.options[e.target.selectedIndex].textContent;
        const lat = parseFloat(selected.dataset.lat);
        const lng = parseFloat(selected.dataset.lng);

        map.flyTo({
            center: [lng, lat+0.012],
            zoom: 13.5,
            speed: 1.2,      
            curve: 1.42,      
            essential: true   
        });

    });

    updateMap(geojson);
}

//Load ferry terminal data via JSONP
function loadterminalData() {
    const oldScript = document.getElementById('jsonpScript');
    if (oldScript) oldScript.remove();
    const script = document.createElement("script");
    script.id = 'jsonpScript';
    script.src = `https://www.wsdot.wa.gov/ferries/api/terminals/rest/terminallocations?apiaccesscode=${apiKey}&callback=handleTerminalData`;
    document.body.appendChild(script);
}

/*
  Pass schedule data to updateTerminalInfo function
  data: api data from WSDOT Ferry Terminal API
*/
function handleScheduleData(data) {
    const ScheduleToday = data;
    updateTerminalInfo(data);
}

/*
  Load schedule data for a specific terminal via JSONP
  TerminalID: ID of terminal to load schedule for
*/
function loadScheduleData(TerminalID) {
    const topbar = document.getElementById('topbar');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    topbar.appendChild(spinner);
    const oldScript = document.getElementById('jsonpScript');
    if (oldScript) oldScript.remove();
    const script = document.createElement("script");
    script.id = 'jsonpScript';
    script.src = `https://www.wsdot.wa.gov/ferries/api/terminals/rest/terminalsailingspace/${TerminalID}?apiaccesscode=${apiKey}&callback=handleScheduleData`;
    document.body.appendChild(script);
}

/*
  Parse Microsoft JSON date string to JavaScript Date object
  msDateString: Microsoft JSON date string
*/
function parseMSDate(msDateString) {
    if (!msDateString) return null; // handle null values
    const match = /\/Date\((\d+)(?:[-+]\d+)?\)\//.exec(msDateString);
    if (!match) return null;
    const timestamp = parseInt(match[1], 10);
    return new Date(timestamp);
}

/*
  Update terminal info in the topbar with schedule data
  terminalCombos: api data for terminal sailings
*/
function updateTerminalInfo(terminalCombos) {
    topbar.innerHTML = `<h3><strong>Today's Ferry Schedule From ${currentTerminalName}</strong></h3>`;

    if (terminalCombos.Message) {
        topbar.innerHTML += "<p>No schedule data available.</p>";
        topbar.innerHTML += "<button id=backButton>Back to port list</button>";
        backButton();
        return;
    }

    schedule = terminalCombos.DepartingSpaces;

    topbar.innerHTML += "<br><button id=backButton>Back to port list</button>";

    const html = schedule.map(tc => {
        // Extract vessel name
        const vesselName = tc.VesselName || (tc.Times && tc.Times[0] && tc.Times[0].VesselName) || "Unknown";

        // Extract departing time
        let departingTime = parseMSDate(tc.Departure);
        if (!departingTime && Array.isArray(tc.Times) && tc.Times.length > 0) {
            departingTime = parseMSDate(tc.Times[0].DepartingTime);
        }

        // Extract destination terminal
        ArrivingData = tc.SpaceForArrivalTerminals;
        const PercentFull =  Math.round((100 - (ArrivingData[0].DriveUpSpaceCount / ArrivingData[0].MaxSpaceCount * 100)) * 100) / 100;
        const destination = ArrivingData[0].TerminalName || "Unknown";

        return `
        <table class="ferry-schedule-table">
            <tr>
                <th>Vessel</th>
                <th>Departing</th>
                <th>Destination</th>
                <th>Capacity</th>
                <th>Tickets</th>
            </tr>
            <tr>
                <td>${vesselName}</td>
                <td>${departingTime ? departingTime.toLocaleTimeString() : 'N/A'}</td>
                <td>${destination}</td>
                <td><p style="color: ${ArrivingData[0].DriveUpSpaceHexColor};">${PercentFull}%</p></td>
                <td><a href="https://wave2go.wsdot.com/webstore/landingPage?cg=21&c=76">Tickets</a></td>
            </tr>
        </table>
    `;
    }).join('');

    topbar.innerHTML += html;
    backButton();
}

//Toggle between simulated and real ferry positions by hiding/showing layers
document.getElementById("ferryToggle").addEventListener("change", (e) => {   
    map.setLayoutProperty(
        "ferryRoutesLayer",
        "visibility",
        e.target.checked ? "none" : "visible"
    );
    map.setLayoutProperty(
        "ferry-particles-layer",
        "visibility",
        e.target.checked ? "none" : "visible"
    );
    map.setLayoutProperty(
        "ferryData-layer",
        "visibility",
        e.target.checked ? "visible" : "none"
    );
});

//Back button functionality to return to main view
function backButton() {
    document.getElementById('backButton').addEventListener('click', () => {
        topbar.innerHTML = originaltopbarHTML;
        map.flyTo({
            center: [-122.5, 47.95],
            zoom: 8.2,
            speed: 1.2,      
            curve: 1.42,      
            essential: true   
        });
        document.getElementById('refreshButton').addEventListener('click', () => {
            loadFerryData();
            loadterminalData();
            topbar.innerHTML = originaltopbarHTML;
        });
        loadFerryData();
        loadterminalData();
    });
}

//Intro screen dismissal on first click
document.addEventListener("click", () => document.getElementById("intro").classList.add("hidden"), {once: true});