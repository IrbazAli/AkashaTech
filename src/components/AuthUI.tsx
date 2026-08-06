"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import React from "react";

export default function AuthUI() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1000, color: "white" }}>
        Loading...
      </div>
    );
  }

  if (session) {
    return (
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1000, background: "rgba(0,0,0,0.7)", padding: "10px 20px", borderRadius: "8px", color: "white", display: "flex", gap: "15px", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: "bold" }}>{session.user?.name}</div>
          <div style={{ fontSize: "12px", color: "#aaa" }}>Role: {(session.user as any).role}</div>
        </div>
        <button 
          onClick={() => signOut()}
          style={{ padding: "8px 12px", background: "#ff4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1000 }}>
      <button 
        onClick={() => signIn("credentials")}
        style={{ padding: "10px 20px", background: "#4444ff", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
      >
        Sign In
      </button>
    </div>
  );
}
