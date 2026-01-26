'use client';

import React, { useState, useEffect, useRef } from 'react';

interface NetworkSpeedMonitorProps {
  title?: string;
  updateInterval?: number; // in milliseconds
}

const NetworkSpeedMonitor: React.FC<NetworkSpeedMonitorProps> = ({
  title = '網路速度',
  updateInterval = 5000
}) => {
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [connectionType, setConnectionType] = useState<string>('unknown');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get basic connection info
  const getConnectionInfo = () => {
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn) {
        setConnectionType(conn.effectiveType || 'unknown');
        // downlink is in Mbps
        if (conn.downlink) {
          setDownloadSpeed(conn.downlink);
        }
      }
    }
  };

  // Measure ping to a reliable endpoint
  const measurePing = async (): Promise<number> => {
    const start = Date.now();
    try {
      await fetch('/api/ping', { method: 'HEAD', cache: 'no-cache' });
      return Date.now() - start;
    } catch (e) {
      console.warn('Ping measurement failed', e);
      return -1;
    }
  };

  // Measure download speed by fetching a small test file
  const measureDownloadSpeed = async (): Promise<number> => {
    const testUrl = '/api/speed-test?size=small'; // Assume we have a speed test endpoint
    const start = Date.now();
    try {
      const response = await fetch(testUrl, { cache: 'no-cache' });
      await response.blob(); // Consume the response
      const duration = (Date.now() - start) / 1000; // in seconds
      const bytes = 1024 * 1024; // Assume 1MB test file
      const speedMbps = (bytes * 8) / (duration * 1000000); // Convert to Mbps
      return speedMbps;
    } catch (e) {
      console.warn('Download speed measurement failed', e);
      return -1;
    }
  };

  // Measure upload speed (simplified - just measure request time)
  const measureUploadSpeed = async (): Promise<number> => {
    const start = Date.now();
    try {
      await fetch('/api/speed-test', {
        method: 'POST',
        body: JSON.stringify({ test: 'data'.repeat(1000) }), // ~4KB test data
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-cache'
      });
      const duration = (Date.now() - start) / 1000;
      const bytes = 4000; // 4KB
      const speedMbps = (bytes * 8) / (duration * 1000000);
      return speedMbps;
    } catch (e) {
      console.warn('Upload speed measurement failed', e);
      return -1;
    }
  };

  const updateNetworkStats = async () => {
    try {
      const [pingTime, downloadMbps, uploadMbps] = await Promise.all([
        measurePing(),
        measureDownloadSpeed(),
        measureUploadSpeed()
      ]);

      setPing(pingTime > 0 ? pingTime : null);
      setDownloadSpeed(downloadMbps > 0 ? downloadMbps : null);
      setUploadSpeed(uploadMbps > 0 ? uploadMbps : null);
    } catch (e) {
      console.warn('Network stats update failed', e);
    }
  };

  useEffect(() => {
    getConnectionInfo();

    // Initial measurement
    updateNetworkStats();

    // Set up periodic updates
    intervalRef.current = setInterval(updateNetworkStats, updateInterval);

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn) {
        conn.addEventListener('change', getConnectionInfo);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn) {
          conn.removeEventListener('change', getConnectionInfo);
        }
      }
    };
  }, [updateInterval]);

  const formatSpeed = (speed: number | null): string => {
    if (speed === null) return '--';
    if (speed < 1) return `${(speed * 1000).toFixed(0)} Kbps`;
    return `${speed.toFixed(1)} Mbps`;
  };

  const getSpeedColor = (speed: number | null): string => {
    if (speed === null) return '#666';
    if (speed < 1) return '#f44336'; // Red for slow
    if (speed < 5) return '#ff9800'; // Orange for medium
    return '#4caf50'; // Green for good
  };

  const getPingColor = (ping: number | null): string => {
    if (ping === null) return '#666';
    if (ping > 200) return '#f44336'; // Red for high latency
    if (ping > 100) return '#ff9800'; // Orange for medium latency
    return '#4caf50'; // Green for low latency
  };

  return (
    <div style={{
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '8px',
      marginTop: '8px',
      backgroundColor: '#f9f9f9',
      fontSize: '12px'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>狀態:</span>
          <span style={{ color: isOnline ? '#4caf50' : '#f44336' }}>
            {isOnline ? '線上' : '離線'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>連線類型:</span>
          <span>{connectionType}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>下載速度:</span>
          <span style={{ color: getSpeedColor(downloadSpeed) }}>
            {formatSpeed(downloadSpeed)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>上傳速度:</span>
          <span style={{ color: getSpeedColor(uploadSpeed) }}>
            {formatSpeed(uploadSpeed)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Ping:</span>
          <span style={{ color: getPingColor(ping) }}>
            {ping !== null ? `${ping}ms` : '--'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NetworkSpeedMonitor;