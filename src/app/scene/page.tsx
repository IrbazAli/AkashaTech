"use client";

import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the OutsideScene so it only loads on the client side (SSR disabled)
const OutsideScene = dynamic(() => import('../../components/OutsideScene'), { ssr: false });

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
          <h2>Something went wrong in the Scene!</h2>
          {this.state.error && this.state.error.toString()}
        </div>
      );
    }
    return this.props.children; 
  }
}

export default function ScenePage() {
  return (
    <main style={{ minHeight: '100vh', margin: 0, padding: 0, backgroundColor: '#050508' }}>
      <ErrorBoundary>
        <OutsideScene />
      </ErrorBoundary>
    </main>
  );
}
