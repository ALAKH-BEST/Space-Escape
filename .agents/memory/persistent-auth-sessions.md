---
name: Persistent authentication sessions
description: Authentication session storage must survive application workflow restarts.
---

Authenticated browser sessions must be stored in PostgreSQL rather than process memory. Replit workflow restarts replace the Node process while the browser keeps its session cookie; an in-memory store then leaves the UI appearing logged in while protected APIs return 401.

**Why:** This project’s workflow restarts during development and deployment. Losing sessions on every restart produces confusing login and mission-authorization failures.

**How to apply:** Use the existing PostgreSQL pool with connect-pg-simple, keep the session secret stable, and clear cached client user state on a protected API 401 so stale pages redirect to login.