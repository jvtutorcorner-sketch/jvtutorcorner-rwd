"use client";

import React from 'react';
import { VideoQuality } from '@/lib/agora/useAgoraClassroom';

export interface VideoControlsProps {
  currentQuality: VideoQuality;
  isLowLatencyMode: boolean;
  onQualityChange: (quality: VideoQuality) => void;
  onLowLatencyToggle: (enabled: boolean) => void;
  hasVideo: boolean;
  className?: string;
}

const VideoControls: React.FC<VideoControlsProps> = ({
  currentQuality,
  isLowLatencyMode,
  onQualityChange,
  onLowLatencyToggle,
  hasVideo,
  className = ''
}) => {
  const qualities: { value: VideoQuality; label: string; description: string }[] = [
    { value: 'low', label: '低质量', description: '320x240, 15fps' },
    { value: 'medium', label: '中等质量', description: '640x480, 15fps' },
    { value: 'high', label: '高质量', description: '1280x720, 30fps' },
    { value: 'ultra', label: '超高质量', description: '1920x1080, 30fps' }
  ];

  if (!hasVideo) {
    return null;
  }

  return (
    <div className={`video-controls ${className}`} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '12px',
      background: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #dee2e6'
    }}>
      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>视频设置</h4>

      {/* 视频质量选择 */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>
          视频质量:
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {qualities.map(quality => (
            <button
              key={quality.value}
              onClick={() => onQualityChange(quality.value)}
              style={{
                padding: '8px 12px',
                border: currentQuality === quality.value ? '2px solid #007bff' : '1px solid #dee2e6',
                background: currentQuality === quality.value ? '#e3f2fd' : 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{quality.label}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>{quality.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 低延迟模式 */}
      <div>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '500'
        }}>
          <input
            type="checkbox"
            checked={isLowLatencyMode}
            onChange={(e) => onLowLatencyToggle(e.target.checked)}
            style={{ margin: 0 }}
          />
          低延迟模式
        </label>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          启用后减少延迟，但可能影响稳定性。适合1对1教学场景。
        </div>
      </div>

      {/* 网络状态指示器 */}
      <div style={{ fontSize: '12px', color: '#666' }}>
        <div>当前质量: <strong>{qualities.find(q => q.value === currentQuality)?.label}</strong></div>
        <div>延迟模式: <strong>{isLowLatencyMode ? '启用' : '禁用'}</strong></div>
      </div>
    </div>
  );
};

export default VideoControls;