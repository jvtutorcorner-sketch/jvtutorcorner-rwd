import React from 'react';
import CollaborativeWhiteboard from '@/components/CollaborativeWhiteboard';

const WhiteboardPage = () => {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1 style={{ textAlign: 'center', margin: '20px' }}>Collaborative Whiteboard (Dual Layer + RTM)</h1>
      <div style={{ boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
        <CollaborativeWhiteboard width={1000} height={700} />
      </div>
      <p style={{ marginTop: '10px', color: '#666' }}>
        Dual-layer canvas used to prevent flickering. 
        Points are synced with a robust queue (30ms interval) to prevent packet loss and smooth rendering.
      </p>
    </div>
  );
};

export default WhiteboardPage;
