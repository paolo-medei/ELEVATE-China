# ELEVATE-China — PastureWatch 牧眼

A demo web platform for **drone-based cattle detection on grazing land**, and for turning those
detections into decisions: where the herds are, how they are behaving, how hard each paddock is
being grazed, and whether the operation stays inside its grass–livestock balance quota.

Everything runs locally against a **deterministic simulated season** — no backend, no API keys, no
map tiles. Reload gives you the same season every time.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle into dist/
```

## The demo scenario

**Bayan Gol Demonstration Ranch · 巴彦郭勒示范牧场**, Xilingol League, Inner Mongolia.
6,987 ha split into 12 fenced areas across meadow, typical and sandy steppe; 1,755 head of
cattle in 4 herds. Areas and herds are named plainly — **Area 1–12**, **Herd 1–4** — so nothing has
to be memorised to read the screen. one warm-season grazing period, **1 June – 28 September 2026** (120 days).
Two drone sorties a day: a dawn muster count over the occupied paddocks, an evening sweep that
cycles through the resting ones.

Bilingual throughout (English / 中文) with light and dark themes — both switchable from the header.

## Two ways in

The app opens on **Today** — one screen that answers "is everything alright?" before it shows a
single chart: a plain-language headline, three tiles, a traffic-light map, a ranked to-do list, and only the
areas that need watching — the rest collapse into one line. Every item explains itself in a
sentence, and tapping a job reveals the reading behind it. No jargon, no charts to interpret.

Areas carry one of four states: **out of grass**, **nearly used up**, **plenty of grass**,
**resting**. The state is the colour on the map and the badge in the list; what to do about it is
the to-do list's job, so the same colour never has to mean two different actions.

**Full dashboard** switches to the four analyst views below, for when someone wants the numbers.

## The four detailed views

| View | Audience | What it answers |
|---|---|---|
| **Herd operations** 牛群作业 | the grazier | Where is every herd right now, are they all accounted for, how long did they graze, walk and drink, what needs attention today |
| **Grassland** 草场管理 | the grazing manager | How much forage is standing, how much has been taken, which paddocks need rest, is the rotation working |
| **Drone missions** 无人机任务 | the fleet operator | Did the missions fly, what did they cover, how good was detection, which paddocks are overdue for a look |
| **Governance** 监管与草畜平衡 | the county rangeland office | Is the ranch inside its approved stocking quota, is rest-rotation being respected, which findings are evidenced well enough to act on |

### Interactive map

The ranch map is drawn from generated paddock geometry — no tile server — with four data layers:

- **Grazing pressure** — a kernel-density surface of the last 7 days of tracked positions, weighted
  by head count and by whether the herd was grazing or just passing through.
- **Biomass** — standing crop as a share of each site's peak, on a sequential ramp.
- **Utilisation** — season offtake against the paddock's forage allowance, on a diverging ramp whose
  neutral midpoint is exactly "allowance fully used".
- **Rest days** — days since stock last left.

Herd markers are sized by head count, ringed by the tracked herd spread, and outlined in red when the
centroid leaves its assigned paddock. Day and hour scrub, or press play to watch a day unfold; trails
and the mission's lawnmower flight path can be toggled on.

## How the demo data is built

`src/data/simulate.ts` runs a small physical simulation rather than sampling pretty numbers. Every
figure on screen is derived from it, so the views stay consistent with each other.

- **Herd movement** — hourly steps per herd. Behaviour is drawn from a diurnal weight table
  (grazing peaks at dawn and late afternoon, ruminating and resting at night, watering around
  midday), warped by heat and rain: above 32 °C grazing shifts out of the middle of the day and into
  the night. Position follows the behaviour's target — a grazing patch, the nearest reachable water,
  or the bedding site — and is held inside the paddock's fence line except during scripted breaches.
- **Forage** — logistic regrowth against each site's peak standing crop, scaled by 7-day rainfall,
  by a seasonal growth curve that tails off from mid-August, and by senescence in late September.
  Offtake is animal units × intake. Utilisation is season-to-date offtake over the **allowable
  offtake**, and carrying capacity is derived from the same budget rather than asserted separately:
  `capacity = peak standing crop × allowable use ÷ (intake × season length)`.
- **Drone detections** — per-herd counts with an occlusion-driven miss rate (bunched herds, calves
  lying in tall grass, heat, shortened missions), plus welfare flags. Missions are grounded above
  11 m/s wind and shortened above 9 m/s, which is why some days have coverage gaps.
- **Alerts** — rules over the simulation output: count reconciliation against the herd book, fence
  breaches from the tracks themselves, forage-allowance thresholds, residual-biomass floors,
  rest-period violations, missed watering, and heat-suppressed grazing.

Two things the demo deliberately keeps separate, because conflating them is the classic mistake in
this kind of dashboard:

1. **"Not detected" vs "not surveyed".** The reconciliation chart plots detected head, head that were
   inside the flown area, and the registered herd book as three distinct lines. Missing animals are
   the first gap; coverage gaps are the second.
2. **Instantaneous vs season stocking.** Rotational grazing loads a paddock hard for days at a time,
   so the instantaneous stocking rate is not comparable to carrying capacity. Pressure is judged on
   the season-to-date mean, with rest days included.

## Design and accessibility

Charts are hand-rolled SVG (`src/components/charts.tsx`) — no chart library — so the mark specs are
under direct control: 2 px lines, ≥8 px hover markers with a surface ring, 4 px rounded data-ends,
2 px surface gaps between stacked segments, recessive grid, crosshair tooltips on every plot.

Colour follows a validated system: categorical slots for herds and behaviours, one-hue sequential
ramps for magnitude, a two-hue diverging ramp with a neutral midpoint for utilisation, and a reserved
status palette (good / warning / serious / critical) that always ships with an icon and a label so
severity is never carried by colour alone. Both themes were checked with the palette validator —
lightness band, chroma floor, CVD separation on adjacent pairs, and contrast against their own
surface. Sequential ramps run dark→light on the dark surface and light→dark on the light one, so
"near zero" always recedes toward the page.

## Project layout

```
src/
  data/        ranch geometry & herds (ranch.ts), the season simulation (simulate.ts), types
  lib/         seeded PRNG, geometry, derived metrics, formatting & CSV export
  components/  chart kit, ranch map, timeline scrubber, UI atoms
  views/       the four dashboards
  i18n.tsx     EN/中文 dictionary, language + theme context
```

Tables and CSV exports back every chart — the paddock condition table, the mission log, and the
compliance report all download as CSV for anyone who needs the numbers rather than the picture.

> Demonstration dataset. The ranch, herds, flights and weather are simulated; the model structure and
> the thresholds are the parts meant to be reviewed.
