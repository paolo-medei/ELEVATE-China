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
npm run standalone  # rebuild PastureWatch.html, the downloadable single file
```

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
src/
  data/        plateau geography & herds (ranch.ts), season simulation (simulate.ts),
               individual animals (animals.ts)
  lib/         seeded PRNG, geometry, area status rules, the issue builder, formatting
  components/  HerdMap (terrain + animals), chart kit, UI atoms
  views/       TodayView · AlertsView · HistoryView
  i18n.tsx     EN/中文 dictionary, language + theme context
```

> Demonstration dataset. The herds, flights and weather are simulated; the geography, the model
> structure and the alert thresholds are the parts meant to be reviewed.
