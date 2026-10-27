"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/auth/session-store";
import { homeFor } from "@/lib/nav";

export default function Home() {
  const router = useRouter();
  const { session, hydrated, hydrate } = useSessionStore();
  useEffect(() => {
    if (!hydrated) hydrate();
    else router.replace(session ? homeFor(session.user) : "/login");
  }, [hydrated, hydrate, session, router]);
  return null;
}
