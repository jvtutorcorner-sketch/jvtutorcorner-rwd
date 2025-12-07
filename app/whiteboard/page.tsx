import React from 'react';
import SimpleWhiteboard from '@/components/SimpleWhiteboard';

const WhiteboardPage = () => {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <h1 style={{ textAlign: 'center', margin: '20px' }}>Minimal Whiteboard</h1>
      <SimpleWhiteboard />
    </div>
  );
};

export default WhiteboardPage;
