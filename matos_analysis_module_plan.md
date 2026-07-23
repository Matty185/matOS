# MatOS — Match Analysis Module: Project Plan

**Version:** 1.0
**Status:** Ready for execution via Claude Code
**Prerequisite:** MatOS alpha complete and deployed
**Companion:** CLAUDE-analysis-addendum.md (append to repo CLAUDE.md)
**Methodology:** identical to alpha — staged build, ECC review gates, security-reviewer + database-reviewer BLOCKING on schema.

---

## 1. Module Definition

Two-layer system added to MatOS:

**Layer 1 — Match Breakdown.** A client-side video player + manual tagging tool producing a detailed, timestamped record of what happened in a match: positional timeline (intervals with roles) + discrete events (with modifiers and outcomes). Video is played from the user's local file and **never uploaded or stored**. The breakdown is a standalone data artifact — identified by name and match date, not replayable against video.

**Layer 2 — Athlete Profile.** Metrics computed from all breakdowns of one athlete: style card, success rates, submission profile, escapes, trajectory over time. Comparable side-by-side (scouting view).

**AI tagging is explicitly phase 2** of this module — manual first, accumulating breakdowns as future training/eval data. This also defers the hardest GDPR question (automated processing of third parties in footage) — see §9.

**The AI framing when it arrives:** a BJJ _data scientist_, not a coach. It extracts events and hard data. No technique advice, no tips.

### In Scope (v1)

- Local video file playback (pause/play/speed 0.25×–2×, seek)
- Manual tagging: positions (intervals + top/bottom role) and events (event + modifier + outcome per taxonomy §3)
- Focus-athlete model: one athlete per breakdown, everything from their perspective
- Tag flow: tap event → video auto-pauses → confirm modifiers/outcome → resume
- Basic tag edit/delete; timestamp adjustment
- Partial save + resume (re-select file; filename+duration mismatch warning, proceed allowed)
- One breakdown = one author; author owns; coach/owner sees all in gym
- Breakdowns for: own matches, other gym members (coach/owner), **external person files** (opponents/anyone — free-named, unlinked to MatOS accounts, owner's records only, no future member-merging)
- Match metadata: name, **match date (required, user input — drives trajectory)**, gi/no-gi, result + method, duration auto
- Athlete profile per §4: computed metrics, gi/no-gi separate, visible n from first match, current state + per-match trajectory by match date
- Side-by-side profile comparison
- Top-level "Analysis" section for all users; replaces mock Analysis tab on member profiles
- New agent tools: get_athlete_profile, get_metric (e.g. takedown success rate), compare_profiles
- Existing gym_id/RLS model extended to all new tables

### Out of Scope (v1)

- AI tagging (phase 2; design constraints noted in §9 so v1 doesn't block it)
- Video storage or URLs of any kind
- Keyboard shortcuts (later)
- Two-athlete tagging; canonical match linking between independent breakdowns
- Ruleset/points/penalty events; weight classes
- Collaborative breakdowns
- External-person → member profile merging
- Replay of breakdown against video

---

## 2. Core Design Decisions (locked)

| Decision               | Choice                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Taxonomy structure     | Event + modifier (+ outcome where metric-relevant)                                                                |
| Perspective            | Single focus athlete; opponent actions captured as defensive counterparts (their shot = your "takedown defended") |
| Positions & events     | Both: positions as intervals with role, events as moments                                                         |
| Outcomes               | Required only where they make a metric computable; see taxonomy                                                   |
| Video                  | Local file, client-side playback, never transits or persists in v1                                                |
| Breakdown identity     | Standalone artifact: name + match date                                                                            |
| Duplicate real matches | Two independent breakdowns, no linking                                                                            |
| Profile threshold      | Show from n=1 with visible n                                                                                      |
| Gi/no-gi               | Separate metric sets                                                                                              |
| Trajectory             | Per-match, ordered by user-entered match date                                                                     |
| AI tags (phase 2)      | Always marked AI-sourced, human review before counting toward profiles                                            |
| AI transit (phase 2)   | Server transit allowed, never persisted, GDPR-compliant processing required                                       |

---

## 3. Event Taxonomy v1

Coach review pending — build the taxonomy as **data, not code**: a seedable `event_types` reference table so coach edits don't require schema changes.

### Positions (intervals: position + role + start/end ts)

standing_neutral (no role) · closed_guard (playing/inside) · half_guard (bottom/top) · open_guard (playing/passing) · side_control (top/bottom) · mount (top/bottom) · back_control (has_back/back_taken) · turtle (top/turtled) · leg_entanglement (attacking/defending) · scramble (no role; resolution = next tagged position)

### Events (moment: event + modifier + outcome + ts)

**Standing/wrestling**

- takedown_attempt — mod: single/double/throw/trip/other (opt) — outcome REQ: completed/defended/scramble
- takedown_defended — outcome REQ: stuffed/conceded/scramble
- guard_pull — outcome opt: to_closed/to_half/to_open
- underhook_won · underhook_lost — no outcome

**Guard (bottom)**

- sweep_attempt — mod: type (opt) — outcome REQ: completed/defended
- guard_retention — outcome REQ: retained/passed
- wrestle_up_attempt — outcome REQ: completed/defended

**Top**

- guard_pass_attempt — mod: pressure/speed/leg_drag/other (opt) — outcome REQ: completed/defended

**Attack & defence (any position)**

- submission_attempt — mod REQ: sub type (armbar/triangle/rnc/guillotine/heel_hook/kimura/other…) — outcome REQ: finished/defended/lost_position
- submission_defended — mod: sub type (opt) — outcome REQ: escaped/tapped
- escape — outcome REQ: completed/failed (position from timeline)
- reversal · back_take — no outcome

**Misc:** reset_out_of_bounds — no outcome

### Match metadata

name (text) · match_date (date, REQ) · gi (bool) · focus: member_id XOR external_person_id · result (win/loss/draw) · method (submission/points/decision/dq) · duration_seconds (auto from video)

---

## 4. Profile Metrics Framework

All: gi/no-gi split · visible n · trajectory per match by match_date. Computed server-side from breakdown data at read time (or cached materialised view if performance requires — decide at build, flag to database-reviewer).

**Style card:** top/bottom time ratio · first-action tendency (pull/shoot/pulled-on per match) · scramble rate (per match + % time)
**Wrestling:** TD attempts/match · TD success % · TD defence %
**Passing:** pass attempts/match · pass success %
**Guard:** sweep % · retention % (retained ÷ passes faced) · wrestle-up %
**Submissions:** attempts/match · finish % overall · top 3 subs by frequency each with own % · tap rate when attacked
**Escapes:** escape % per inferior position (mount bottom, back taken, side bottom)
**General:** avg match time · n matches · win rate · finish method distribution

**Comparison view:** two profiles rendered side-by-side, same metric rows.

---

## 5. Data Model (new tables — all with gym_id, RLS per §7)

### external_people

`id, gym_id, created_by, display_name, notes, created_at`

### breakdowns

`id, gym_id, author_id, member_id (nullable), external_person_id (nullable) — exactly one set (CHECK constraint), name, match_date, gi, result, method, duration_seconds, video_filename, video_duration_seconds (for resume mismatch check), status (in_progress|complete), created_at, updated_at`

### breakdown_positions

`id, breakdown_id, gym_id, position (enum/ref), role (nullable), start_ts (float, seconds into video), end_ts (float)`

### breakdown_events

`id, breakdown_id, gym_id, event_type (ref → event_types), modifier (text/ref, nullable), outcome (text/ref, nullable — validated against event_types.outcome rules server-side), ts (float), source (manual|ai — 'ai' unused in v1), created_at`

### event_types (reference/seed data, not user-editable in UI)

`id, category, name, modifier_options (jsonb), outcome_required (bool), outcome_options (jsonb), active`

Profiles are computed, not stored (or cached view — build-time decision).

---

## 6. Screens & Flows

### Analysis section (top-level nav, all users)

- **My breakdowns** list: name, date, athlete, gi badge, status (in-progress/complete), n events. Coach/owner see all gym breakdowns with author shown.
- **New breakdown:** metadata form (pick member or create/pick external person, name, match date, gi, result) → file picker → tagging screen.
- **External people** list: manage person files, each opens their computed profile + their breakdowns.

### Tagging screen (the core UI — desktop and mobile)

- Video player: local file via `URL.createObjectURL`, controls: play/pause, seek bar, speed 0.25/0.5/1/1.5/2×, current timestamp prominent.
- Tag panel: position selector (position → role, sets interval start; next position tag closes previous interval) + event grid grouped by category (Standing / Guard / Top / Attacks / Misc).
- Flow: tap event → **auto-pause** → modifier/outcome sheet (only required fields block confirm) → confirm → resume. Two taps for no-modifier events.
- Timeline strip under player: tags as markers, tap marker → edit/delete/adjust timestamp.
- Save: continuous local draft + explicit save to server. Resume: re-select file; if filename or duration mismatch → warning, proceed allowed.
- Finish: mark complete → recompute profile.

### Profile view

- Reached from member profile (replaces mock Analysis tab) or external person file.
- Style card top; metric groups below; every metric shows n; gi/no-gi toggle; trajectory sparkline/chart per metric (by match_date).
- "Compare" action → pick second athlete/external person → side-by-side.

### Empty/error states per alpha standards (390px, 44px targets, empty states with actions, loading states, toasts).

---

## 7. Permissions & RLS

Extends existing model unchanged in spirit:

| Table                      | Coach/Owner                                                             | Athlete                                                |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| external_people            | Full in gym                                                             | CRUD own (created_by)                                  |
| breakdowns                 | SELECT all in gym; CRUD own-authored; coaches may author for any member | CRUD own-authored (focus: self or own external people) |
| breakdown_positions/events | Follow parent breakdown                                                 | Follow parent breakdown                                |
| event_types                | SELECT all                                                              | SELECT all; writes: service role/seed only             |

- Author owns; deletion of a breakdown cascades its positions/events (allowed — this is the author's artifact, unlike member records).
- Member-linked breakdowns feed that member's profile; athlete sees own profile; coach sees all profiles in gym.
- External person files + their profiles visible to creator and coach/owner (gym-scoped), per "analyst's own records".
- GDPR deletion of a member: their member-linked breakdowns deleted with other member data (they're derived from footage of that person).

## 8. Agent Tools (v1 additions)

Read-only, same server-side gym_id injection and validation as existing tools:

- `get_athlete_profile(member_id | external_person_id, gi?)`
- `get_metric(subject, metric_name, gi?)` — e.g. "what's Sarah's takedown success rate"
- `compare_profiles(subject_a, subject_b, gi?)`
- `get_breakdowns(subject?, date_range?)`

Agent answers remain terse and numeric. No coaching advice from profile data — if asked "what should Conor work on", the agent reports the weakest metrics factually and stops.

## 9. Phase 2 (AI Tagging) — design constraints on v1

Not built now, but v1 must not block it:

- `source` field on events exists from day one (manual|ai)
- AI tags will be marked AI-sourced and require human review before counting toward profiles → breakdown_events will gain `reviewed` (bool) in phase 2; no v1 action needed beyond not assuming all events count
- Video transit for AI: permitted through server, never persisted. Requires GDPR-compliant processing: DPA with AI provider, zero retention, lawful basis analysis — **the external-opponent case (automated processing of a third party who never consented) is the open legal question and the reason AI is phase 2, not v1**
- Accumulated manual breakdowns are the eval/training corpus for AI accuracy validation

## 10. Build Sequence

| Stage | Content                                                                                                                         | Gate                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A0    | CLAUDE.md addendum merged; event_types seed data written from §3                                                                | —                                                  |
| A1    | Schema (5 tables) + RLS + migrations + event_types seed                                                                         | **security-reviewer + database-reviewer BLOCKING** |
| A2    | Analysis section shell: nav, breakdown list, new-breakdown metadata flow, external people CRUD                                  | code-reviewer                                      |
| A3    | Video player + tagging screen: playback, position intervals, event tagging with pause-confirm flow, timeline strip, edit/delete | all reviewers                                      |
| A4    | Partial save/resume with mismatch warning; complete flow                                                                        | code-reviewer                                      |
| A5    | Profile computation + profile view (style card, metrics, n, gi toggle, trajectory)                                              | all reviewers                                      |
| A6    | Comparison view                                                                                                                 | code-reviewer                                      |
| A7    | Member profile Analysis tab replaced (mock removed); agent tools added                                                          | all reviewers                                      |
| A8    | Seed additions: 2–3 realistic breakdowns on demo members + 1 external person, enough events for a credible profile demo         | —                                                  |
| A9    | Polish + full ECC pass; resolve BLOCKED                                                                                         | **BLOCKING**                                       |

Checkpoints identical to alpha: working locally, no console errors, mobile check, review done, committed.

## 11. Open Items (tracked, not blocking)

- Coach review of taxonomy → edits land as event_types seed changes, not code
- Profile computation: live query vs materialised view — decide at A5 with database-reviewer input
- Keyboard shortcuts (post-v1)
- Phase 2 AI plan: its own interview + plan doc when manual data has accumulated
