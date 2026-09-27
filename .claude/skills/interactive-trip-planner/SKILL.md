---
name: interactive-trip-planner
description: Plan a trip interactively and publish it as a browsable itinerary. Use when the user wants to plan a trip, build or revise a travel itinerary, organize a vacation, road trip or hiking trip, work out what to do each day, or turn a pile of saved places into a day-by-day plan. Gathers the brief and fixed bookings, verifies seasonal openings, daylight and drive times, and publishes an interactive Artifact with timed days, tiered hikes, a map, shared to-do and packing checklists, and a budget.
---

# Interactive Trip Planner

Turn a vague "I want to go to X" into a concrete, day-by-day itinerary the user can
open on their phone, tick off as they go, and share with the people travelling with them.

The word that matters is **interactive**: this is a conversation, not a one-shot dump.
Ask, draft, show, revise. A plan the user pushed back on twice is worth more than a
polished one they never looked at. Expect the trip to be revised many times over weeks,
often across sessions. Design everything so it can be updated in place.

**Reply in the user's language for the whole conversation**, including short status
lines after tool calls. If they write Chinese, never drift into English.

## The loop

1. **Gather the brief and the fixed points.**
2. **Research what is true for these dates.** Check openings, daylight, drive times and reservations.
3. **Draft the itinerary**, day by day, using the data model below.
4. **Publish it** as an Artifact.
5. **Verify** it: numbers, rendering, checklists.
6. **Revise** on feedback, republishing to the same URL.

### Step 1 — Gather the brief and the fixed points

Five things are load-bearing:

| Field | Why it matters |
|---|---|
| **Destination** | City or region. "Japan" is too broad; narrow it to cities or areas and how they connect. |
| **Dates** | Exact dates drive seasonality, daylight, day-of-week hours and DST changes. |
| **Party** | Head count, kids, mobility, diet. Drives pace and what is off the table. |
| **Budget** | Total or per person per day. Anchors lodging, dining and car class. |
| **Pace & interests** | Packed vs. slow; food, hiking, photography, museums. For hikers, the **difficulty ceiling** (e.g. "nothing rated Hard") and whether heavy days should alternate with light ones. |

Also collect the **fixed points** the plan must be built around. Things already booked are anchors, not suggestions:

- Flights (numbers and times), lodging (addresses and number of nights), rental car (pick-up and return time and place)
- Visa or entry validity windows. A visa valid only for certain dates fixes those days: flexibility has to come from inside the trip, not by shifting it.
- Home country, which decides customs rules on the way back, temperature units and the drive to the airport.

Ask for what is missing with **`AskUserQuestion`**, batched into one call, with concrete
options and trade-offs. Do not block on optional things. Decide, state your assumptions
in one line at the top, and draft. **Anything the user already told you is settled.**

### Step 2 — Research what is true for these dates

Training knowledge is fine for "the Louvre is in Paris". It is unreliable for anything
that changes by season or by year. With web search available, look these up. Without
it, say at the top of the plan that they need checking.

- **Seasonal operations.** Lifts and cable cars, mountain huts, seasonal buses, toll roads and
  ferries often close in the shoulder season, and the dates change every year. Record the actual
  last operating date and the source. If you can't find it, write "not found — assume closed".
  Plan around what is open. In the mountains, for example, lifts may still run while huts are already shut.
- **Reservation mechanics.** For timed tickets, reserved roads, ferries and parking, write down:
  - when booking opens and whether it sells out
  - which slot to pick and why (see "Choosing a slot" below)
  - when validity starts. Is it the booked time or actual entry?
  - whether it can be changed or only cancelled and rebooked
  - the free-cancellation deadline
  - whether a licence plate is required, and when and how often it can be changed
- **Daylight.** Compute sunrise and sunset for each day and place, for example with the Python `astral`
  library, plus civil dusk where people may be out late. Flag the DST change day and
  write it into that day ("clocks go back tonight; sunset is now 17:07").
- **Drive times** come from road routing (e.g. OSRM), not straight-line distance.
  Mountain valleys and islands can be far apart by road even when they look close on a map.
- **Timetables by weekday.** Read ferry and bus tables column by column. Do not take a
  Sunday departure for a Saturday one.
- **Opening hours by weekday.** Watch for Sunday and Monday closures, venues closing for the season,
  and "hours not published → call first" (put the phone number in).
- **Hikes.** For each route, give difficulty, distance, elevation gain, duration, loop or out-and-back,
  and a source with its rating and review count (e.g. "AllTrails 4.8★ (8,555)", or the official tourism board). When sources
  disagree, show the range and say which one you are planning on. A route rated Hard in
  one version is often Medium if you turn back at the viewpoint. Say that explicitly.
- **Customs on the way home.** Say what can and cannot be brought back, using the official
  wording (e.g. cured pork from Italy is banned in the US; hard cheese is fine).

**Never invent an address, phone number, coordinate, price or opening date.** Omit it
or write "to confirm". A confidently wrong fact is the one failure that ruins a trip day.

#### Choosing a slot

The best slot is usually **the earliest one that is actually usable**. A slot before the
road, lift or venue opens wastes validity. For a 12-hour pass, check that the slot plus
12 hours covers the day, including the closing time. Late arrival within validity is
usually fine; early entry usually is not. Give a fallback slot if the first choice sells out.

### Step 3 — Draft the itinerary

Hold the plan in the shape of `references/itinerary-schema.json`. Each day has these parts, leaving out any that don't apply:

1. **Sunrise and sunset**, plus a **daylight bar** with activity blocks and any **hard cut-off**
   ("start descending by 15:40", "turn back by 16:00").
2. **Today's drives**: each leg in km and minutes. The day total must equal the sum of
   the legs *as displayed*, so round each leg first, then add.
3. **Timed blocks**: time, title, and what exactly to do. That means where to park (named lot, price),
   which lift, which ticket slot. Book-ahead items get a visible tag.
4. **Notes**: booking warnings, closure risk, Plan B.
5. **Hikes, in tiers**: *Recommended / Lighter / Stretch / Not advised*, each with stats,
   source and a one-line reason. "Not advised" is useful: it stops the user from
   picking the dangerous or impossible option on the day.
6. **Meals**: lunch, dinner, and **shopping** when the next day is a Sunday or a remote area.
7. **What to wear** (altitude, temperature, wind chill, layers) and **what to shoot** (spot, time, light direction).
8. **Where you sleep**.

Rules that keep a plan usable:

- **Geographic clustering beats a ranked list.** A day should flow in one direction, with no
  crossing the region twice.
- **Anchor each day, then fill.** One or two anchors, flexible filler, and real gaps.
- **Intensity rhythm.** Only one or two "heavy" days in the whole trip. Put a light day before and after
  each one. Never schedule two 3-hour-plus days back to back. Show the rhythm as a small chart.
- **The timetable must agree with itself.** The recommended hike must fit that day's blocks.
  The time you allow must include photo stops. The latest turnaround time plus the walk back must end before dark, or
  the plan must say "twilight until HH:MM, bring a headlamp".
- **First and last days are travel days.** Keep them light. Don't schedule hikes on a red-eye
  arrival or a tight-connection day.
- **Tight connections.** Compare each connection with the check-in and bag-drop cut-offs.
  If the cut-off equals the landing time, bags must be checked through to the final destination, and that becomes an
  urgent to-do.
- **Laundry.** On two-night stays, schedule laundry on the first evening as a timed block
  in the timeline, not just a note. That way the clothes are dry before you leave.
- **Match the party.** Kids and mobility needs shorten days and remove exposed trails.

### Step 4 — Publish as an Artifact

**Load `artifact-design` before writing the page**, and `artifact-capabilities` before
adding checklists that save. Build one self-contained HTML page with five tabs:

- **Days**: a day picker plus the day panel described above, and a small inline-SVG map of the day's
  stops and route. A mapping library would be blocked by the artifact CSP.
- **To-do**: grouped by urgency. The groups are ★ this week, within 2 weeks, 1–2 weeks before, the week before,
  2–3 days before, the day before, on the day, and ✓ booked. Each item says *why* it is urgent and
  exactly what to ask or check. When something gets booked, move it to ✓ booked and keep the key details (time, validity) and
  **only what is left to do** ("change the licence plate by 10/24 23:59").
- **Packing**: grouped by category and tagged *carry-on / checked / wear on the plane*. The carry-on has to
  survive a day of delayed bags. Power banks go in the carry-on only, trekking poles in checked bags only. Note the airline's carry-on
  weight limits.
- **Photos**: spots by day, with when to go, where to stand, composition and light, plus links to guides with
  real example photos.
- **Reference**:
  - documents
  - flights and airport cut-offs
  - **budget**, split per car and per person, with the exchange rate and a note on how reliable each number is
  - **lifts & parking** (named lots, coordinates, prices)
  - **what's closed this season**
  - layering guide
  - local food
  - restaurant hours
  - souvenirs
  - what you can't bring home

Implementation rules learned the hard way:

- **Shared checklists** (`db` capability, e.g. `state/checklist`, `state/packing`) are shared by
  everyone on the trip. **Read the saved state before any write, and never write before
  that read completes.** Clicks made while loading are merged into the loaded state and
  then saved. Otherwise one early tap overwrites everything already ticked.
- **Escaping.** Content strings that contain `<b>`, `<i>` or `<br>` must go through an allowlist
  renderer (escape everything, then re-enable only those tags). Never pass them through plain escaping, or
  the user sees literal `</b>` on the page.
- **Privacy.** If the page is shared by link, keep booking codes and confirmation numbers off
  it ("booking code is in the confirmation email"). Put them only in a private companion file.
- **Phone first.** No horizontal scroll at 390 px; long labels on the daylight bar flip to the
  left near the right edge.
- Give the artifact a real name ("Dolomites to the Faroes"), not "Trip Itinerary".

If the user also wants a document to print or keep offline (Word/PDF), build it from the
same data and **keep it in sync**: every change goes into both, and both get delivered.

### Step 5 — Verify before telling the user it's done

1. Extract the `<script>` blocks and run `node --check`.
2. Render every day and every tab in a headless browser. The count of visible literal tags
   (`<b>`, `</b>` …) must be **0**.
3. No horizontal overflow at 390 px and 860 px.
4. Checklist test with mocked storage: tick → still ticked after reload. With a slow load,
   an early tick must not wipe the saved ticks.
5. The numbers agree: sunsets across day, notes and photo tab; drive totals equal the sum of legs;
   budget subtotals equal the sum of items; the page and the companion file match. Watch
   rounding (Python's `round()` is banker's rounding).
6. After a large change, have an independent agent that hasn't seen the drafting
   check the timetable logic and the numbers.

### Step 6 — Revise

- **Always republish to the same artifact URL.** After a context reset or in a new session,
  pass the existing artifact `url` explicitly. Publishing the file without it creates a
  duplicate page with a new link. If a duplicate slips out, tell the user and offer to delete it.
- Apply changes as small, checkable patches (find-exact-string → replace, fail loudly if
  not found) rather than rewriting the page.
- When the user reports that something "didn't update" or "can't be clicked", check first
  whether they are looking at the right artifact, then read the live version and its
  stored data before changing code.

## Scope

This skill plans. It does not book, pay, or hold reservations, and it has no live
availability. It lists what to book, which slot and by when.

It does not help build itineraries or bookings meant to mislead a visa application or
border officers, for example a plan for the application that differs from the real trip. It
does not estimate the odds of being caught. Visa documents must match the real trip.
