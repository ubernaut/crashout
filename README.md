# Crashout

An interactive Palm Beach Learjet 60 cockpit study, adapted from the CesiumJS,
vanilla JavaScript and Vite patterns in `../exoavdata`. Satellite imagery is on
by default. The app runs entirely in the browser with no backend or API keys.

The default **custom scenario** begins at 40,000 feet and 100 mph true airspeed,
accelerating to 800 mph at an approximate 16-foot MSL ground plane. Its speed,
flight-path angle, right turn and position are integrated consistently. These
requested endpoints are not verified accident speeds or a certified flight model.

The **published ADS-B** option uses 30 samples downloaded from Flightradar24,
17:47:46–17:49:23 UTC. It stops at 8,750 feet. Published speeds are groundspeeds;
the replay never relabels them as airspeeds or invents a final impact segment.
The article states a final time one second earlier than its downloadable CSV.
Later rows repeat the same altitude, so they are excluded.

Weather uses the archived 1 November 2026 KDJT 17:53Z METAR: 08016G28KT,
10SM, light rain, scattered clouds at 2,600 and 5,000 feet AGL, overcast at
6,000 feet, 26°C / 23°C, A3006. This nearby surface observation is four minutes
after the reported accident minute. Reports of icing, −47°C and moderate
turbulence inform the effects aloft. Cloud volumes, rain trajectories,
turbulence and temperature interpolation are illustrative. Observed surface
wind drifts the custom path near the ground with an assumed taper below
10,000 feet; upper-air winds are unknown. Flight levels are drawn as approximate
MSL heights over a WGS84 ellipsoid. There is no surveyed terrain or building
collision model. Cockpit attitude is inferred, and the panel is Learjet-inspired,
not an authenticated reproduction of N722BD’s avionics or crew actions.

Sources and their limitations are available in the app’s **Evidence & sources**
dialog. Historical source excerpts are bundled in `public/data/`. Weather is
never replaced with present-day observations. EOX satellite imagery is the 2024
cloudless mosaic, not event-time imagery; loading map tiles requires internet.
EOX noncommercial usage and attribution terms apply. The accident cause remains
under investigation.

## Development and build

Use Node.js 24 or later:

```sh
npm ci
npm run dev
npm test
npm run build:pages
```

`npm run build:pages` writes the deployable application and Cesium runtime assets
to **`docs/`** at the repository root. Relative asset paths support GitHub Pages
project subpaths and custom domains. `.nojekyll` is included. GitHub Pages should
publish the `main` branch’s `/docs` folder. No build service is required.

For the browser check, serve the repository root:

```sh
python3 -m http.server 4178 --bind 127.0.0.1
npm run test:smoke
```

The smoke check uses system Google Chrome, loads `/docs/`, checks real WebGL and
satellite tiles, exercises both replay profiles and controls, and checks mobile
layout. Screenshots stay outside the repository in `/tmp/crashout-qa/`.

Controls: **Space** play/pause, **R** recenter, **V** cockpit/overview,
**← / →** seek five seconds. Drag the windshield to look around. Audio starts
only when explicitly enabled. Reduced-motion preference disables turbulence
motion initially.

Flight telemetry and Environment start minimized on mobile (760 px or narrower).
Tap either title bar’s **+ / −** to restore or minimize it independently; desktop
panels start expanded and offer the same controls. Minimizing preserves weather
settings and playback. The title bars also work with keyboard Enter or Space.

Cesium transitive packages are pinned to the versions used by the template:
engine 26.2.0 and widgets 16.1.1. Newer transitive minor releases removed exports
still expected by Cesium 1.144.0.

## Sources

- [Flightradar24 incident analysis and downloadable data](https://www.flightradar24.com/blog/flight-tracking-news/major-incident/learjet-60-crashes-near-west-palm-beach-florida/)
- [Iowa Environmental Mesonet ASOS archive](https://mesonet.agron.iastate.edu/request/download.phtml)
- [WPTV / CNN weather and ATC reporting](https://www.wptv.com/us-news/9-killed-after-a-learjet-crashes-and-erupts-into-flames-in-palm-beach-county-florida)
- [ABC News location and FAA reporting](https://abcnews.com/US/learjet-9-aboard-crashes-palm-beach-florida-faa/story?id=137753599)
- [EOX Sentinel-2 cloudless imagery](https://s2maps.eu/)

ExoAVData code patterns are used under the MIT license; see `LICENSE`.
