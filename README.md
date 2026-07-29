# ELEVATE-China — Farmers' Wingman

Drone-based cattle monitoring for a mountain summer pasture, down to the individual animal.

## Study area

The **Assy Plateau** (Ассы жайлауы), Enbekshikazakh District, Almaty Region — between the
**Turgen Gorge** to the north-west and the **Bartogai Reservoir** to the east, with the Assy River
running east across the plateau into the reservoir. A classic *jailau*: 1,900–2,700 m, grazed from
June to late September. The demo covers 6,987 ha divided into twelve grazing areas (**Area 1–12**)
carrying 1,320 cattle in four herds (**Herd 1–4**).

Everything runs against a **deterministic simulated season** — no backend, no API keys, no map
tiles. Reload gives the same season every time.

The season runs from its start date in the database **up to today, never past it**: a monitoring
system is a log of what has been flown, not a forecast. Opening the app on 29 July 2026 shows a
season two months old and still running, with this morning's flight as the last one.

## Run it

**On the web:** the app is published with GitHub Pages from the [`docs/`](docs) folder —
**https://paolo-medei.github.io/ELEVATE-China/**

**No install:** open `FarmersWingman.html` — a single self-contained file in this repo. Double-click it
and it runs in any browser, offline. Everything is inlined: the interface, the simulated season, the
map. Nothing is fetched from the network.

**From source:**

```bash
npm install
npm run dev         # http://localhost:5173
npm run build       # type-check + production bundle into dist/
npm run standalone  # rebuild FarmersWingman.html + farm.json, the downloadable pair
npm run make-farm   # regenerate src/data/farm.json from the model defaults
npm run make-xlsx   # rebuild farm-data.xlsx (add `-- season` for the whole season to date)
```

## Changing the data — in Excel

Every count, position, chart, alert and colour on screen is calculated from **one small database**.
Nothing else is stored. Change a value and the whole interface changes with it — and the way to
change it is a spreadsheet.

**In the app:** **Data** in the top bar → **Get the Excel file** → open `farm-data.xlsx` in Excel (or
Numbers, or LibreOffice) → change any cell → save → **Load your Excel file**. The page recomputes the
season from what you saved. **Back to the original data** undoes everything, and a badge in the
header shows when your own data is in force.

The workbook has eleven sheets in two halves. **Settings** are the handful of knobs a season is
generated from:

| Sheet | One row per | Try changing |
|---|---|---|
| **Farm** | setting, as label + value | *Season length*, the wind limits, *Grass on best pasture*, *Map layout number* (redraws every fence line), and how many animals get flagged per day |
| **Areas** | grazing area, with its grass type `meadow` / `typical` / `sandy` | make an area `sandy` — its Green Index falls and it heads for its grazing limit |
| **Herds** | herd: cattle, which areas it grazes, days in each, where the cycle starts | *Cattle*, or `2, 6, 10` in *Grazes areas* — naming the same area twice, as `5, 1, 5, 9` does, sends the herd back to it twice a round |
| **Animals to watch** | animal flagged by hand: *Lost* / *Needs attention* / *Drifted from the group* / *Health check*, from a day, for a number of days | add a row with a cow ID like `2-050`, the day it started and how long it lasts |
| **Weather** | day: rain, temperature, wind | set a wind above 11 m/s and that day's flight is grounded, the count carries over, and the alert follows |

**Records** are what the drone measured — the bulk of the file:

| Sheet | One row per | Rows | Read back? |
|---|---|---|---|
| **Cow positions** | animal, on every flight: latitude, longitude, ground height, area, seen yes/no, confidence %, metres from the herd, kilometres walked, hours still, flags | ~36,000 for a fortnight; the whole season to date is a quarter of a million | **yes** |
| **Grassland** | area, on every day: green index, standing grass kg/ha, grass eaten %, rest days, cattle per hectare, grazed hours, health score | 12 × days | **yes** |
| **Counts** | herd, on every counting flight: on the books, counted, missing, confidence, flagged | 4 × days | **yes** |
| **Herd days** | herd, on every day: kilometres walked and hours grazing / chewing / resting / walking / drinking, ground used, spread, water visits | 4 × days | no |
| **Flights** | mission: status, minutes, hectares flown, images, battery, wind, temperature, areas covered | 2 × days | no |
| **Area boundaries** | fence corner: latitude, longitude, height | 96 | no |

Add or delete rows freely — herds, areas, flagged animals and every record are read from whatever
rows are there. A sheet you leave alone keeps its current values, and a value that cannot work is
refused with the sheet and row that caused it (*"Areas row 4: 'concrete' is not a grass type"*),
leaving the current data untouched.

### Who gets flagged, and for how long

An incident has an end as well as a beginning. A cow that drifts off and stops moving is found on the
next round; a lame animal is treated. Flagging the same two animals every day for a whole season is
what a broken system looks like — so incidents open day by day from the three rates on the **Farm**
sheet, each lasts a few days, and closes. Today's list is never yesterday's. The **Animals to watch**
sheet is for naming a particular animal on a particular day on top of that.

That includes an animal the count cannot find. It misses the morning count, misses it again, someone
rides out, and it is back: two or three mornings, not a month. An animal reported unseen for
twenty-five days is not a monitoring system — it is a farm that has stopped looking.

Where two sheets speak about the same thing, **the finer record wins**: per-animal rows settle the
herd count, so the dashboard can never say a herd is complete while the map shows forty animals it
did not see.

Worked examples, all measured on the standalone file:

- mark 40 animals of Herd 2 *Seen = no* on the last flight → *cattle detected* 1,319 → 1,279, and the
  warning panel reads *"Herd 2 · 40 missing of 355"*
- move one animal's latitude and longitude → that dot moves on the map, with its new GPS in its record
- drop an area's green index to 0.05 → farm greenness falls with it, and that area reads *grazed too hard*
- cut Herd 1 from 405 to 150 cattle → registered total 1,320 → 1,065 on every screen
- set one day's wind to 14.2 m/s → *last drone flight* falls back to the day before

**Size.** The animal record defaults to the **last 14 days** — about 36,000 rows and 2.6 MB. *Whole
season to date* grows with the season: at its full 120 days it is 303,600 rows and 21 MB, roughly
half a minute to build and a minute to load back. Records are kept in IndexedDB rather than
localStorage, so there is no storage ceiling.

**Under the bonnet** the settings live in [`farm.json`](farm.json) (working copy:
`src/data/farm.json`) and the records are generated from them; a loaded workbook puts its settings
in localStorage and its records in IndexedDB. *Data → For developers* downloads and loads the
settings JSON directly.

## Publishing it

`npm run standalone` writes [`docs/`](docs) — `index.html` (the whole app in one file), `farm.json`,
`farm-data.xlsx`, and a `.nojekyll` marker. That folder is what GitHub Pages serves, so publishing is
three settings and no build step:

1. **Settings → General → Danger Zone → Change repository visibility → Public.**
   Pages on a private repository needs a paid plan; public is free.
2. **Settings → Pages → Source: *Deploy from a branch*** → branch **`main`**, folder **`/docs`** → Save.
3. Wait a minute, then open **https://paolo-medei.github.io/ELEVATE-China/**.

The site is the app itself: the whole interface, the season, and the map, with nothing fetched from
the network. `farm.json` and `farm-data.xlsx` sit next to it, so
`…github.io/ELEVATE-China/farm-data.xlsx` downloads the spreadsheet directly.

To update the published site, run `npm run standalone` and commit `docs/` — Pages redeploys on push.

## The three screens

### 1 · Today

Opens with a **warning panel**: how many cattle are missing from each herd, and the animals that
need a person today — away from the group and barely moving — each with its GPS position.

Below it, the four indicators that decide the day: **cattle detected / total**, **last drone
flight**, **average distance walked**, and the **Green Index** with how many areas have run out of
grass.

Then the **herd map** over the plateau terrain: ridges, the Turgen gorge, the Assy river, the
Bartogai reservoir and the track up from Turgen. Grazing areas are coloured by how much grass they
have left: nine within their limit, **Areas 6 and 8 grazed hard**, and **Area 5 grazed past its
limit**. Switch between **All herds** and any
single herd: all-herds shows one marker per herd, a single herd zooms in and draws **every animal**,
coloured by detection confidence. Flagged animals are always circled and labelled, whatever the
zoom. Click any animal for its record: ID, GPS, ground height, last seen, distance walked, time
standing still, distance from its group.

**Only animals to check** strips the map back to the animals with something against their name —
seven dots instead of thirteen hundred — and draws them larger, without changing where the map is
framed.

Then **what to do today** — the jobs, each with coordinates — and a detail card per herd.

Jobs are **one errand per line**. Two findings that send someone on the same trip are one job: an
animal down in the grass and one walking oddly in the same herd read as *"Check 3 cows in Herd 1 —
Area 6"*, not as a red line and an amber line saying almost the same thing. Herds that came up one or
two short this morning collapse into a single *"Recount 3 herds on tomorrow's flight"*, and strays
from any number of herds into a single *"Bring 2 cows back to their herds"*. A duplicate line is a
list that gets ignored.

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

Four things the demo is careful about, because each would cost a farmer a wasted day — or, worse,
teach them to ignore the screen:

1. **A short flight is not a missing cow.** Above the launch limit the fleet stays down and above the
   full-round limit it flies a shorter route; on either morning the herd panel says *count not
   finished*, the history chart shows a gap rather than a spike, and the card says the gap is about
   the wind rather than the cattle.
2. **Ordinary occlusion is not a missing cow either.** Which animals are hidden changes every day. An
   animal absent from **two counts running** is worth the ride out, and that is where the search job
   appears — not after a fortnight. Nothing here reports an animal unseen for weeks, because no
   working operation would let that happen.
3. **Away from the herd *and* not moving** is the combination that gets an animal flagged as urgent —
   either signal alone is normal behaviour. And "not moving" is measured against the herd's own day:
   on a hot afternoon the whole mob lies up for sixteen hours, and an absolute threshold would flag a
   quarter of them every time.
4. **One errand, one line.** Findings that send the same person to the same place are one job.
5. **"Grazed too hard" is not "out of grass".** An area past its seasonal allowance still looks green
   — that is exactly the trap the measure exists to catch, and the card says so rather than claiming
   the paddock is bare.

Three of the twelve areas are stony ground, and the camps lean on them: two herds return to their
poorest paddock twice in every round. By late July that has put **Area 5 past its limit and Areas 6
and 8 close to it**, while the nine meadow and typical areas are fine. It is the ordinary way a
rotation goes wrong, and it is what the grass side of the app is for.

## Project layout

```
farm.json      the input database, next to FarmersWingman.html
src/
  data/        farm.json (settings), source.ts (loads them), store.ts (IndexedDB for the
               records), records.ts (measurements that override the model),
               workbookLayout.ts + recordSheets.ts (the Excel layout), workbook.ts
               (reads a workbook back), ranch.ts (geography & herds), simulate.ts
               (the season), animals.ts (individual animals)
  lib/         seeded PRNG, geometry, area status rules, the issue builder, formatting
  components/  HerdMap (terrain + animals), DataPanel (the data drawer), chart kit, UI atoms
  views/       TodayView · AlertsView · HistoryView
  i18n.tsx     EN/中文 dictionary, language + theme context
scripts/
  make-farm.ts     regenerates src/data/farm.json
  make-xlsx.ts     regenerates farm-data.xlsx
  standalone.mjs   inlines the build into FarmersWingman.html
```

## On a phone

The layout is built for a hand as well as a desk. Below 760 px the top bar splits in two — brand and
controls on one row, the three tabs full width on the next — the key figures pair up two to a row,
the grass legend drops out of the map and becomes a strip beneath it, the data drawer becomes a sheet
at the foot of the screen, and every control is at least 36 px tall. Map labels and chart axes are
set in SVG user units, so they are drawn nearly twice as large on a narrow screen to land back at a
readable size once the drawing is scaled down. Checked at 360, 390, 430, 768, 844 and 1024 px wide,
in portrait and landscape: no horizontal scrolling anywhere.

> Demonstration dataset. The herds, flights and weather are simulated; the geography, the model
> structure and the alert thresholds are the parts meant to be reviewed.
