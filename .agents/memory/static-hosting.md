---
name: Static hosting backend configuration
description: The game frontend can be built for relative static asset hosting while backend API origin is supplied at build time.
---

Static-hosted builds need a separately configured public backend origin; a Replit development domain is not a durable production API endpoint, and no production origin should be invented when the project is unpublished.

**Why:** The app's authentication, progression, and leaderboard endpoints are server-backed and cannot work from an itch.io page unless the published backend URL is supplied.

**How to apply:** Build with `VITE_API_BASE_URL=https://<published-app>.replit.app npm run build:itch`; keep the normal `npm run build` path unchanged for Replit.

The live full-stack service for this project may be hosted on Render rather than Replit; a Replit workflow restart does not update that service.

**Why:** Render deployments use their own build and release lifecycle, and the workspace currently has no active Replit deployment.

**How to apply:** Verify Render is deploying `ALAKH-BEST/Space-Escape` from `main`, and confirm its deployed commit includes the current authentication/session fix before debugging the live URL.