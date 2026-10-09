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
| **Party** | Head count, kids, mobility, diet. Drives pace and what is off the table. When people join from different countries, get **each traveller's passport nationality, country of residence, and immigration status there** — these three are independent, and each one changes the paperwork. Someone flying from New York is not necessarily travelling on a US passport. |
| **Budget** | Total or per person per day. Anchors lodging, dining and car class. |
| **Pace & interests** | Packed vs. slow; food, hiking, photography, museums. For hikers, the **difficulty ceiling** (e.g. "nothing rated Hard") and whether heavy days should alternate with light ones. |

Also collect the **fixed points** the plan must be built around. Things already booked are anchors, not suggestions:

- Flights (numbers and times), lodging (addresses and number of nights), rental car (pick-up and return time and place)
- Visa or entry validity windows. A visa valid only for certain dates fixes those days: flexibility has to come from inside the trip, not by shifting it.
- Home country, which decides customs rules on the way back, temperature units and the drive to the airport.
- **The return leg.** Getting home can be harder than getting in. A traveller living abroad on a
  work or study permit usually needs an unexpired entry visa in the passport to be re-admitted,
  and the approval notice is not a substitute for it. Re-issuing one normally means a consulate
  in their country of citizenship and months of lead time, and there is no safe way to do it
  mid-trip — a refusal or an administrative hold abroad can leave them unable to go home. Raise
  this in the first round of questions, not the last: it takes longer to fix than the trip takes
  to plan, and it decides whether they can come at all.

Two more questions pay for themselves:

- **"Have you been before — what did you learn?"** A returning traveller carries rules no guide
  prints: don't walk on the turf, the shops all shut on Sunday, pull into the passing bay when a
  car comes the other way in the one-lane tunnel. Collect those and give them their own section,
  in their words. It is the one part of the plan you could not have researched.
- **"What do you need every single day?"** Coffee, a medication, contact lens solution, formula,
  a diet. A daily dependency that fails degrades every day of the trip, not one of them, so it
  earns its own section rather than one line in the packing list.

Ask for what is missing with **`AskUserQuestion`**, batched into one call, with concrete
options and trade-offs. Do not block on optional things. Decide, state your assumptions
in one line at the top, and draft. **Anything the user already told you is settled.**

### Step 2 — Research what is true for these dates

Training knowledge is fine for "the Louvre is in Paris". It is unreliable for anything
that changes by season or by year. With web search available, look these up. Without
it, say at the top of the plan that they need checking.

- **Entry and exit rules, for every passport in the party.** Look them up; never answer from
  memory. Visa policy changes by decree with weeks of notice, so a requirement you are confident
  about may have been abolished — or introduced — since your training data. For each traveller
  record whether a visa is needed at all, the fee, the maximum stay, the passport validity
  demanded, and **what the return leg needs**. Note the date you checked, and tell the user to
  re-check once before booking and again before departure: for a trip more than a few months
  out, today's rule is a planning assumption, not a fact about their travel date.
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
- **Opening hours by weekday.** First **derive the weekday of every trip date with code**, never in
  your head, and print the date → weekday table before drafting anything. This is cheap, and
  getting it wrong silently invalidates every closure decision that follows — the schedule looks
  carefully reasoned and sends them to a locked door. Then check each venue against that table:
  the weekly closing day (Monday for many museums, Tuesday for others), Sunday closures, the
  religious day when a site shuts for midday prayers, seasonal closures, and "hours not
  published → call first" (put the phone number in).
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
7. **What to wear** (altitude, temperature, wind chill, layers) and **what to shoot** (spot, time,
   light direction) — and treat those as one problem, not two. Dressing for the conditions and
   dressing to be photographed pull against each other, and on a trip people are partly taking
   for the pictures, "wear everything you own" is advice they will quietly ignore at the
   viewpoint. Resolve it instead: cinch the shell hem to get a waist back, unzip to show one
   colour underneath, shoot first and put the layers on after. Choose the wardrobe against **the
   destination's own background** — black vanishes into basalt and wet turf, while a teal shell
   reads against both that and pale limestone. One warm accessory in the complementary hue lifts
   every frame; a second bright colour kills it. A scarf is the lightest costume change there is,
   and it keeps two weeks of photographs from looking like one afternoon.
8. **Where you sleep**.

Rules that keep a plan usable:

- **Geographic clustering beats a ranked list.** A day should flow in one direction, with no
  crossing the region twice.
- **Closure days decide the running order.** With the date → weekday table in hand, place the
  venues that are shut on one of those weekdays *first*, then build each day's theme around
  them. A closure found after the days are themed forces a rewrite; a closure used as a
  constraint writes the schedule for you. Record in the plan which day was placed because of
  what ("the covered market is here because it shuts on Sunday"), so the user can re-derive it
  if the dates move.
- **Anchor each day, then fill.** One or two anchors, flexible filler, and real gaps.
- **Intensity rhythm.** Only one or two "heavy" days in the whole trip. Put a light day before and after
  each one. Never schedule two 3-hour-plus days back to back. Show the rhythm as a small chart.
- **The timetable must agree with itself.** The recommended hike must fit that day's blocks.
  The time you allow must include photo stops. The latest turnaround time plus the walk back must end before dark, or
  the plan must say "twilight until HH:MM, bring a headlamp".
- **Weather-dependent headline activities need attempts, not nights.** For the thing the trip is
  really for — a balloon lift-off, a sunrise summit, an aurora night, a small-boat crossing —
  what counts is **how many mornings they get to try**, not how long they stay. Look up the
  cancellation rate for that month and stay long enough for two attempts, three if it is worse
  than about one in five. Name the windows explicitly ("three nights here = three chances, on
  these mornings"), and give each attempt day a shape that works whether or not it goes ahead.
- **Count usable days, not calendar days.** Subtract the travel day at each end and count a
  long-haul arrival as half. Give the user that number whenever you propose or defend a length
  ("nine days is six usable"). It turns "does this feel too long?" into arithmetic they can
  check, and it exposes the padding — a half day stranded between a hotel checkout and an
  afternoon flight is the weakest slot in any itinerary, and usually the one to cut.
- **First and last days are travel days.** Keep them light. Don't schedule hikes on a red-eye
  arrival or a tight-connection day.
- **Where dress or conduct gates entry** — mosques, temples, churches, a few restaurants — the
  requirement belongs in the packing list *and* in that day's wear note, not only in a note
  somewhere. Someone who reads only the packing tab still has to arrive dressed to get in.
- **Tight connections.** Compare each connection with the check-in and bag-drop cut-offs.
  If the cut-off equals the landing time, bags must be checked through to the final destination, and that becomes an
  urgent to-do.
- **Airport timings run backwards.** Never write "get there three hours early". Work back from the
  airline's own cut-offs to the time they leave the house: bag drop closes 60 minutes out, online
  check-in 90, the drive is 1–1.5 hours and it is rush hour — so the line in the day reads "leave
  at 14:30". That number is different for every airport, airline and origin, and it is the only
  one they can act on.
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
  Add one more group — **check every day while travelling** — holding the few sources that go
  stale daily once they are on the road: the mountain-pass or road-status page, the ferry
  timetable, the *local* weather service rather than a global app, today's sunrise and sunset,
  lift operations. Give the link itself, not an instruction to go and search for it.
- **Packing**: grouped by category and tagged *carry-on / checked / wear on the plane*. The carry-on has to
  survive a day of delayed bags. Power banks go in the carry-on only, trekking poles in checked bags only. Note the airline's carry-on
  weight limits.
- **Photos**: spots by day, with when to go, where to stand, composition and light, plus links to guides with
  real example photos.
- **Reference**:
  - documents
  - flights and airport cut-offs
  - **budget**, split per car and per person, with the exchange rate. As bookings land it has to
    become **what is still to pay** — flights, lodging and visa fees drop out of the total once
    they are paid, the same way a booked item moves to ✓ booked — because the number the user
    actually needs is the one still due to leave their account. Say how each figure was obtained
    (official price, live quote, industry range) and **name what it excludes**: insurance
    top-ups, fines, incidentals. An unqualified total is the one quoted back at you when it
    turns out to have been low.
  - **where you can save**: each lever with both sides — what it saves and what it costs — tied
    to the day it applies to ("the bridge instead of the tunnel is 15 minutes longer and €23
    cheaper, but that is the morning of the 08:30 ferry, so you leave at 07:00 in the dark")
  - **what you learned last time**, if they have been to this place before, in their own words
  - any **daily dependency**: which product, where to buy it, the one moment in the itinerary
    where it fits without a detour, and how to get it home. Branch on their actual setup rather
    than giving generic advice — the right coffee to buy depends on whether there is an espresso
    machine, a moka pot or only a capsule machine waiting at home.
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
  renderer (escape everything, then re-enable only those tags) — and **the re-enabling step has
  to match what escaping actually produced**. After escaping, the string holds `&lt;b&gt;`, so a
  rule that searches for `<b>` matches nothing, quietly does nothing, and the reader sees a
  literal `</b>` on every line. Re-enable from the escaped form, or — since this copy is yours
  rather than user input — don't escape it at all and pass the trusted string straight through.
  Either way, render one day and grep the output for literal tags before publishing; an
  allowlist renderer that looks right is not the same as one that works.
- **Privacy.** If the page is shared by link, keep booking codes and confirmation numbers off
  it ("booking code is in the confirmation email"). Put them only in a private companion file.
- **Phone first.** No horizontal scroll at 390 px; long labels on the daylight bar flip to the
  left near the right edge, and a label wider than its own block is dropped rather than left to
  spill over its neighbours.
- **Map scale.** Fit the view to that day's own stops. When one stop sits far from a tight cluster
  of the others, the cluster collapses into an unreadable blob — draw a second zoomed inset of
  the cluster, numbered continuously with the main map, instead of zooming out until nothing is
  legible.
- **Take the palette from the destination, not from a reference page.** When the user points at an
  itinerary they admire, copy its structure, density and rigour — never its colours or mood. A
  scheme built for cold northern mountains reads wrong over warm southern light, and the tell is
  that the body copy keeps naming colours the page does not have: golds, roses and cobalt
  described in the prose, over a slate-grey ground. To derive one instead, name **two or three
  physical materials** from the places themselves — a glaze, a stone, a roof tile, the colour of
  the light at the hour they will actually be standing there — and pull the tokens from those.
  "Warm" is not a source; a named tile glaze is. On a trip through visibly different regions, let
  the regions own different accents, and shift the page surface itself a shade between them, so
  moving from one leg to the next feels like the light changing.
- **Check the contrast numerically, because this page is read outdoors.** An itinerary gets used on
  a phone, at arm's length, in direct sun, by someone who is late and one-handed. Compute the
  ratio of every text token against the surface behind it and clear 4.5:1 for anything small.
  The caption greys and the mono labels are where a good-looking palette quietly fails — and
  they are exactly the ones carrying departure times, platform numbers and prices. Fix a failure
  by darkening the token, not by enlarging the text. A dark theme is a legitimate choice, but
  choose it for the destination, not by inheriting it, and never at the cost of these ratios.
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
- **Keep corrections visible.** When a researched claim turns out to be wrong, don't just quietly
  fix it — say so in place ("this previously said you could drive to the mid-station; there is no
  road"). They may have already read the wrong version, planned around it, or repeated it to the
  people coming with them. A silent fix leaves all of that standing.
- **Answer a voiced worry by name.** When the user says out loud that they are unsure — is it too
  late in the season, will it be too crowded, is this too many days — give that doubt its own
  heading, in their words, and answer it there with the evidence. Reassurance folded into a note
  somewhere reads as having been dodged.
- **Restructure by moving data, not by retyping it.** When days get split, merged, reordered or
  added, parse the itinerary data, move whole day and block objects between days, then serialise
  it back. Reshaping a schedule by writing it out again is how carefully researched paragraphs
  get quietly shortened — the structure comes out right and nobody notices the substance
  thinned, least of all you.
- **Detail the user has praised is a constraint, not a draft.** Restyling, re-theming or adopting
  a layout the user admired must not cost them content they already valued. If they say
  something has gone missing, recover it from the earlier version — transcripts and previously
  published versions are both readable — rather than rewriting it from memory, which produces
  something shorter and subtly different while claiming to be a restoration.
- When the user reports that something "didn't update" or "can't be clicked", check first
  whether they are looking at the right artifact, then read the live version and its
  stored data before changing code.

## Scope

This skill plans. It does not book, pay, or hold reservations, and it has no live
availability. It lists what to book, which slot and by when.

It does not help build itineraries or bookings meant to mislead a visa application or
border officers, for example a plan for the application that differs from the real trip. It
does not estimate the odds of being caught. Visa documents must match the real trip.
