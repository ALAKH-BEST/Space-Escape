---
name: Multiplayer room architecture
description: ASTRODODGE multiplayer rooms use a same-server WebSocket and in-memory room state.
---

Room membership, readiness, start state, and live positions are held in the Node process and synchronized over the `/ws` WebSocket.

**Why:** The game needs low-latency room state for a small four-player squad without adding another service.

**How to apply:** If production runs multiple server instances or needs reconnect/persistent rooms, move room state to a shared realtime store and add connection recovery before relying on cross-instance multiplayer.