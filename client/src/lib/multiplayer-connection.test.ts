import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import test from "node:test";
import { setupMultiplayer } from "../../../server/multiplayer";
import { MultiplayerConnection, reconnectDelay } from "./multiplayer-connection";

// Upgraded WebSocket connections are not covered by closeAllConnections, so track them to cut them off.
const sockets = new WeakMap<Server, Set<Socket>>();

function listen(port = 0): Promise<{ server: Server; port: number }> {
  const server = createServer();
  const open = new Set<Socket>();
  sockets.set(server, open);
  server.on("connection", (socket) => {
    open.add(socket);
    socket.on("close", () => open.delete(socket));
  });
  setupMultiplayer(server);
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port })),
  );
}

const stop = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => resolve());
    sockets.get(server)?.forEach((socket) => socket.destroy());
  });

function waitFor<T>(poll: () => T | undefined, ms = 5000): Promise<T> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const value = poll();
      if (value !== undefined) return resolve(value);
      if (Date.now() - started > ms) return reject(new Error("timed out"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

test("reconnect delay grows and is capped", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(reconnectDelay), [500, 1000, 2000, 4000, 5000, 5000]);
});

test("a pilot can leave a room and create another on the same connection object", async () => {
  const { server, port } = await listen();
  const rooms: string[] = [];
  let opens = 0;
  const closes: boolean[] = [];
  const connection = new MultiplayerConnection(`ws://127.0.0.1:${port}/ws`, {
    onOpen: () => opens++,
    onClose: ({ wasLeave }) => closes.push(wasLeave),
    onMessage: (data) => {
      const message = JSON.parse(data);
      if (message.type === "room:update") rooms.push(message.room.roomId);
    },
  });
  try {
    await waitFor(() => (connection.isOpen ? true : undefined));
    connection.send({ type: "room:create", username: "Pilot" });
    await waitFor(() => rooms[0]);

    connection.leave();
    await waitFor(() => (opens === 2 && connection.isOpen ? true : undefined));
    assert.deepEqual(closes, [true]);

    connection.send({ type: "room:create", username: "Pilot" });
    const second = await waitFor(() => rooms[1]);
    assert.notEqual(second, rooms[0]);
  } finally {
    connection.dispose();
    await stop(server);
  }
});

test("a dropped server connection reconnects by itself", async () => {
  const first = await listen();
  let opens = 0;
  const closes: boolean[] = [];
  const connection = new MultiplayerConnection(`ws://127.0.0.1:${first.port}/ws`, {
    onOpen: () => opens++,
    onClose: ({ wasLeave }) => closes.push(wasLeave),
  });
  try {
    await waitFor(() => (connection.isOpen ? true : undefined));
    await stop(first.server);
    await waitFor(() => (closes.length === 1 ? true : undefined));
    assert.deepEqual(closes, [false]);

    const second = await listen(first.port);
    try {
      await waitFor(() => (opens === 2 && connection.isOpen ? true : undefined), 10000);
    } finally {
      connection.dispose();
      await stop(second.server);
    }
  } finally {
    connection.dispose();
  }
});

test("a disposed connection never reconnects", async () => {
  const { server, port } = await listen();
  let opens = 0;
  const connection = new MultiplayerConnection(`ws://127.0.0.1:${port}/ws`, { onOpen: () => opens++ });
  try {
    await waitFor(() => (connection.isOpen ? true : undefined));
    connection.dispose();
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(opens, 1);
    assert.equal(connection.isOpen, false);
  } finally {
    await stop(server);
  }
});
