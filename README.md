# TimeGlobe

A browser-based world clock app for picking meeting times across time zones — look at a map, see day and night, and line up clocks for wherever your coworkers are.

**Live demo: https://leathersole.github.io/time-globe/**

## Features

- World map (with country borders) showing a live day/night terminator
- Click or tap a city on the map to add its clock; add as many as you need
- Each clock shows an analog face (hour/minute hands) plus a digital date, time, UTC offset, and a "+1d/-1d" badge when the city is on a different calendar day
- Time zones are resolved from the IANA time zone database, so daylight saving time is handled automatically
- Use the mouse wheel (or drag vertically on the map on touch devices) to shift every clock together in 10-minute steps; the day/night shading moves with it
- Jump to a specific date and time using the datetime picker in the header
- When viewing a different time, see the total offset from the current real time (e.g., "+2d 3h 20m")
- Add custom UTC offset clocks (fixed offset, no DST) for regions or use cases where a fixed time difference is preferred
- Settings panel for adding and removing locations, plus an option to invert scroll/drag direction
- Your selected clocks and preferences are saved to the browser's localStorage and restored on your next visit

## Tech stack

- Plain HTML / CSS / JavaScript — no build step
- Map rendering: [D3.js](https://d3js.org/) (`d3-geo`, etc.) + [`topojson-client`](https://github.com/topojson/topojson-client)
- Map data: [`world-atlas`](https://github.com/topojson/world-atlas) (110m resolution country borders)
- Time zone conversion: the browser's built-in `Intl.DateTimeFormat` with IANA time zone IDs (DST-aware)
- Day/night terminator: low-precision NOAA/Meeus solar position formulas for solar declination and the equation of time

## File structure

| File | Purpose |
| --- | --- |
| `index.html` | App markup |
| `style.css` | Styling |
| `app.js` | Core logic: solar position, time zone handling, map rendering, clock rendering, input handling |
| `cities.js` | City database (name, country, latitude/longitude, IANA time zone) |

## Running locally

No build step is required. Serve the folder with any static file server, or open `index.html` directly in a browser.

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Usage

- Click/tap a city dot on the map to add its clock
- Click/tap an empty spot on the map to add the nearest city's clock
- Use the mouse wheel, or drag vertically on the map, to move every clock by 10-minute steps (day/night shading moves too)
- Horizontal drags are reserved for scrolling the clock list, so they don't affect the time
- Click the datetime picker in the header to jump to a specific date and time
- Open **Settings** (top right) to:
  - Remove clocks or add one by searching for a city name
  - Add a custom UTC offset clock (e.g., UTC+9 or UTC-5:30) without DST
  - Toggle **Invert scroll direction** to reverse mouse wheel / drag behavior
- **Reset to now** returns to the live current time

## Deployment

Pushing to `main` automatically triggers a GitHub Pages rebuild, publishing to the demo URL above.
