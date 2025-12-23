"use client";

import React from 'react';
import { VideoQuality } from '@/lib/agora/useAgoraClassroom';
import { useT } from './IntlProvider';

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
  const t = useT();
  const qualities: { value: VideoQuality; label: string; description: string }[] = [
    { value: 'low', label: t('video_quality_low'), description: '320x240, 15fps' },
    { value: 'medium', label: t('video_quality_medium'), description: '640x480, 15fps' },
    { value: 'high', label: t('video_quality_high'), description: '1280x720, 30fps' },
    { value: 'ultra', label: t('video_quality_ultra'), description: '1920x1080, 30fps' }
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
      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>{t('video_settings')}</h4>

      {/* 视频质量选择 */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>
          {t('video_quality')}:
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
          {t('low_latency_mode')}
        </label>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          {t('low_latency_desc')}
        </div>
      </div>

      {/* 网络状态指示器 */}
      <div style={{ fontSize: '12px', color: '#666' }}>
        <div>{t('current_quality')}: <strong>{qualities.find(q => q.value === currentQuality)?.label}</strong></div>
        <div>{t('latency_mode')}: <strong>{isLowLatencyMode ? t('enabled') : t('disabled')}</strong></div>
      </div>
    </div>
  );
};

export default VideoControls;