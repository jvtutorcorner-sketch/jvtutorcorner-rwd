'use client';

import React, { useState, useEffect, useRef } from 'react';

interface ConsoleLogViewerProps {
  title: string;
  maxLines?: number;
}

const ConsoleLogViewer: React.FC<ConsoleLogViewerProps> = ({ title, maxLines = 50 }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const originalConsoleLog = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Store original console.log
    const originalLog = console.log;

    // Override console.log to capture messages
    console.log = (...args: any[]) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      // Use setTimeout to make the state update asynchronous
      setTimeout(() => {
        setLogs(prevLogs => {
          const newLogs = [...prevLogs, `[${new Date().toLocaleTimeString()}] ${message}`];
          return newLogs.slice(-maxLines); // Keep only the last maxLines entries
        });
      }, 0);

      // Call the original console.log directly (not through the overridden one)
      originalLog.apply(console, args);
    };

    // Cleanup on unmount
    return () => {
      console.log = originalLog;
    };
  }, [maxLines]);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div style={{
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '8px',
      marginTop: '8px',
      backgroundColor: '#f9f9f9',
      maxHeight: '200px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px'
      }}>
        <strong style={{ fontSize: '14px' }}>{title}</strong>
        <button
          onClick={clearLogs}
          style={{
            padding: '2px 6px',
            fontSize: '12px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Clear
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={logs.join('\n')}
        readOnly
        style={{
          width: '100%',
          height: '150px',
          fontSize: '12px',
          fontFamily: 'monospace',
          border: 'none',
          resize: 'none',
          backgroundColor: 'transparent',
          overflowY: 'auto'
        }}
      />
    </div>
  );
};

export default ConsoleLogViewer;