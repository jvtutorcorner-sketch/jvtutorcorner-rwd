"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/IntlProvider';
import { getSystemInfo } from '@/lib/deviceDetection';
import type { SystemInfo } from '@/lib/deviceDetection';

export default function CheckDevicesPage() {
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const t = useT();

    useEffect(() => { setIsClient(true); }, []);

    useEffect(() => {
        if (!isClient) return;
        setIsLoading(true);
        try {
            const info = getSystemInfo();
            console.log('[CheckDevices] System Info:', info);
            console.log('  OS:', `${info.osName} ${info.osVersion}`);
            console.log('  Browser:', `${info.browserName} ${info.browserVersion}`);
            console.log('  Device:', `${info.deviceCategory} (${info.deviceModel})`);
            console.log('  Network:', info.networkType);
            setSystemInfo(info);
        } catch (err) {
            console.warn('[CheckDevices] Failed to get system info:', err);
        } finally {
            setIsLoading(false);
        }
    }, [isClient]);

    if (!isClient) return null;

    return (
        <div className="wait-page-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <style jsx>{`
        .wait-page-container {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2>{t('wait.check_title') || '檢測裝置'}</h2>
            </div>

            <div style={{ marginTop: 20, padding: 20, border: '2px solid #e0e0e0', borderRadius: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2196f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                        i
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{t('wait.check_subtitle') || ''}</div>
                    </div>
                </div>
                <VideoSetup />
            </div>

            {/* 系統環境資訊 */}
            <div style={{ marginTop: 20, padding: 20, border: '2px solid #e0e0e0', borderRadius: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                        🔍
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>系統環境資訊</div>
                    </div>
                </div>

                {isLoading && (
                    <div style={{ fontSize: 14, color: '#666', padding: '12px 0' }}>正在偵測系統資訊...</div>
                )}

                {systemInfo && !isLoading && (() => {
                    const deviceCat = (systemInfo.deviceCategory || '').toLowerCase();
                    const isMobile = deviceCat === 'mobile';
                    const isTablet = deviceCat === 'tablet';

                    // 根據裝置調整排版參數
                    const gridCols = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)';
                    const gridGap = isMobile ? 10 : isTablet ? 12 : 16;
                    const cardPadding = isMobile ? 12 : isTablet ? 14 : 18;
                    const labelFontSize = isMobile ? 11 : isTablet ? 12 : 13;
                    const valueFontSize = isMobile ? 13 : isTablet ? 15 : 16;
                    const labelMarginBottom = isMobile ? 4 : isTablet ? 6 : 8;
                    const subtextMarginTop = isMobile ? 4 : isTablet ? 6 : 8;
                    const borderRadius = isMobile ? 8 : isTablet ? 10 : 12;

                    return (
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: gridGap }}>
                            {/* OS */}
                            <div style={{ padding: cardPadding, background: 'white', border: '1px solid #e0e0e0', borderRadius }}>
                                <div style={{ fontSize: labelFontSize, color: '#666', fontWeight: 700, marginBottom: labelMarginBottom }}>作業系統</div>
                                <div style={{ fontSize: valueFontSize, fontWeight: 700, color: '#111' }}>{systemInfo.osName} {systemInfo.osVersion || ''}</div>
                            </div>

                            {/* Browser */}
                            <div style={{ padding: cardPadding, background: 'white', border: '1px solid #e0e0e0', borderRadius }}>
                                <div style={{ fontSize: labelFontSize, color: '#666', fontWeight: 700, marginBottom: labelMarginBottom }}>瀏覽器</div>
                                <div style={{ fontSize: valueFontSize, fontWeight: 700, color: '#111' }}>{systemInfo.browserName} {systemInfo.browserVersion || ''}</div>
                            </div>

                            {/* Device */}
                            <div style={{ padding: cardPadding, background: 'white', border: '1px solid #e0e0e0', borderRadius }}>
                                <div style={{ fontSize: labelFontSize, color: '#666', fontWeight: 700, marginBottom: labelMarginBottom }}>裝置</div>
                                <div style={{ fontSize: valueFontSize, fontWeight: 700, color: '#111', textTransform: 'capitalize' }}>{systemInfo.deviceCategory}</div>
                                <div style={{ fontSize: labelFontSize, color: '#444', marginTop: subtextMarginTop, wordBreak: 'break-all' }}>{systemInfo.deviceModel || '—'}</div>
                            </div>

                            {/* Network */}
                            <div style={{ padding: cardPadding, background: 'white', border: '1px solid #e0e0e0', borderRadius }}>
                                <div style={{ fontSize: labelFontSize, color: '#666', fontWeight: 700, marginBottom: labelMarginBottom }}>網路</div>
                                <div style={{ fontSize: valueFontSize, fontWeight: 700, color: '#111' }}>
                                    {systemInfo.networkType}
                                </div>
                                {systemInfo.networkIsWired !== undefined && (
                                    <div style={{ fontSize: labelFontSize, color: '#444', marginTop: subtextMarginTop }}>
                                        {systemInfo.networkIsWired ? '✓ 有線連接' : '📡 無線連接'}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
                
            </div>

            {/* No breadcrumb / back button for this diagnostic page */}
        </div>
    );
}

function VideoSetup({ onStatusChange }: { onStatusChange?: (audioOk: boolean, videoOk: boolean) => void }) {
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const previewStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        return () => {
            try {
                if (previewStreamRef.current) {
                    previewStreamRef.current.getTracks().forEach(t => t.stop());
                    previewStreamRef.current = null;
                }
            } catch (e) {
                console.warn('[CheckDevices] Failed to stop preview on unmount', e);
            }
        };
    }, []);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
    const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
    const [selectedAudioOutputId, setSelectedAudioOutputId] = useState<string | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [previewingCamera, setPreviewingCamera] = useState(false);
    const [testingMic, setTestingMic] = useState(false);
    const testingMicRef = useRef(false);
    const [micLevel, setMicLevel] = useState(0);
    const [audioTested, setAudioTested] = useState(false);
    const [speakerTested, setSpeakerTested] = useState(false);
    const [videoTested, setVideoTested] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [showIosNotice, setShowIosNotice] = useState(false);
    const t = useT();

    useEffect(() => {
        setIsClient(true);
        if (typeof window !== 'undefined') {
            const _isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
            const isHttp = window.location.protocol === 'http:';
            const noMediaDevices = !navigator.mediaDevices;
            if ((_isIos && isHttp) || noMediaDevices) setShowIosNotice(true);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        const updateDevices = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
                const list = await navigator.mediaDevices.enumerateDevices();
                if (!mounted) return;
                const ais = list.filter((d) => d.kind === 'audioinput');
                const vis = list.filter((d) => d.kind === 'videoinput');
                const aos = list.filter((d) => d.kind === 'audiooutput');
                setAudioInputs(ais);
                setAudioOutputs(aos);
                setVideoInputs(vis);

                const sa = localStorage.getItem('tutor_selected_audio');
                const sv = localStorage.getItem('tutor_selected_video');
                const so = localStorage.getItem('tutor_selected_output');

                if (sa && ais.find(d => d.deviceId === sa)) setSelectedAudioDeviceId(sa);
                else if (ais.length) setSelectedAudioDeviceId(ais[0].deviceId);

                if (sv && vis.find(d => d.deviceId === sv)) setSelectedVideoDeviceId(sv);
                else if (vis.length) setSelectedVideoDeviceId(vis[0].deviceId);

                if (so && aos.find(d => d.deviceId === so)) setSelectedAudioOutputId(so);
                else if (aos.length) setSelectedAudioOutputId(aos[0].deviceId);
            } catch (e) {
                console.warn('[Device Enum] enumeration failed:', e);
            }
        };
        updateDevices();
        try { navigator.mediaDevices?.addEventListener?.('devicechange', updateDevices); } catch (e) { }
        return () => { mounted = false; try { navigator.mediaDevices?.removeEventListener?.('devicechange', updateDevices); } catch (e) { } };
    }, []);

    const requestPermissions = async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return false;
            }
            const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            setPermissionGranted(true);
            s.getTracks().forEach(t => t.stop());

            await new Promise(resolve => setTimeout(resolve, 100));
            try {
                const list = await navigator.mediaDevices.enumerateDevices();
                const ais = list.filter((d) => d.kind === 'audioinput');
                const vis = list.filter((d) => d.kind === 'videoinput');
                setAudioInputs(ais);
                setVideoInputs(vis);
                if (!selectedAudioDeviceId && ais.length) setSelectedAudioDeviceId(ais[0].deviceId);
                if (!selectedVideoDeviceId && vis.length) setSelectedVideoDeviceId(vis[0].deviceId);
            } catch (enumError) {
                // Ignore enumeration errors if permission was granted
            }
            return true;
        } catch (e: any) {
            setPermissionGranted(false);
            if (e?.name === 'NotAllowedError') alert(t('permission_denied_devices') || '已被拒絕存取');
            else alert(t('error_occurred_prefix') + (e?.message || '不明錯誤'));
            return false;
        }
    };

    const startCameraPreview = async () => {
        try {
            const constraints: any = { video: true };
            if (selectedVideoDeviceId) constraints.video = { deviceId: { ideal: selectedVideoDeviceId } };

            let s: MediaStream | null = null;
            try {
                s = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                try {
                    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
                    s = await navigator.mediaDevices.getUserMedia(isIos ? { video: { facingMode: 'user' } } : { video: true });
                } catch (err2) {
                    throw err2;
                }
            }

            previewStreamRef.current = s;
            if (localVideoRef.current) {
                try { localVideoRef.current.srcObject = s; } catch (e) { }
                try { await localVideoRef.current.play(); } catch (e) { }
            }
            setPreviewingCamera(true);
            setVideoTested(true);
        } catch (e) {
            alert(t('camera_preview_failed') || '無法啟動攝影機預覽');
            setPreviewingCamera(false);
            setVideoTested(false);
        }
    };

    const stopCameraPreview = async () => {
        try {
            if (previewStreamRef.current) {
                previewStreamRef.current.getTracks().forEach((t) => t.stop());
            }
            previewStreamRef.current = null;
            if (localVideoRef.current) localVideoRef.current.srcObject = null;
        } catch (e) { }
        setPreviewingCamera(false);
    };

    const startMicTest = async () => {
        try {
            const constraints: any = { audio: true };
            if (selectedAudioDeviceId) constraints.audio = { deviceId: { ideal: selectedAudioDeviceId } };

            const s = await navigator.mediaDevices.getUserMedia(constraints);
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const ctx = audioContextRef.current;
            const src = ctx.createMediaStreamSource(s);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            analyserRef.current = analyser;
            micSourceRef.current = src;
            setTestingMic(true);
            testingMicRef.current = true;
            setAudioTested(true);

            const update = () => {
                try {
                    if (!analyserRef.current) return;
                    const arr = new Uint8Array(analyserRef.current.frequencyBinCount);
                    analyserRef.current.getByteFrequencyData(arr);
                    let sum = 0;
                    for (let i = 0; i < arr.length; i++) sum += arr[i];
                    const avg = sum / arr.length;
                    setMicLevel(Math.min(100, Math.floor(avg)));
                } catch (e) { }
                if (testingMicRef.current) window.requestAnimationFrame(update);
            };
            update();
        } catch (e) {
            setTestingMic(false);
            testingMicRef.current = false;
            setAudioTested(false);
            alert(t('mic_start_failed') || '無法啟動麥克風');
        }
    };

    const stopMicTest = () => {
        try {
            try { audioContextRef.current?.close(); } catch (e) { }
            audioContextRef.current = null;
            analyserRef.current = null;
            micSourceRef.current = null;
        } catch (e) { }
        setTestingMic(false);
        testingMicRef.current = false;
        setMicLevel(0);
    };

    useEffect(() => {
        try { if (selectedAudioDeviceId) localStorage.setItem('tutor_selected_audio', selectedAudioDeviceId); } catch (e) { }
    }, [selectedAudioDeviceId]);

    useEffect(() => {
        try { if (selectedVideoDeviceId) localStorage.setItem('tutor_selected_video', selectedVideoDeviceId); } catch (e) { }
    }, [selectedVideoDeviceId]);

    useEffect(() => {
        try { if (selectedAudioOutputId) localStorage.setItem('tutor_selected_output', selectedAudioOutputId); } catch (e) { }
    }, [selectedAudioOutputId]);

    useEffect(() => {
        if (onStatusChange) {
            const audioReady = audioTested && speakerTested;
            onStatusChange(audioReady, videoTested);
        }
    }, [audioTested, speakerTested, videoTested, onStatusChange]);

    const testSpeaker = async () => {
        try {
            const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) {
                alert(t('wait.sound_not_supported') || '不支援的音效系統');
                return;
            }
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.15;
            osc.type = 'sine';
            osc.frequency.value = 880;
            const dest = ctx.createMediaStreamDestination();
            osc.connect(gain);
            gain.connect(dest);

            const a = document.createElement('audio');
            a.autoplay = true;
            a.srcObject = dest.stream;

            try {
                if (selectedAudioOutputId && typeof (a as any).setSinkId === 'function') {
                    await (a as any).setSinkId(selectedAudioOutputId);
                }
            } catch (e) { }

            osc.start();
            document.body.appendChild(a);
            setTimeout(() => {
                try { osc.stop(); } catch (e) { }
                try { ctx.close(); } catch (e) { }
                try { a.pause(); a.srcObject = null; a.remove(); } catch (e) { }
                setSpeakerTested(true);
            }, 700);
        } catch (e) {
            alert(t('wait.sound_test_failed') || '測試聲音失敗');
        }
    };

    return (
        <div className="wait-device-setup">
            {showIosNotice && (
                <div style={{ width: '100%', padding: 16, background: '#ffebee', border: '2px solid #d32f2f', borderRadius: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 24 }}>⚠️</div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#d32f2f' }}>{t('wait.https_required_notice') || 'HTTPS Required'}</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="wait-preview" style={{ marginBottom: 20 }}>
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                    <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {!previewingCamera && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
                            {t('wait.camera_not_started') || '攝影機未啟動'}
                        </div>
                    )}
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: '#333', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: videoTested ? '#4caf50' : '#ccc' }} />
                    <span>{videoTested ? (t('wait.video_tested') || '已測試影像') : (t('wait.video_not_tested') || '尚未測試影像')}</span>
                </div>
            </div>
            <div className="wait-controls" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Microphone */}
                <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: audioTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                            {audioTested ? '✓' : ''}
                        </div>
                        <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t('wait.microphone') || '麥克風'}</label>
                    </div>
                    {isClient && (
                        <>
                            <select
                                value={selectedAudioDeviceId ?? ''}
                                onChange={(e) => setSelectedAudioDeviceId(e.target.value || null)}
                                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                                {audioInputs.length === 0 && <option value="">{t('wait.no_microphone') || '無麥克風'}</option>}
                                {audioInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || t('wait.microphone')}</option>))}
                            </select>
                            <button
                                onClick={() => { testingMic ? stopMicTest() : startMicTest(); }}
                                style={{ width: '100%', padding: '10px 14px', background: testingMic ? '#d32f2f' : '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                                {testingMic ? (t('wait.mic_stop') || '停止測試麥克風') : (t('wait.mic_test') || '測試麥克風')}
                            </button>
                        </>
                    )}
                    {testingMic && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{t('wait.volume_label') || '音量'}</div>
                            <div style={{ width: '100%', height: 12, background: '#eee', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{ width: `${micLevel}%`, height: '100%', background: micLevel > 60 ? '#4caf50' : '#ff9800', transition: 'width 0.1s' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Speaker */}
                <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: speakerTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                            {speakerTested ? '✓' : ''}
                        </div>
                        <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t('wait.sound') || '喇叭'}</label>
                    </div>
                    {isClient && (
                        <>
                            <select
                                value={selectedAudioOutputId ?? ''}
                                onChange={(e) => setSelectedAudioOutputId(e.target.value || null)}
                                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                                {audioOutputs.length === 0 && <option value="">{t('wait.no_sound') || '無喇叭'}</option>}
                                {audioOutputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || t('wait.sound')}</option>))}
                            </select>
                            <button
                                onClick={() => { testSpeaker(); }}
                                style={{ width: '100%', padding: '10px 14px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                                🔊 {t('wait.sound_test') || '測試聲音'}
                            </button>
                        </>
                    )}
                </div>

                {/* Camera */}
                <div style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: videoTested ? '#4caf50' : '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                            {videoTested ? '✓' : ''}
                        </div>
                        <label style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t('wait.camera') || '攝影機'}</label>
                    </div>
                    {isClient && (
                        <>
                            <select
                                value={selectedVideoDeviceId ?? ''}
                                onChange={(e) => setSelectedVideoDeviceId(e.target.value || null)}
                                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}>
                                {videoInputs.length === 0 && <option value="">{t('wait.no_camera') || '無攝影機'}</option>}
                                {videoInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || t('wait.camera')}</option>))}
                            </select>
                            <button
                                onClick={() => { previewingCamera ? stopCameraPreview() : startCameraPreview(); }}
                                style={{ width: '100%', padding: '10px 14px', background: previewingCamera ? '#d32f2f' : '#1976d2', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}>
                                {previewingCamera ? (t('wait.camera_stop_preview') || '停止預覽影像') : (t('wait.camera_preview') || '預覽影像')}
                            </button>
                        </>
                    )}
                </div>

                {isClient && !permissionGranted && (
                    <button
                        onClick={async () => {
                            if (!navigator.mediaDevices) {
                                alert(t('wait.https_required_notice') || 'HTTPS Required');
                                return;
                            }
                            const ok = await requestPermissions();
                            if (ok) {
                                try { await startCameraPreview(); } catch (e) { }
                            } else {
                                alert(t('wait.permissions_failed_notice') || 'Permission failed');
                            }
                        }}
                        style={{ padding: '12px 16px', background: '#ff9800', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        🔐 {t('wait.grant_permissions') || '允許存取'}
                    </button>
                )}

                {isClient && permissionGranted && (
                    <div style={{ padding: 12, background: '#c8e6c9', borderRadius: 6, fontSize: 13, color: '#2e7d32', fontWeight: 500 }}>
                        ✓ {t('wait.permissions_granted') || '已允許存取'}
                    </div>
                )}

                <div style={{ padding: 12, background: '#e3f2fd', borderRadius: 6, fontSize: 13, color: '#1565c0' }}>
                    💡 {t('wait.devices_saved_hint') || '您的裝置選擇將會被儲存。'}
                </div>
            </div>
        </div>
    );
}
