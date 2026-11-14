# Generator and validation — how it works

Short description of `src/engine`. Decisions referred to as D*n*/I*n* are in
[DECISIONS.md](DECISIONS.md). All lengths are metres in a local Cartesian system.

> The engine checks geometry against the parameters the user has set. It does not assess
> safety or compliance with any standard.

## 1. Inputs and derived regions (`site.ts`)

From the site and `obstacleClearance`:

- **structure region** = water − obstacle buffers − `noStructures` − `protected` zones
- **navigable region** = water − obstacle buffers − `noNavigation` − `protected` zones

Piers and fingers must lie in the first, berth slots and fairways in the second (I6).

## 2. Row design (`fill.ts → rowDesign`)

Strategies A–D use one module for the whole layout (D2), sized by the longest boat class
with a share above zero (strategy E sizes each row separately, see §3):

```
row depth     = boat length + lengthClearance
fairway width = max(fairwayMin, fairwayFactor × boat length)
pier pitch    = mainPierWidth + 2 × row depth + fairway width
```

Default mix: 12.5 m, 18 m and 46 m.

## 3. Search (`generate.ts`)

1. **Orientations**: perpendicular to the main shoreline direction, parallel to the three
   longest water edges, and a sweep 0–175° in 5° steps; or the single fixed angle.
2. For an orientation, pier lines are laid across the site at the pier pitch. The offset of
   the first line is swept over one pitch in 1 m steps.
3. **Pier placement** (`site.ts → placePiersOnLine`): the line is clipped to the structure
   region (centreline and both edges). A stretch becomes a pier if one end is within 0.5 m
   of the shoreline (I5). The pier keeps one fairway width clear at its head (I4, I16) and
   is capped at `maxMainPierLength`.
4. **Filling** (`fill.ts`): each side of a pier is filled from the shore end
   (`shoreOffset`) outwards, bay by bay. A bay is kept only if the water from the pier
   edge out to `row depth + fairway width` is navigable over the bay's width and its
   fingers are in the structure region (I8). Otherwise smaller classes, then fewer boats,
   are tried; otherwise the cursor moves on by 0.5 m (I9).
5. **Class mix**: each berth goes to the class furthest behind its target share, counted
   over the whole layout; each contiguous run is then ordered by boat length, shortest at
   the shore (I7). With **target counts** (D20) the shares follow the counts and each count
   is an upper limit: filling stops when all are used up, and the pier on which they run
   out gets the shortest length that still takes its berths (I31, I32).
6. **Search score**: number of berths that can be reached from the entrance, estimated on
   a grid (`reach.ts`, I15); for "min infrastructure" pontoon metres per berth with the
   shortfall penalty.
7. **Pruning** (I28): candidates whose piers cannot hold enough berths to matter are
   skipped before filling, and strategy C sweeps every orientation coarsely (4 m) before
   the 1 m sweep of the promising ones.

### Strategies

| | |
|---|---|
| A | shore-perpendicular piers at every pitch, best offset |
| B | shore-perpendicular piers at every other pitch, best offset (I12) |
| C | best offset for each other orientation; the best four orientations (I13) |
| D | one pier lying along a shoreline segment, berths on the water side (D4) |
| E | shore-perpendicular piers, every row sized for its own boat classes (D10) |

**Strategy E in more detail** (I23–I27). The berths to place are split over the classes
by target share into quotas. Piers are then placed one after another across the site;
each row is designed for the largest class that still has quota left, so rows run from the
largest boats to the smallest:

```
row depth     = slot length of the row's largest class
fairway width = the wider of what the two facing rows need
next pier     = previous row edge + fairway + row depth + mainPierWidth / 2
```

With the default mix the modules range from 22 m (5 m boats) to 46 m (12 m boats) instead
of 46 m everywhere. The total is the largest for which every quota is met (bisection);
both directions across the site and start offsets 2 m apart are tried. Classes that fit
nowhere are left out. Each row is tested for reachability with a circle as wide as its
own fairway.

The best candidate of each is built in full: unreachable berths are removed and counted (I14),
fairways are built, the layout is validated and its statistics computed. The alternatives
are ranked by the selected objective, near-duplicates (berth and pier counts both within
2 %) are dropped, and the top N (default 5) are returned.

If nothing fits, the result is empty and carries a diagnostic: water narrower than one
pier module, no pier reaches the shoreline, water too short for a pier, or all berths
blocked.

The search is deterministic: no random numbers, fixed iteration order, fixed tie-breaks.

## 4. Fairways (`fairways.ts`)

Built from the actual rows, so they also follow manual edits: a strip of the required
width in front of every row and one across every pier head, united, clipped to the
navigable region, minus piers and row blocks.

## 5. Validation (`validate.ts`)

**Geometric — errors, any one gives `geometricFail`:**
pier/finger/slot outside the water · structure or slot in an obstacle buffer · structure
in a `noStructures`/`protected` zone · slot in a `protected` zone · overlap of piers,
fingers and slots by more than 1 cm · boat outside its slot.

**Operational — warnings, any one gives `geometricOK` instead of `operationalOK`:**

- the corridor straight out of a slot to the far side of its row's fairway leaves the
  water, enters an obstacle buffer or a restricted zone, or is taken by another element;
- a slot lies in a `noNavigation` zone;
- berths cannot be reached from the entrance: the free navigable water is shrunk by half
  the fairway width (less 0.1 m), and the fairway in front of the berth must lie in the
  water swept by a circle of that size starting at the entrance (I21);
- a pier does not start at the shoreline;
- the generator left berths out of the layout because they could not be reached from the
  entrance (one warning with the count, D12).

Removed berths are ignored. `operationalOK` means only "meets the constraints configured
by the user".

## 6. Statistics and objectives (`score.ts`)

Statistics follow SPEC §7. Objectives are pure functions, higher is better: berth count;
berths per 1,000 m² of water; minus pontoon metres per berth (−1000 per berth short of the
target); and a weighted mean of capacity, inverse pontoon length and fairway area, each
scaled by the best alternative. Layouts with geometric errors always rank below valid ones.

## 7. Not implemented

Local refinement of angle and offset (I22); piers from both banks on one line (I18);
size zoning for other pier directions than square to the shore.
