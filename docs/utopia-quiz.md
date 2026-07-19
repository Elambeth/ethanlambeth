# Utopia Faction Quiz — Questions & Decision Map (v3)

> Review document for the `/utopia` route. **Questions and weights are the v3 book-accurate set** (5 questions, Q3 binary). Faction copy and portraits are still placeholders. Live source of truth: `src/data/utopia.ts`.

---

## 1. How the result is decided

No literal branch tree — the quiz uses **additive weighted scoring**:

1. Each answer awards weighted points to 1–2 factions at once.
2. Points accumulate across all 5 questions.
3. Highest total wins; **ties broken at random** among the leaders.
4. 5 questions, single-select, auto-advance on tap.

⚠️ Because of rule 3, an important consequence (see §5): a faction can only win if it can be the **max** on *some* answer path. A faction whose only scoring answers also feed a competitor *more* points can never win.

---

## 2. Questions & per-answer weights

### Q1 — "Your idea of a good time tonight"

| Option | Faction points |
|--------|----------------|
| A. Take the vow, chase the frontier, cash in your leisure for the stars. | Utopian **+4**, Set-Set +1 |
| B. Hold court in the corner, quietly out-argue everyone in the room. | Mason **+3**, Gordian +1 |
| C. Dance until someone cries laughing, surrounded by chosen family. | Humanist **+3**, Madame's +1 |

### Q2 — "Your ideal government"

| Option | Faction points |
|--------|----------------|
| A. Free people, no interference — live by your own code. | Blacklaw **+4**, Greylaw +1 |
| B. Old houses, old rites, slow and careful stewardship. | Europe **+3**, Delian +1 |
| C. Everyone fed, tended, and cared for by those who serve. | Cousin **+3**, Servicer +2 |

### Q3 — "You trust" *(binary)*

| Option | Faction points |
|--------|----------------|
| A. The data, even when it's uncomfortable. | Set-Set **+3**, Mason +1 |
| B. Whoever's earned it through years of quiet service. | Servicer **+3**, Sensayer +1 |

### Q4 — "Rules are"

| Option | Faction points |
|--------|----------------|
| A. The whole point — chaos without them. | Whitelaw **+4** |
| B. A starting point, adjusted as needed. | Greylaw **+4**, Europe +1 |
| C. Chains, worn only until you can cut them. | Blacklaw +2, Gordian **+2** |

### Q5 — "Home is"

| Option | Faction points |
|--------|----------------|
| A. Wherever your people are, loud and laughing. | Humanist **+3**, Madame's +2 |
| B. Soil, weather, the land itself. | Mitsubishi **+4**, Europe +1 |
| C. A state of mind, carried with you, listened for. | Sensayer **+3**, Delian +1 |

---

## 3. Faction decision map (max achievable + build paths)

| Faction | Max pts | Answers that build it | +3/+4 signature |
|---------|--------:|-----------------------|-----------------|
| **Humanist** | 6 | Q1:C +3, Q5:A +3 | Q1:C, Q5:A |
| **Blacklaw** | 6 | Q2:A +4, Q4:C +2 | Q2:A |
| **Greylaw** | 5 | Q2:A +1, Q4:B +4 | Q4:B |
| **Europe** | 5 | Q2:B +3, Q4:B +1, Q5:B +1 | Q2:B |
| **Servicer** | 5 | Q2:C +2, Q3:B +3 | Q3:B |
| **Utopian** | 4 | Q1:A +4 | Q1:A |
| **Mason** | 4 | Q1:B +3, Q3:A +1 | Q1:B |
| **Set-Set** | 4 | Q1:A +1, Q3:A +3 | Q3:A |
| **Whitelaw** | 4 | Q4:A +4 | Q4:A |
| **Mitsubishi** | 4 | Q5:B +4 | Q5:B |
| **Sensayer** | 4 | Q3:B +1, Q5:C +3 | Q5:C |
| **Gordian** | 3 | Q1:B +1, Q4:C +2 | — (tiebreak-only) |
| **Cousin** | 3 | Q2:C +3 | Q2:C (tiebreak-only) |
| **Madame's** | 3 | Q1:C +1, Q5:A +2 | — |
| **Delian** | 2 | Q2:B +1, Q5:C +1 | — |

*(Note: the v3 spec's summary table listed Delian at 3 via Q2:B, Q4:A, Q5:C — but Q4:A awards only Whitelaw, so Delian's actual max is **2**.)*

### Worked example — a path to Blacklaw
Answers: **Q1:B, Q2:A, Q3:A, Q4:C, Q5:B**

| Faction | Q1 | Q2 | Q3 | Q4 | Q5 | Total |
|---------|----|----|----|----|----|------:|
| **Blacklaw** | | +4 | | +2 | | **6** ← winner |
| Mason | +3 | | +1 | | | 4 |
| Mitsubishi | | | | | +4 | 4 |
| Set-Set | | | +3 | | | 3 |
| Gordian | +1 | | | +2 | | 3 |
| Greylaw | | +1 | | | | 1 |
| Europe | | | | | +1 | 1 |

---

## 4. ⚠️ Winnability check — two factions can't actually win

"Reachable" should mean *can be the result*. Under the v3 weights, **Delian and Madame's can never be the max** — because every answer that scores them also scores a competitor *strictly higher*:

- **Madame's** only scores on Q1:C (+1, but Humanist +3) and Q5:A (+2, but Humanist +3). Any path that gives Madame's points gives Humanist ≥ 3 more. Max Madame's = 3, but that same path gives Humanist = 6. **Madame's can never win.**
- **Delian** only scores on Q2:B (+1, but Europe +3) and Q5:C (+1, but Sensayer +3). Max Delian = 2, always eclipsed by Europe or Sensayer. **Delian can never win.**

Additionally, **Cousin** and **Gordian** can only win via a random tiebreak (their build-answer always co-feeds a faction to the same total), so they'll be rare.

Everything else (Humanist, Blacklaw, Greylaw, Europe, Servicer, Utopian, Mason, Set-Set, Whitelaw, Mitsubishi, Sensayer) is genuinely winnable.

### Suggested fixes (your call — these are your book-accurate answers)
To make all 15 winnable without changing the *prompts*, give each stranded faction one option where it is the **headline** (highest weight on that option), or break the "companion always loses" pairing:

- **Madame's:** flip Q5:A to `Humanist +2, Madame's +3` (Madame's headline), and/or drop Humanist from one of the two.
- **Delian:** needs a headline answer — e.g. turn Q4:A into `Whitelaw +3, Delian +2` won't suffice (still loses to its own option); better to make a "balance/civic-center" option somewhere award `Delian +3` as the primary. Barring that, Delian needs a +4 of its own.
- **Cousin / Gordian:** fine to leave as rare/tiebreak, or nudge a weight so each has at least one unique-max path.

Re-run §3 after any change.

---

## 5. Editing

- **Content:** `src/data/utopia.ts` — factions, questions, weights. Nothing else changes for content.
- **Behavior:** scoring/tie-breaking lives in `computeResult()` in the same file.
- **Portraits:** set `image: "/utopia/<faction>.png"` per faction, drop the file in `public/` — placeholder swaps out automatically.
