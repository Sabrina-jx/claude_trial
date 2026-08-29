---
name: interactive-trip-planner
description: Plan a trip interactively and publish it as a browsable itinerary. Use when the user wants to plan a trip, build or revise a travel itinerary, organize a vacation or weekend away, work out what to do each day in a city, or turn a pile of saved places into a day-by-day plan. Gathers the brief (destination, dates, party, budget, pace, interests), assembles lodging, dining and activities into per-day plans, and publishes an interactive Artifact with day tabs, a map and a running budget.
---

# Interactive Trip Planner

Turn a vague "I want to go to X" into a concrete, day-by-day itinerary the user can
open, read on their phone, and hand to the people travelling with them.

The word that matters is **interactive**: this is a conversation, not a one-shot dump.
Ask, draft, show, revise. A plan the user pushed back on twice is worth more than a
polished one they never looked at.

## The loop

1. **Gather the brief** — enough to plan, not an interrogation.
2. **Draft the itinerary** — day by day, using the data model below.
3. **Publish it** as an Artifact.
4. **Revise** on feedback, republishing to the same URL.

### Step 1 — Gather the brief

Five things are load-bearing. Without them the plan is guesswork:

| Field | Why it matters |
|---|---|
| **Destination** | City or region. "Japan" is too broad — narrow to cities and how they connect. |
| **Dates / duration** | Exact dates give weather, seasonality, and day-of-week opening hours. Duration alone is workable. |
| **Party** | Number of people, and whether it includes kids, elderly travellers, or anyone with mobility or dietary needs. Drives `age_range` and pace. |
| **Budget** | Total, or per-person per-day. Anchors the `price` tier of restaurants and `num_stars` of lodging. |
| **Pace & interests** | Packed vs. slow. Food, museums, hiking, nightlife, shopping, kids' stuff. |

Ask for what is missing with **`AskUserQuestion`**, batching the questions into one
call rather than dribbling them out one per turn. Offer concrete options with
trade-offs ("Relaxed: 2–3 anchors a day" vs. "Packed: 5–6") — most people answer a
menu far more readily than a blank prompt.

Do not block on the optional stuff. If the user gives you a destination and a rough
duration and says "you decide the rest", **decide the rest**, state your assumptions
in one line at the top of the plan, and get to a draft. A concrete draft is easier to
correct than an abstract question is to answer.

**Anything the user already told you is settled.** Re-asking is the fastest way to
make this feel like a form instead of a planner.

### Step 2 — Draft the itinerary

Model the plan on these entities. Every place the traveller physically goes is a
`place`; the three things you schedule are `hotel`, `restaurant`, and `activity`,
each attached to a place. See `references/itinerary-schema.json` for the exact shape.

- **place** — `address`, `city`, `state` (or region/country), `phone`, `location` as `[lat, lng]`
- **hotel** — `name`, `num_stars` (1–5), `amenities`, `place`
- **restaurant** — `name`, `cuisine`, `price` (1–5, `$`–`$$$$$`), `place`
- **activity** — `name`, `age_range`, `duration_hours`, `place`
- **day** — one `hotel`, ordered `restaurants` (breakfast / lunch / dinner), ordered `activities`, plus `notes` and `transit` between them

Rules that keep a plan usable:

- **Geographic clustering beats a ranked list.** A day should be walkable or one
  transit hop end to end. Two great museums across town from each other on the same
  afternoon is a worse day than two good ones on the same street. This is the single
  biggest thing that separates a real itinerary from a listicle.
- **Anchor each day, then fill.** One or two must-do anchors per day, with flexible
  filler around them. Over-scheduling is the most common failure — leave gaps.
- **Book-ahead items get flagged.** Anything needing reservations, timed entry, or
  tickets gets a visible marker and a note on how far ahead.
- **Respect the budget.** Total the lodging + dining + activity estimates and show
  the running number. If the plan overshoots, say so and offer a cheaper swap rather
  than silently trimming the trip.
- **Match the party.** Kids shift `age_range` and shorten days. Mobility needs rule
  out the hill-town walking tour. Dietary needs constrain `cuisine`.
- **First and last days are travel days.** Plan them light — arrival fatigue and
  checkout logistics are real.

### Step 3 — Publish as an Artifact

**Load the `artifact-design` skill before writing the page.** Then build a single
self-contained HTML artifact:

- **Day tabs or a vertical day-by-day timeline** as the primary navigation
- Each day showing lodging, meals, and activities in chronological order, with
  addresses and estimated durations
- A **map** with markers for that day's stops when coordinates are available — see
  the `artifact-diagramming` skill for inline-SVG technique; a simple positioned-marker
  SVG beats loading a mapping library, which the artifact CSP will block anyway
- A **budget summary** — per-day and trip total
- A **packing / book-ahead checklist** if the trip warrants it

Give the artifact a real name — `"Kyoto in Five Days"`, not `"Trip Itinerary"`.

If the user wants to tick items off, mark days done, or edit the plan in place, load
`artifact-capabilities` first and declare what the page needs.

### Step 4 — Revise

Republish to the **same file path** so the URL is stable — the user may have already
shared the link. Never publish a revision as a new artifact.

## Sourcing places

You are working from training knowledge unless you look things up. That is fine for
"the Louvre is in Paris" and unreliable for "this restaurant is open on Mondays".

- If web search is available, verify anything **time-sensitive**: opening hours,
  prices, seasonal closures, whether a venue still exists. Small restaurants close.
- If it is not available, say plainly at the top of the plan that hours and prices
  need checking before booking, and keep recommendations to durable, well-established
  places.
- **Never invent an address, phone number, or coordinate pair.** Omit the field, or
  say "address to confirm". A confidently wrong address sends someone across a city
  for nothing — the one failure mode that ruins a trip day.

## Scope

This skill plans. It does not book, pay, or hold reservations, and it has no access
to live availability. Say so once if the user seems to expect otherwise, then get on
with planning.
