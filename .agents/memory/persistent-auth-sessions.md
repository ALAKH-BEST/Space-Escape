---
name: Persistent authentication sessions
description: Authentication session storage must survive application workflow restarts.
---

Authenticated browser sessions must be stored in PostgreSQL rather than process memory. Replit workflow restarts replace the Node process while the browser keeps its session cookie; an in-memory store then leaves the UI appearing logged in while protected APIs return 401.

**Why:** This project’s workflow restarts during development and deployment. Losing sessions on every restart produces confusing login and mission-authorization failures.

**How to apply:** Use the existing PostgreSQL pool with connect-pg-simple, keep the session secret stable, and clear cached client user state on a protected API 401 so stale pages redirect to login.

Bundled production servers must create the PostgreSQL session table through application SQL rather than enabling connect-pg-simple's automatic table creation. The bundled package cannot reliably find its package-local `table.sql` at runtime.

**Why:** The production bundler relocates package code under the server bundle, turning connect-pg-simple's relative `table.sql` lookup into a missing `dist/table.sql` file.

**How to apply:** Run idempotent `CREATE TABLE IF NOT EXISTS` and index setup through the shared pool before registering the session middleware, then set `createTableIfMissing: false`.