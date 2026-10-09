"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button 
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="auth-button"
      style={{ marginTop: '1rem', background: 'transparent', borderColor: '#ef4444', color: '#ef4444' }}
    >
      Sign Out
    </button>
  );
}
