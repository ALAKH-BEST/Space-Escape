Space Escape is a real-time multiplayer space survival game built with React, TypeScript, Node.js, WebSockets, and PostgreSQL.

Players compete to survive, react quickly to game events, and achieve the highest score while the server maintains authoritative game state.

->> Features

Real-time multiplayer gameplay,
WebSocket-based state synchronization,
Server-authoritative game logic,
Authentication & persistent sessions,
PostgreSQL-backed leaderboard,
Spectator mode,
Final rankings,
Automated multiplayer/server-authority tests

->> Tech Stack

React · TypeScript · Node.js · Express · WebSockets · PostgreSQL · Drizzle ORM · Tailwind CSS

->> Performance

Load-tested on one CPU core (2 vCPU test machine, server and load generator pinned to separate cores):

p95 message latency stayed under 100 ms up to about 363-375 concurrent 4-player rooms (about 1,450-1,500 clients),
p50 0.2 ms with one room, about 6 µs of server CPU per delivered message,
16,000 idle connections held in 144 MB,
10-minute runs at 263 and 188 rooms with no dropped connections.

Numbers depend on the machine. Method, full results and how to reproduce them: benchmarks/multiplayer
