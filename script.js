mapboxgl.accessToken = 'pk.eyJ1Ijoid2lsbHNlbmVua28iLCJhIjoiY21oNm9tenlzMGxmNzJpb211eWN4OWhzMiJ9.CNtId7OzmVwm4EajEwdCGg';
const apiKey = 'd60975b1-a097-482a-8862-c3d62b381b0a';

const sidebar = document.getElementById('sidebar');
const originalSidebarHTML = sidebar.innerHTML;

let currentTerminalName =  "";

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    zoom: 8.2,
    center: [-122.5, 47.95]
});

map.on('load', async () => {
    console.log("Map loaded");

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

        if (geom.type === 'LineString') {
            if (geom.coordinates.length > 1) routes.push(geom.coordinates);
        } else if (geom.type === 'MultiLineString') {
            geom.coordinates.forEach(line => {
                if (line.length > 1) routes.push(line);
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
                progress: Math.random(), // random starting position
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
            'icon-image': 'harbor-15', // or a custom particle sprite
            'icon-size': 1,
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
            p.progress += 0.001; // speed
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

map.on('click', 'ferryData-layer', e => {
    const v = e.features[0].properties;
    const sidebar = document.getElementById('sidebar');

    sidebar.innerHTML = `
        <table>
            <h2>${v.VesselName}</h2>
            <p><strong>Speed:</strong> ${parseFloat(v.Speed).toFixed(1)} kn</p>
            <p><strong>Position:</strong> [${e.lngLat.lng.toFixed(4)}, ${e.lngLat.lat.toFixed(4)}]</p>
            <p><strong>Origin:</strong> ${v.Departing}</p>
            <p><strong>Destination:</strong> ${v.Arriving}</p>
            <p><strong>ETA:</strong> ${v.Eta}</p>
        </table>
        <button id="backButton">Back to port list</button>

    `;

    document.getElementById('backButton').addEventListener('click', () => {
        sidebar.innerHTML = originalSidebarHTML

        document.getElementById('refreshButton').addEventListener('click', () => {
            loadFerryData();
            loadterminalData();
            sidebar.innerHTML = originalSidebarHTML;
            console.log("Ferry data refreshed");
        });
        loadFerryData();
        loadterminalData();
    });
});

function handleFerryData(data) {
    console.log("Raw ferry data:", data);
    const vessels = data || [];
    if (!data) {
        console.warn("No vessel data returned from API", data);
       return; // stop function safely
    }
    
    console.log("Vessels received:", vessels.length);
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
}

function loadFerryData() {
    console.log("Loading ferry data...");
    const oldScript = document.getElementById('jsonpScript');
    if (oldScript) oldScript.remove();

    const script = document.createElement("script");
    script.id = 'jsonpScript';
    script.src = `https://www.wsdot.wa.gov/Ferries/API/Vessels/rest/vessellocations?apiaccesscode=${apiKey}&callback=handleFerryData`;
    document.body.appendChild(script);
}

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
                type: 'circle',
                source: 'ferryData',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#2b83ba',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#000'
                }
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
                    'icon-image': 'harbor-15',
                    'icon-size': 2,
                    'icon-allow-overlap': true
                },
                paint: {
                    'icon-color': '#FFD700'
                }
            });
        }
    }
}


function handleTerminalData(data) {
    console.log("Raw terminal data:", data);
    const terminals = data || [];
    if (!data) {
        console.warn("No Terminal data returned from API", data);
       return;
    }
    
    console.log("terminals received:", terminals.length);
    const geojson = {
        type: "FeatureCollection",
        features: terminals.map(v => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [v.Longitude, v.Latitude] },
            properties: {
                TerminalName: v.TerminalName,
            }
        }))
    };
    const select = document.getElementById('portSelect');

    select.innerHTML = '<option disabled selected>Select a Ferry Terminal:</option>';

    terminals.forEach(t => {
        const option = document.createElement('option');
        option.value = t.TerminalID || t.TerminalName;
        option.textContent = t.TerminalName;
        select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
        console.log("Selected terminal:", e.target.value);
        loadScheduleData(e.target.value);
        currentTerminalName = e.target.options[e.target.selectedIndex].textContent;
        console.log("Current terminal name set to:", currentTerminalName);
    });

    updateMap(geojson);
}

function loadterminalData() {
    console.log("Loading terminal data...");
    const oldScript = document.getElementById('jsonpScript');
    if (oldScript) oldScript.remove();
    const script = document.createElement("script");
    script.id = 'jsonpScript';
    script.src = `https://www.wsdot.wa.gov/ferries/api/terminals/rest/terminallocations?apiaccesscode=${apiKey}&callback=handleTerminalData`;
    document.body.appendChild(script);
}


function handleScheduleData(data) {
    console.log("Handling schedule data...");
    //if (!data || !Array.isArray(data)) {
    //    console.warn("No ferry schedule data returned", data);
    //    return [];
    //}
    console.log("Raw schedule data:", data);
    // Collect all Times arrays from the dataset
    const ScheduleToday = data.TerminalCombos
    updateTerminalInfo(ScheduleToday);
}

function loadScheduleData(TerminalID) {
    console.log("Loading Schedule data...");
    const oldScript = document.getElementById('jsonpScript');
    if (oldScript) oldScript.remove();

    const script = document.createElement("script");
    script.id = 'jsonpScript';
    script.src = `https://www.wsdot.wa.gov/ferries/api/schedule/rest//scheduletoday/${TerminalID}//true?apiaccesscode=${apiKey}&callback=handleScheduleData`;
    document.body.appendChild(script);
}

function parseMSDate(msDateString) {
    if (!msDateString) return null; // handle null values
    const match = /\/Date\((\d+)(?:[-+]\d+)?\)\//.exec(msDateString);
    if (!match) return null;
    const timestamp = parseInt(match[1], 10);
    return new Date(timestamp);
}

function updateTerminalInfo(terminalCombos) {
    sidebar.innerHTML = `<h2>Today's Ferry Schedule From ${currentTerminalName}</h2>`;

    if (!terminalCombos || terminalCombos.length === 0) {
        sidebar.innerHTML += "<p>No schedule data available.</p>";
        sidebar.innerHTML += "<button id=backButton>Back to port list</button>";
        document.getElementById('backButton').addEventListener('click', () => {
        sidebar.innerHTML = originalSidebarHTML

        document.getElementById('refreshButton').addEventListener('click', () => {
            loadFerryData();
            loadterminalData();
            sidebar.innerHTML = originalSidebarHTML;
            console.log("Ferry data refreshed");
        });
        loadFerryData();
        loadterminalData();
        });
    }

    // Extract vessel name, departing time, and arriving terminal
    const html = terminalCombos.map(tc => {
        // Extract vessel name
        const vesselName = tc.VesselName || (tc.Times && tc.Times[0] && tc.Times[0].VesselName) || "Unknown";

        // Extract departing time
        let departingTime = parseMSDate(tc.DepartingTime);
        if (!departingTime && Array.isArray(tc.Times) && tc.Times.length > 0) {
            departingTime = parseMSDate(tc.Times[0].DepartingTime);
        }

        // Extract destination terminal
        const destination = tc.ArrivingTerminalName || (tc.Times && tc.Times[0] && tc.Times[0].ArrivingTerminalName) || "Unknown";

        return `
        <table class="ferry-schedule-table">
            <tr>
                <th>Vessel</th>
                <th>Departing</th>
                <th>Destination</th>
            </tr>
            <tr>
                <td>${vesselName}</td>
                <td>${departingTime ? departingTime.toLocaleTimeString() : 'N/A'}</td>
                <td>${destination}</td>
            </tr>
        </table>
    `;
    }).join('');

    sidebar.innerHTML += html;
    sidebar.innerHTML += "<button id=backButton>Back to port list</button>";
    document.getElementById('backButton').addEventListener('click', () => {
        sidebar.innerHTML = originalSidebarHTML

        document.getElementById('refreshButton').addEventListener('click', () => {
            loadFerryData();
            loadterminalData();
            sidebar.innerHTML = originalSidebarHTML;
            console.log("Ferry data refreshed");
        });
        loadFerryData();
        loadterminalData();
    });
}


