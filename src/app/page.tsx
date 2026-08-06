"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the AR scene so it only loads on the client side
const ARScene = dynamic(() => import('../components/ARScene'), { ssr: false });

import React from 'react';

class ErrorBoundary extends React.Component<any, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: 20, background: 'black', height: '100vh', whiteSpace: 'pre-wrap' }}>
          <h2>Something went wrong in ARScene!</h2>
          {this.state.error && this.state.error.toString()}
        </div>
      );
    }
    return this.props.children; 
  }
}

export default function Home() {
  const [arMode, setArMode] = useState(false);

  if (arMode) {
    return (
      <ErrorBoundary>
        <ARScene onExit={() => setArMode(false)} />
      </ErrorBoundary>
    );
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', color: '#fff', textAlign: 'center', padding: '20px' }}>
      <h1 style={{ fontSize: '3rem', color: '#d4af37', letterSpacing: '2px', margin: '0 0 10px 0' }}>AKASHA RELIC TECH</h1>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '300', margin: '0 0 30px 0', color: '#aaa' }}>THE SPACESHIP COLUMBARIUM</h2>
      <p style={{ maxWidth: '600px', lineHeight: '1.6', marginBottom: '40px', color: '#ccc' }}>
        Enter the permanent digital memorial space. Experience presence through a fully immersive 3D architecture, guided by the Cybernetic Nun.
      </p>
      
      <div style={{ display: 'flex', gap: '20px', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '8px', border: '1px solid #d4af37', width: '100%' }}>
          <h3 style={{ color: '#d4af37', margin: '0 0 15px 0', fontWeight: '300' }}>Local Development Mode</h3>
          <ul style={{ textAlign: 'left', margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#ddd' }}>
            <li style={{ marginBottom: '8px' }}>Desktop controls enabled (W, A, S, D)</li>
            <li style={{ marginBottom: '8px' }}>Heavy Assets Mode (120MB unoptimized loaded)</li>
            <li>Interactive Niche Wall enabled</li>
          </ul>
        </div>
        
        <button 
          onClick={() => setArMode(true)}
          style={{ padding: '15px 30px', fontSize: '1.2rem', backgroundColor: '#d4af37', color: '#000', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', width: '100%', transition: 'all 0.3s' }}
        >
          Enter Columbarium
        </button>
      </div>
    </main>
  );
}
