"use client";

// Asks /api/config once per page load whether the server is configured through
// .env.local. Null while the answer is in flight, so the UI can wait instead of
// flashing "connect a model" at someone whose key is already in the file.

import { useEffect, useState } from "react";
import type { ServerConfig } from "./types";

const UNCONFIGURED: ServerConfig = {
  providers: [],
  provider: null,
  model: "",
};

export function useServerConfig(): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/config")
      .then((r) => (r.ok ? (r.json() as Promise<ServerConfig>) : UNCONFIGURED))
      .catch(() => UNCONFIGURED)
      .then((c) => {
        if (alive) setConfig(c);
      });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
