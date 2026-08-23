---
name: Static hosting backend configuration
description: The game frontend can be built for relative static asset hosting while backend API origin is supplied at build time.
---

Static-hosted builds need a separately configured public backend origin; a Replit development domain is not a durable production API endpoint, and no production origin should be invented when the project is unpublished.

**Why:** The app's authentication, progression, and leaderboard endpoints are server-backed and cannot work from an itch.io page unless the published backend URL is supplied.

**How to apply:** Build with `VITE_API_BASE_URL=https://<published-app>.replit.app npm run build:itch`; keep the normal `npm run build` path unchanged for Replit.