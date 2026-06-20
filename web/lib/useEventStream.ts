"use client";

import { useEffect, useRef, useState } from "react";
import {
  eventsUrl,
  getState,
  type LogAppendEvent,
  type SnapshotEvent,
  type StateSnapshot,
} from "./api";

export type Connection = "connecting" | "open" | "reconnecting";

/**
 * Subscribes to the control plane's SSE stream. The UI is a pure function of
 * the latest snapshot (dropped if its seq is stale), so reconnects self-heal.
 * Agent log lines accumulate in a per-idea ring buffer.
 */
export function useEventStream() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [logs, setLogs] = useState<Map<number, string[]>>(new Map());
  const [connection, setConnection] = useState<Connection>("connecting");
  const seqRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    getState()
      .then((evt) => {
        if (!closed && evt.seq > seqRef.current) {
          seqRef.current = evt.seq;
          setSnapshot(evt.data);
        }
      })
      .catch(() => {});

    function connect() {
      es = new EventSource(eventsUrl());
      es.addEventListener("open", () => setConnection("open"));

      es.addEventListener("snapshot", (e) => {
        const evt: SnapshotEvent = JSON.parse((e as MessageEvent).data);
        if (evt.seq <= seqRef.current) return; // drop stale / out-of-order
        seqRef.current = evt.seq;
        setSnapshot(evt.data);
      });

      es.addEventListener("log_append", (e) => {
        const evt: LogAppendEvent = JSON.parse((e as MessageEvent).data);
        setLogs((prev) => {
          const next = new Map(prev);
          const buf = (next.get(evt.idea_id) ?? []).concat(evt.lines).slice(-300);
          next.set(evt.idea_id, buf);
          return next;
        });
      });

      es.addEventListener("error", () => {
        setConnection("reconnecting");
        if (es && es.readyState === EventSource.CLOSED && !closed) {
          es.close();
          retry = setTimeout(connect, 1500);
        }
      });
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, []);

  return { snapshot, logs, connection };
}

/** A clock that ticks once per interval, for elapsed counters (epoch seconds). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
