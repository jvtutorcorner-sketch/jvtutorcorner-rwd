"use client";

import React, { useRef, useEffect, useState } from 'react';

const SimpleWhiteboard = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState('pen');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Set canvas size to fill its container
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        setContext(ctx);
      }
    }
  }, []);

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (context) {
      context.strokeStyle = color;
      context.globalCompositeOperation = 'source-over'; // Ensure drawing mode
      if (context.strokeStyle === '#ffffff') { // A simple way to detect eraser
        context.globalCompositeOperation = 'destination-out';
      }
      context.beginPath();
      context.moveTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
      setIsDrawing(true);
    }
  };

  const stopDrawing = () => {
    if (context) {
      context.closePath();
      setIsDrawing(false);
    }
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) {
      return;
    }
    context.lineTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    context.stroke();
  };

  const clearCanvas = () => {
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };
  
  const setEraser = () => {
    setColor('#ffffff'); // Use white for erasing
  }

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)} 
        />
        <button onClick={setEraser} style={{ marginLeft: '10px' }}>Eraser</button>
        <button onClick={clearCanvas} style={{ marginLeft: '10px' }}>Clear All</button>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onMouseMove={draw}
        style={{ width: '100%', height: '600px', border: '1px solid #000', cursor: 'crosshair' }}
      />
    </div>
  );
};

export default SimpleWhiteboard;
