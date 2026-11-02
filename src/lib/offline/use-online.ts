"use client";

import { useSyncExternalStore } from "react";
import { connection } from "@/lib/api/connection";

/** true si hay internet y el servidor responde. En el servidor (prerender) se asume que sí. */
export const useOnline = (): boolean => useSyncExternalStore(connection.subscribe, connection.isOnline, () => true);
