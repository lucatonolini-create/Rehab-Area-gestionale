"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type BottomNavCtx = { hidden: boolean; hide: () => void; show: () => void };

const BottomNavContext = createContext<BottomNavCtx>({
  hidden: false,
  hide: () => {},
  show: () => {},
});

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <BottomNavContext.Provider value={{ hidden, hide: () => setHidden(true), show: () => setHidden(false) }}>
      {children}
    </BottomNavContext.Provider>
  );
}

export const useBottomNav = () => useContext(BottomNavContext);
