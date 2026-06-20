"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Connection } from "./useEventStream";

type Ctx = {
  connection: Connection | null;
  setConnection: (c: Connection | null) => void;
};

const ConnectionContext = createContext<Ctx>({
  connection: null,
  setConnection: () => {},
});

/** Shares the dashboard's SSE connection state up to the nav (TopBar), which
 *  lives in the root layout above the page. */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  return (
    <ConnectionContext.Provider value={{ connection, setConnection }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export const useConnection = () => useContext(ConnectionContext);
