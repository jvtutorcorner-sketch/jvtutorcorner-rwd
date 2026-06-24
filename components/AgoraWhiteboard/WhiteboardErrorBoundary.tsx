"use client";

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class WhiteboardErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[WhiteboardErrorBoundary] Caught render error in whiteboard subtree:', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          <div className="text-center p-4">
            <p className="text-sm text-slate-500">白板載入失敗，請重試</p>
            <button
              className="mt-2 text-xs text-blue-600 underline"
              onClick={() => this.setState({ error: null })}
            >
              重新載入白板
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
