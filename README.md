# ELEVATE-China — PastureWatch

Drone-based cattle monitoring for a mountain summer pasture, down to the individual animal.

## Study area

The **Assy Plateau** (Ассы жайлауы), Enbekshikazakh District, Almaty Region — between the
**Turgen Gorge** to the north-west and the **Bartogai Reservoir** to the east, with the Assy River
running east across the plateau into the reservoir. A classic *jailau*: 1,900–2,700 m, grazed from
June to late September. The demo covers 6,987 ha divided into twelve grazing areas (**Area 1–12**)
carrying 1,320 cattle in four herds (**Herd 1–4**).

Everything runs against a **deterministic simulated season** — no backend, no API keys, no map
tiles. Reload gives the same season every time.

## Run it

**No install:** open `PastureWatch.html` — a single self-contained file in this repo. Double-click it
and it runs in any browser, offline. Everything is inlined: the interface, the simulated season, the
map. Nothing is fetched from the network.

**From source:**

```bash
npm install
npm run dev         # http://localhost:5173
npm run build       # type-check + production bundle into dist/
npm run standalone  # rebuild PastureWatch.html + farm.json, the downloadable pair
npm run make-farm   # regenerate src/data/farm.json from the model defaults
```

## The input database — `farm.json`

The app has **one input file**: [`farm.json`](farm.json) (the working copy lives at
`src/data/farm.json`). Nothing else is stored — every count, position, chart, alert and colour on
screen is calculated from it. Change a value and the whole interface changes with it.

**How to edit it:** open the app → **Data** in the top bar → **Download farm.json** → edit it in any
text editor → **Load an edited file**. The page reloads and recomputes the season. **Back to the
original file** undoes everything. A badge in the header shows when an edited database is in force.
An unusable file is refused with the reason and the current one is kept.

| Section | What it sets | Try changing |
|---|---|---|
| `meta` | where the pasture is, how big, how the areas are laid out | `layoutSeed` redraws every fence line |
| `season` | first day of grazing and how many days it runs | `days: 60` for a short season |
| `forage` | how much grass each pasture type grows, intake per animal, safe offtake | `peakGrassKgPerHa.meadow` |
| `flights` | drone hours, the wind limits that ground or shorten a mission, miss rate | `groundedAboveWindMs: 6` grounds most of the season |
| `areas` | one entry per area, each `meadow` / `typical` / `sandy` | make an area `sandy` and watch its Green Index fall and an overgrazing alert appear |
| `herds` | herd size, the areas it rotates through, days per area, where the cycle starts | `head`, `rotation`, `daysPerArea` |
| `animalEvents` | the individual animals flagged: `lost`, `needsAttention`, `separated`, `welfare` | add a cow id and a `fromDay` |
| `weather` | one row per day — rain, temperature, wind | set a `windMs` above 11 and that day's flight is grounded, the count carries over, and the alert follows |

Worked example: setting every area to `sandy` takes the Green Index from 0.32 to 0.26 and the job
list from 6 items to 13; cutting `herds[0].head` from 405 to 120 takes the registered total from
1,320 to 1,035 across every screen.

## The three screens

### 1 · Today

Opens with a **warning panel**: how many cattle are missing from each herd, and the animals that
need a person today — away from the group and barely moving — each with its GPS position.

Below it, the four indicators that decide the day: **cattle detected / total**, **last drone
flight**, **average distance walked**, and the **Green Index** with how many areas have run out of
grass.

Then the **herd map** over the plateau terrain: ridges, the Turgen gorge, the Assy river, the
Bartogai reservoir and the track up from Turgen. Grazing areas are coloured by how much grass they
have left — mostly green, a few amber, one area out of grass. Switch between **All herds** and any
single herd: all-herds shows one marker per herd, a single herd zooms in and draws **every animal**,
coloured by detection confidence. Flagged animals are always circled and labelled, whatever the
zoom. Click any animal for its record: ID, GPS, ground height, last seen, distance walked, time
standing still, distance from its group.

Then **what to do today** — the jobs, each with coordinates — and a detail card per herd.

### 2 · Alerts

Every issue as a card: **what the drone saw**, **why it matters**, **what to do**, plus GPS and the
animal IDs involved. Alerts and the dashboard are generated from the same objects (`src/lib/issues.ts`),
so the two screens can never tell different stories.

### 3 · History

How conditions evolve: animals needing attention over the season (missing, not moving, away from the
group, possibly sick), distance walked per herd, the **Green Index of every area through the season**
in ten-day blocks, month-by-month and season-by-season summaries, and the recent flight log.

## How the data holds together

`src/data/source.ts` reads `farm.json` — the one file everything starts from, either the shipped copy
or one loaded through the Data menu. `src/data/ranch.ts` turns it into geography and herds;
`src/data/simulate.ts` runs the season — herd movement by the hour, forage growth against rainfall
and the seasonal curve, drone missions with wind limits and occlusion. `src/data/animals.ts` turns
that into individual animals: **which animals the drone missed is derived from the herd count the
mission already reported**, so the per-animal view can never disagree with the herd totals, and the
history page re-runs the very same rules across the whole season.

Three things the demo is careful about, because each would cost a farmer a wasted day:

1. **A short flight is not a missing cow.** Above 11 m/s the fleet stays down; the screen says the
   round could not be finished and asks for a recount instead of reporting losses.
2. **Ordinary occlusion is not a missing cow either.** Which animals are hidden changes every day, so
   "not seen for nine days" means something. Three animals genuinely go missing during the season.
3. **Away from the herd *and* not moving** is the combination that gets an animal flagged as urgent —
   either signal alone is normal behaviour.

## Project layout

```
farm.json      the input database, next to PastureWatch.html
src/
  data/        farm.json (input database), source.ts (loads it), ranch.ts (geography &
               herds), simulate.ts (the season), animals.ts (individual animals)
  lib/         seeded PRNG, geometry, area status rules, the issue builder, formatting
  components/  HerdMap (terrain + animals), DataPanel (the database drawer), chart kit, UI atoms
  views/       TodayView · AlertsView · HistoryView
  i18n.tsx     EN/中文 dictionary, language + theme context
scripts/
  make-farm.ts     regenerates src/data/farm.json
  standalone.mjs   inlines the build into PastureWatch.html
```

> Demonstration dataset. The herds, flights and weather are simulated; the geography, the model
> structure and the alert thresholds are the parts meant to be reviewed.
