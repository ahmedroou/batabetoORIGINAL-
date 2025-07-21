"use client";

import React from 'react';

interface ChunkLoadErrorHandlerState {
  hasError: boolean;
}

export class ChunkLoadErrorHandler extends React.Component<
  { children: React.ReactNode },
  ChunkLoadErrorHandlerState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChunkLoadErrorHandlerState {
    // Check if the error is a ChunkLoadError
    if (error.name === 'ChunkLoadError') {
      return { hasError: true };
    }
    // For other errors, we don't handle them here and let them bubble up
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (error.name === 'ChunkLoadError') {
      console.error('Caught ChunkLoadError, forcing page reload.');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      // You can render a fallback UI here if you want,
      // but the reload should happen almost instantly.
      return (
        <div>
          <h1>Loading new version...</h1>
        </div>
      );
    }

    return this.props.children;
  }
}
