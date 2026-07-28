# ELEVATE-China — PastureWatch 牧眼

A demo of **drone-based cattle detection on grazing land**, down to the individual animal.
Five screens, each answering one question in plain words:

| Screen | What it answers |
|---|---|
| **Today** | Are the cattle safe? Head count, last flight, a traffic light per herd, how far they walked, how green the grass is, and at most three jobs to do |
| **Herd map** | Where is every animal? A simulated satellite ground with **one dot per animal**, coloured by how sure the model is (green ≥95%, amber, red = not found). Pick a herd to zoom into the mob |
| **Animal record** | Cow ID, GPS position, ground height, when it was last seen, how far it walked, how long it stood still, how far it is from its group |
| **Alerts** | Every animal a person should look at: not found, away from the group, not moving enough, possibly sick — plus the whole-herd jobs |
| **Grass** | Vegetation index per area, how much of the season's grass has been eaten, and greenness through the season |
| **History** | Flights flown, shortened and grounded; cattle counted each day; how far each herd walked |

Bilingual (English / 中文), light and dark.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle into dist/
```

## The demo scenario

**Bayan Gol Demonstration Ranch · 巴彦郭勒示范牧场**, Xilingol League, Inner Mongolia. 6,987 ha in
12 fenced areas across meadow, typical and sandy steppe; 1,755 cattle in 4 herds; one warm-season
grazing period, **1 June – 28 September 2026**. Two drone sorties a day. Areas and herds are named
plainly — **Area 1–12**, **Herd 1–4** — so nothing has to be memorised.

Everything runs against a **deterministic simulated season**: no backend, no API keys, no map tiles.
Reload gives the same season every time. Use ← → to walk through the days.

## What the four colours mean

| Colour | Meaning |
|---|---|
| Red | **Out of grass** — this area has eaten through what it can spare this season |
| Amber | **Nearly used up** |
| Green | **Plenty of grass** |
| Grey | **Resting** — no stock on it |

The colour says *what is true*; the to-do list says *what to do about it*, so the same colour never
has to carry two different actions.

## How the demo data is built

`src/data/simulate.ts` runs a small simulation rather than sampling pretty numbers, so the screen
stays internally consistent:

- **Herd movement** — hourly steps per herd. Behaviour is drawn from a diurnal weight table (grazing
  peaks at dawn and late afternoon, watering around midday), warped by heat and rain, and positions
  are held inside the fence except during scripted breaches.
- **Forage** — logistic regrowth against each site's peak standing crop, scaled by 7-day rainfall and
  a seasonal growth curve that tails off in late summer. Carrying capacity is derived from the same
  forage budget as the "grass left" colour, not asserted separately.
- **Drone detections** — per-herd counts with an occlusion-driven miss rate. Missions are grounded
  above 11 m/s wind and shortened above 9 m/s.
- **Jobs** — `src/lib/status.ts` turns the alert rules into ranked, plain-language sentences.

Two things the screen refuses to confuse, because both would cost a farmer a wasted morning:

1. **A short flight is not a missing cow.** When wind cuts a mission short, the screen says *"the
   drone could not finish its round"* and asks for a recount, instead of reporting animals missing.
2. **Ordinary occlusion is not a missing cow either.** A herd is only reported short when it is more
   than 3% down — a couple of hidden animals per hundred is what the camera always misses.

## Project layout

```
src/
  data/        ranch geometry & herds (ranch.ts), the season simulation (simulate.ts), types
  lib/         seeded PRNG, geometry, plain-languagestatus rules (status.ts), formatting
  components/  the ranch map, chart kit, UI atoms
  views/       TodayView.tsx — the whole interface
  i18n.tsx     EN/中文 dictionary, language + theme context
```

The earlier analyst dashboards (herd operations, grassland, drone missions, governance) are still in
`src/views/` and in the git history, but nothing imports them, so they are not built into the app.
Re-mounting one is a single import in `App.tsx`.

> Demonstration dataset. The ranch, herds, flights and weather are simulated; the model structure and
> the thresholds are the parts meant to be reviewed.
