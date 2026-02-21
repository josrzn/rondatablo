# Rondatablo Pilot v0
## Product Spec: Debate Production Environment

## 1. Purpose

Build a minimal but real environment where a creator can:

1. Provide a source URL or raw text.
2. Select exact moderator/hosts/guests for one episode.
3. Run and attend a live AI debate session.
4. Export assets ready for YouTube/podcast workflows.

This is not a transcript toy.  
This v0 exists to validate whether Rondatablo can repeatedly produce debates that are both intellectually serious and watchable.

---

## 2. Product Shape (v0)

Single app (desktop-first web app is acceptable) with four screens:

1. Source Intake
2. Cast Builder
3. Live Studio
4. Export & Publish Pack

Out of scope for v0:
- Multi-user collaboration
- Cross-episode memory
- Full DAW-grade editing
- Direct one-click publish APIs (YouTube/Spotify upload)

---

## 3. Core User Flow

1. User pastes a URL (example: Dan Shapiro article) or raw text.
2. System extracts:
   - Core claim(s)
   - Main tensions/tradeoffs
   - Open questions
3. User picks cast:
   - Moderator
   - 2-4 panelists from saved personas
   - Optional guest persona prompt
4. User sets episode controls:
   - Seriousness level
   - Humor level
   - Confrontation level
   - Duration target
5. User starts Live Studio debate.
6. User can intervene live:
   - Ask follow-up
   - Push on claim
   - Ask for specificity/prediction
   - Pause/resume
7. Session ends with generated closing synthesis.
8. User exports a publish pack:
   - Transcript
   - Audio render
   - Show notes + chapter markers

---

## 4. Experience Requirements

The debate must feel live, not templated.

Hard requirements:
- Distinct voices are immediately recognizable.
- Participants respond to each other directly.
- Claims are pressure-tested, not restated.
- At least one concrete prediction is made by each panelist.
- Humor is used to sharpen reasoning, not derail it.

Failure modes to block:
- Generic agreement spiral
- Monologue chaining
- Repetitive framing language
- Empty “both sides” summaries

---

## 5. Runtime Model (Invisible Structure)

v0 should use hidden control logic (not explicit “phase labels” in output UI).

Internal runtime states:
1. Opening positions
2. Clash and challenge
3. Deepening and second-order effects
4. Commitments and predictions
5. Closing synthesis

Runtime guardrails:
- Enforce direct references across speakers.
- Detect repeated arguments and force advancement.
- Track per-speaker commitments and contradictions.
- Trigger moderator intervention only when clarity/tension drops.

---

## 6. Live Studio Controls (v0)

Required controls:
- Start / Pause / Resume / End
- “Push harder” (increase challenge intensity)
- “Get concrete” (force examples/metrics)
- “Time check” (compress to conclusion)
- “Follow-up from me” (creator-injected question)

Live panel view should show:
- Current speaker
- Short rolling claim tracker
- Unresolved disputes list

---

## 7. Export Pack (v0)

Required outputs per episode:

1. `transcript.md`
- Speaker-separated dialogue
- Timestamp markers

2. `audio_manifest.json`
- Segment timing
- Speaker IDs
- Voice IDs
- Music bed markers (if used)

3. `show_notes.md`
- Episode premise
- Major disagreements
- Key predictions
- “What to watch” list
- Chapter markers

4. `episode_meta.json`
- Source URL/text hash
- Cast configuration
- Control settings
- Generation timestamp

Optional in v0: rendered mixed audio file (`.wav`/`.mp3`) if TTS stack is integrated.

---

## 8. Data Contracts (Minimal)

### 8.1 Episode Input

```json
{
  "source": {
    "type": "url",
    "value": "https://example.com/post"
  },
  "cast": {
    "moderator_id": "editor_v1",
    "panelist_ids": ["accel_v1", "inst_realist_v1", "labor_v1"],
    "guest_prompt": ""
  },
  "controls": {
    "seriousness": 0.85,
    "humor": 0.35,
    "confrontation": 0.7,
    "duration_minutes": 14
  }
}
```

### 8.2 Episode Event

```json
{
  "t": "2026-02-21T10:00:00Z",
  "type": "utterance",
  "speaker_id": "inst_realist_v1",
  "text": "If this scales, coordination failure is the story.",
  "tags": ["challenge", "governance-risk"]
}
```

---

## 9. v0 Quality Rubric

Score each episode 1-5 on:

1. Voice Distinction
2. Intellectual Friction
3. Argument Progression (low repetition)
4. Concreteness (examples, mechanisms, predictions)
5. Entertainment Retention (would I keep watching?)

Minimum pass criteria:
- No category below 3
- Average >= 3.8
- At least one “I changed my view” or “I refined my claim” moment

---

## 10. Technical Scope (Pilot)

Recommended v0 stack:
- Frontend: React + simple local state
- Backend: lightweight API service
- Runtime: debate engine service (stateful per session)
- Storage: local files for exports + simple DB table for sessions

Interfaces to keep clean for iteration:
- Source parser interface
- Persona provider interface
- Debate runtime interface
- Export renderer interface

This keeps v1 options open (audio-native, memory, guest marketplace).

---

## 11. Milestones

### Milestone A: End-to-End Skeleton
- Intake -> cast -> live -> export works with stub content.

### Milestone B: Debate Quality Loop
- Real runtime logic, claim tracker, contradiction tracking.
- Generate 5 episodes from different source URLs.
- Apply rubric and log failures.

### Milestone C: Publish-Ready Outputs
- Export pack stable and reusable.
- At least one episode packaged for YouTube/podcast post-production.

---

## 12. Immediate Build Target

Ship Milestone A as soon as possible, then iterate on quality with Milestone B.  
Success is not “it runs”; success is “it produces debates worth coming back to.”
