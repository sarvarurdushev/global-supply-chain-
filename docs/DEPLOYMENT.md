# Deploying to Render

Verified end to end on 2026-09-21 against the production build, not assumed:
the bundle was built, served by `npm start` on an assigned port, driven in a
real browser, and every claim below was checked against what the server
actually did.

---

## 1. What kind of service this is, and why it matters

**A web service, not a static site.**

The map layers do not call upstream APIs directly. They call this app's own
`/api/*` proxies, which validate queries, cache, rotate mirrors, rate-limit and
attach the User-Agent the public APIs require — Overpass, OSRM routing,
TomTom traffic, NASA FIRMS, OpenSky, AIS, GTFS, terrain heights, the
supply-chain proxy and the rest. Those proxies are Node middleware and they run
in the server process.

Deploy this as a static site and the page loads, the globe spins, and **every
layer that needs a proxy answers 404**: no roads, no rail, no pipelines, no
traffic, no fires, no aircraft, no vessels, no disaster road network.

`npm start` is `vite preview`, which serves the built bundle **together with**
every provider plugin — each one registers `configurePreviewServer`, so the
proxies are live. Two things are deliberately different in production:

- **Provider Settings is absent.** The in-app key panel pins itself to
  `serve && !isPreview`, so a hosted instance cannot be asked which keys it
  holds, let alone given one. Keys come from the environment.
- **Unknown `/api/*` routes answer a clean 404 JSON**, not the HTML fallback.

Measured on the production server:

| Request | Result |
| --- | --- |
| `GET /` with a `*.onrender.com` Host header | 200 |
| `POST /api/overpass` | 200, real OSM geometry |
| `GET /api/setup/status` | **404** — the key panel is not there |
| `GET /assets/index-*.js` | 200 |

---

## 2. The five settings that decide whether it works

Render's defaults are wrong for this app in four specific ways. Each of these
fixes one of them.

| Variable | Value | Why, concretely |
| --- | --- | --- |
| `NODE_VERSION` | `24.14.0` | `engines` requires `>=24.14.0 <25 \|\| >=26 <27`. Render defaults lower and the install fails the engine check. |
| `NPM_CONFIG_PRODUCTION` | `false` | Render sets `NODE_ENV=production`, which makes npm skip `devDependencies`. **Vite is a devDependency and Vite is what serves the app** — without this the build has no bundler and the start command has no server. |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` | Puppeteer is a devDependency used only by the QA script. Without this it downloads a ~200 MB Chromium on every build, for nothing. |
| `HOST` | `0.0.0.0` | Binds every interface. It also switches `allowedHosts` to `true`, which is what lets the service answer on Render's generated domain instead of refusing it as an unknown host. |
| `PORT` | *(set by Render — do not set it yourself)* | Read by `server/standalone/vite.config.js` and passed into the preview server. |

**On `PORT` specifically:** Vite does not inherit `server.port` into its
preview server. Before this was fixed the app would have bound 4173 while
Render waited on `$PORT`, and the deploy would have been marked unhealthy
while the process ran perfectly — a failure that looks like a crash and is not
one. `build/vite.js` now sets an explicit `preview` block.

---

## 3. Deploy it

### Option A — the blueprint (recommended)

`render.yaml` is in the repository root with all of the above already set.

1. Push the branch to GitHub (it already is).
2. In Render: **New → Blueprint**, pick the repository, and Render reads
   `render.yaml`.
3. Review the service it proposes and click **Apply**.
4. Add any optional API keys under the service's **Environment** tab. They are
   declared `sync: false` in the blueprint, which means Render prompts for them
   and never stores them in git.

### Option B — by hand

**New → Web Service**, connect the repository, then:

| Field | Value |
| --- | --- |
| Language | Node |
| Branch | `claude/supply-chain-intelligence-platform-5u3va2` |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/` |

Then add the five environment variables from §2 (all but `PORT`).

---

## 4. It runs without a single API key

Every provider key is optional, and the interface states which layers a
missing key holds back rather than failing or pretending. With no keys at all
you still get: the globe on Esri imagery, terrain from Re:Earth / Mapterhorn,
the whole disaster investigation (USGS is keyless), all the OpenStreetMap
infrastructure layers, GDACS events, World Bank and Comtrade trade data, the
supply-chain engine, and the Nepal demo.

| Key | Unlocks | Without it |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | Photorealistic 3D tiles, places, geocoding | Esri imagery; search uses Photon/Nominatim |
| `CESIUM_ION_TOKEN` | Cesium World Terrain | Terrain from Re:Earth / Mapterhorn |
| `TOMTOM_API_KEY` | Live road traffic | Traffic layer states the missing key |
| `FIRMS_MAP_KEY` | NASA active fire detections | Bundled snapshot only |
| `AISSTREAM_API_KEY` | Live vessel positions | Vessel layer states the missing key |
| `OPENSKY_CLIENT_ID` / `_SECRET` | Higher OpenSky rate limits | adsb.lol fallback |
| `OPENAI_API_KEY` | Voice control | Voice control is off |

**Google Maps billing warning.** Photorealistic 3D Tiles are billed per
request. On a public URL that is a bill somebody else can run up for you.
Restrict the key to your Render domain in the Google Cloud console before you
deploy it, or leave it unset.

---

## 5. Plan sizing

- **Free** works. It sleeps after ~15 minutes idle and takes 30–60 s to wake,
  and free builds are slow — this bundle is large (Cesium alone is ~3 MB).
- **Starter** is what the blueprint requests: no sleeping, and the build has
  enough memory to be comfortable.

The Overpass disk cache writes to `.gev-cache/overpass` under the working
directory. Render's filesystem is ephemeral, so that cache resets on every
deploy — which costs a few slower first queries and nothing else. No
persistent disk is needed.

---

## 6. Licence, before you make it public

Read `docs/DATA_LICENSE_MATRIX.md` §0 first. Two things shipped in this
repository are **NonCommercial**:

1. **TeleGeography submarine cables** — CC BY-NC-SA 3.0.
2. **Bhote Koshi event imagery and the derived centreline** — CC BY-NC 4.0.

A personal or demonstration deployment is fine. A commercial one needs those
removed or separately licensed — §4 of that document is the removal procedure.
ODbL share-alike also attaches to anything derived from the OpenStreetMap
layers, and the required attributions must stay visible in the credit line.
