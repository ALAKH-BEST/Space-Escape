---
name: Server-authoritative scoring
description: The security boundary for score submission, multiplayer scores, and progression rewards.
---

Scores and rewards must be calculated from server-controlled run authorization and server time. Client-provided score, alive, elimination, or reward values are untrusted gameplay hints only and must never be persisted or used for gem awards.

**Why:** A browser user can modify every client-side value and can send arbitrary HTTP or WebSocket payloads. Authentication and duplicate run identifiers prevent account crossover and replay, but they do not make client score values trustworthy.

**How to apply:** Keep score submission bound to an authenticated, server-issued run proof; reject client score fields at the API boundary; derive multiplayer scores and elimination state on the server; keep reward calculation downstream of the validated score.