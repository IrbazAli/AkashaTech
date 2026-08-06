"use client";

import React from 'react';
import dynamic from 'next/dynamic';

// Disable SSR for the Three.js scene because it needs access to window/document
const TestAvatarScene = dynamic(() => import('../../components/TestAvatarScene'), {
  ssr: false,
});

export default function TestPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <TestAvatarScene />
    </main>
  );
}
