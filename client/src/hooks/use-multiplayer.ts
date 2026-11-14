import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "@/lib/apiBase";
import { MultiplayerConnection } from "@/lib/multiplayer-connection";

export type MultiplayerPlayer = {
  id: string;
  username: string;
  color: string;
  ready: boolean;
  alive: boolean;
  x: number;
  y: number;
  score: number;
};

export type MultiplayerRoom = {
  roomId: string;
  hostId: string;
  localPlayerId: string;
  maxPlayers: number;
  phase: "lobby" | "running";
  seed: number;
  startedAt: number | null;
  players: MultiplayerPlayer[];
};

function websocketUrl() {
  const base = apiBaseUrl || window.location.origin;
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export function useMultiplayer(username: string | undefined) {
  const connectionRef = useRef<MultiplayerConnection | null>(null);
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!username) return;
    const connection = new MultiplayerConnection(websocketUrl(), {
      onOpen: () => {
        setConnected(true);
        setError("");
      },
      onClose: ({ wasLeave }) => {
        setConnected(false);
        // The server drops a pilot from their room when the link closes, so the room is gone either way.
        setRoom(null);
        if (!wasLeave) setError("Connection lost. Reconnecting...");
      },
      onError: () => setError("Multiplayer link unavailable. Retrying..."),
      onMessage: (data) => {
        let message;
        try {
          message = JSON.parse(data);
        } catch {
          return;
        }
        if (message.type === "room:update") {
          setError("");
          setRoom(message.room);
        } else if (message.type === "room:error") {
          setError(message.message);
        } else if (message.type === "player:update") {
          setRoom((current) =>
            current
              ? {
                  ...current,
                  players: current.players.map((player) =>
                    player.id === message.player.id ? message.player : player,
                  ),
                }
              : current,
          );
        }
      },
    });
    connectionRef.current = connection;

    return () => {
      connection.dispose();
      connectionRef.current = null;
      setRoom(null);
      setConnected(false);
    };
  }, [username]);

  const send = useCallback((message: unknown) => {
    connectionRef.current?.send(message);
  }, []);

  const createRoom = useCallback(() => send({ type: "room:create", username }), [send, username]);
  const joinRoom = useCallback(
    (roomId: string) => send({ type: "room:join", roomId, username }),
    [send, username],
  );
  const setReady = useCallback((ready: boolean) => send({ type: "room:ready", ready }), [send]);
  const sendPosition = useCallback(
    (x: number, y: number) => send({ type: "player:position", x, y }),
    [send],
  );
  const leaveRoom = useCallback(() => {
    connectionRef.current?.leave();
    setRoom(null);
  }, []);

  return { room, error, connected, createRoom, joinRoom, setReady, sendPosition, leaveRoom };
}
