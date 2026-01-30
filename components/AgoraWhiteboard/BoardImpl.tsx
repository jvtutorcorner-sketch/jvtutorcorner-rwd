"use client";

import React, { useImperativeHandle, forwardRef, useEffect, useRef, useState } from 'react';

export interface AgoraWhiteboardRef {
    insertPDF: (url: string, title?: string) => Promise<void>;
    leave: () => Promise<void>;
}

interface AgoraWhiteboardProps {
    roomUuid: string;
    roomToken: string;
    appIdentifier: string;
    userId: string;
    region?: string;
    className?: string;
    role?: 'teacher' | 'student';
}

type ToolType = "pencil" | "eraser" | "selector";

const BoardImpl = forwardRef<AgoraWhiteboardRef, AgoraWhiteboardProps>((props, ref) => {
    // 1. 使用動態 Region，預設為 sg
    const { roomUuid, roomToken, appIdentifier, userId, className, role = 'student', region = 'sg' } = props;

    // Hooks
    const containerRef = useRef<HTMLDivElement>(null);
    const roomRef = useRef<any>(null);
    
    // Debug UI
    const [viewMode, setViewMode] = useState<string>("-"); 
    const [cameraState, setCameraState] = useState<string>("X:0 Y:0 S:1");
    const [status, setStatus] = useState("載入 SDK...");
    const [phase, setPhase] = useState("Init");
    const [sdkLoaded, setSdkLoaded] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    
    // UI State
    const [activeTool, setActiveTool] = useState<ToolType>("pencil");
    const [activeColor, setActiveColor] = useState<number[]>([220, 38, 38]);

    // 1. Mount Check
    useEffect(() => {
        if (typeof window !== 'undefined') setIsMounted(true);
    }, []);

    // 2. Load SDK
    useEffect(() => {
        if (!isMounted) return;
        const checkSdkLoaded = () => {
            const sdk = (window as any).WhiteWebSdk;
            if (sdk && sdk.WhiteWebSdk) {
                setSdkLoaded(true);
                return true;
            }
            return false;
        };
        if (checkSdkLoaded()) return;

        console.log("[CoreSDK] Loading script...");
        const script = document.createElement('script');
        script.src = "https://sdk.netless.link/white-web-sdk/2.16.44.js";
        script.async = true;
        script.onload = () => {
            console.log("[CoreSDK] Script loaded");
            setTimeout(checkSdkLoaded, 100);
        };
        script.onerror = () => setStatus("載入 SDK 失敗");
        document.head.appendChild(script);
    }, [isMounted]);

    // 3. Init Room
    useEffect(() => {
        if (!isMounted || !containerRef.current || roomRef.current || !sdkLoaded) return;

        let isAborted = false;
        const targetDiv = containerRef.current;
        let resizeObserver: ResizeObserver | null = null;
        let resizeHandler: (() => void) | null = null;

        const initSdk = async () => {
            try {
                setStatus(`連接 Agora (${region})...`);
                const { WhiteWebSdk, DeviceType } = (window as any).WhiteWebSdk;

                const whiteWebSdk = new WhiteWebSdk({
                    appIdentifier,
                    deviceType: DeviceType.Surface,
                    useMobXState: true,
                });

                const isTeacher = role === 'teacher';
                console.log(`[CoreSDK] Joining as ${role}, Region: ${region}, UUID: ...${roomUuid.slice(-6)}`);

                const room = await whiteWebSdk.joinRoom({
                    uuid: roomUuid,
                    roomToken,
                    region: region as any,
                    uid: userId,
                    // ★★★ 關鍵：永遠設為 false，解鎖 SDK 內部同步機制 ★★★
                    disableCameraTransform: false, 
                    isWritable: isTeacher,
                });

                if (isAborted) {
                    room.disconnect();
                    return;
                }

                roomRef.current = room;
                // 掛載到 window 方便您在 Console 除錯 (window.agoraRoom)
                (window as any).agoraRoom = room;
                setPhase("Connected");

                // Improvement: Delayed initialization to ensure DOM is painted
                setTimeout(() => {
                    if (isAborted || !targetDiv) return;

                    console.log("[CoreSDK] Binding HTML Element (Delayed)");
                    room.bindHtmlElement(targetDiv);
                    
                    // ★★★ 視覺除錯：將背景設為淺藍色 (只限老師) ★★★
                    // 如果畫面變藍，代表渲染成功；如果還是白，代表高度是 0
                    if (isTeacher) {
                        try {
                            room.setGlobalState({ backgroundColor: { r: 240, g: 248, b: 255 } });
                        } catch (e) {
                            console.warn("Set Background Failed:", e);
                        }
                    }

                    // --- 解決白屏的關鍵：暴力重繪 ---
                    // 在不同的時間點強制更新視窗大小，確保 DOM 長出來後 SDK 能抓到
                    const forceRefresh = () => {
                        if (room && room.refreshViewSize) {
                            room.refreshViewSize();
                            console.log("[CoreSDK] Force Refresh View Size");
                        }
                    };
                    forceRefresh();
                    setTimeout(forceRefresh, 500);
                    setTimeout(forceRefresh, 1000);
                }, 100);

                setStatus("連線成功");

                // --- 視角同步邏輯 ---
                if (isTeacher) {
                    room.setViewMode("broadcaster");
                    setViewMode("Broadcaster");
                    // 老師加入後，重置到中心點，建立基準
                    setTimeout(() => {
                        room.moveCamera({ centerX: 0, centerY: 0, scale: 1 });
                    }, 600);
                    
                    room.setMemberState({
                        currentApplianceName: "pencil",
                        strokeColor: [220, 38, 38],
                        strokeWidth: 4,
                    });
                } else {
                    room.setViewMode("follower");
                    setViewMode("Follower");
                    // 學生加入後也先強制回正一次
                    setTimeout(() => {
                         room.moveCamera({ centerX: 0, centerY: 0, scale: 1 });
                    }, 600);
                }

                // 監聽相機變化 (Debug 用)
                room.callbacks.on("onCameraUpdated", (camera: any) => {
                   setCameraState(`X:${Math.round(camera.centerX)} Y:${Math.round(camera.centerY)} S:${camera.scale.toFixed(1)}`);
                });
                
                room.callbacks.on("onPhaseChanged", (p: string) => {
                    setPhase(p);
                });

                resizeHandler = () => room.refreshViewSize();
                window.addEventListener('resize', resizeHandler);

                if (typeof ResizeObserver !== 'undefined') {
                    resizeObserver = new ResizeObserver(() => room.refreshViewSize());
                    resizeObserver.observe(targetDiv);
                }

                // UI Sync
                if (room.state?.memberState) {
                    const { currentApplianceName, strokeColor } = room.state.memberState;
                    if (currentApplianceName) setActiveTool(currentApplianceName as any);
                    if (strokeColor) setActiveColor(strokeColor);
                }

                (window as any).__fastboard_ready = true;

            } catch (error: any) {
                console.error("[CoreSDK] Error:", error);
                setStatus(`錯誤: ${error.message}`);
            }
        };

        const timer = setTimeout(initSdk, 0);

        return () => {
            clearTimeout(timer);
            isAborted = true;
            if (resizeHandler) window.removeEventListener('resize', resizeHandler);
            if (resizeObserver) resizeObserver.disconnect();
            if (roomRef.current) {
                // 嚴格清理，避免 React Strict Mode 殘留
                roomRef.current.bindHtmlElement(null);
                roomRef.current.disconnect();
                roomRef.current = null;
            }
            if (typeof window !== 'undefined') (window as any).agoraRoom = null;
        };
    }, [isMounted, sdkLoaded, appIdentifier, roomUuid, roomToken, userId, role, region]);

    // 4. Methods
    useImperativeHandle(ref, () => ({
        insertPDF: async (url, title) => {
            if (!roomRef.current || !roomRef.current.isWritable) return;
            try {
                await roomRef.current.insertImage({
                    uuid: roomRef.current.uuid,
                    centerX: 0, centerY: 0, width: 800, height: 600, locked: false,
                });
                roomRef.current.moveCamera({ centerX: 0, centerY: 0, scale: 1 });
            } catch (e) { console.error(e); }
        },
        leave: async () => { if (roomRef.current) await roomRef.current.disconnect(); }
    }));

    // Helpers
    const setTool = (tool: ToolType) => {
        if (!roomRef.current) return;
        setActiveTool(tool);
        roomRef.current.setMemberState({ currentApplianceName: tool });
    };
    const setColor = (color: number[]) => {
        if (!roomRef.current) return;
        setActiveColor(color);
        const nextTool = activeTool === 'pencil' ? 'pencil' : 'pencil';
        if (activeTool !== 'pencil') setActiveTool('pencil');
        roomRef.current.setMemberState({ currentApplianceName: nextTool, strokeColor: color });
    };
    const clearScene = () => roomRef.current?.cleanCurrentScene();
    
    // 萬用修復按鈕 - "Nuclear Re-Bind" Strategy
    const forceFix = () => {
        if (!roomRef.current || !containerRef.current) return;
        console.log("[CoreSDK] Nuclear Re-Bind Initiated");

        // 1. Unbind Current
        roomRef.current.bindHtmlElement(null);

        // 2. Wait 100ms then Rebind
        setTimeout(() => {
            if (!roomRef.current || !containerRef.current) return;
            
            console.log("[CoreSDK] Re-binding now...");
            roomRef.current.bindHtmlElement(containerRef.current);
            roomRef.current.refreshViewSize();
            
            if (role === 'teacher') {
                try {
                    roomRef.current.setGlobalState({ backgroundColor: { r: 240, g: 248, b: 255 } });
                } catch (e) {
                    console.log("Re-bind BG set failed", e);
                }
            }

            // 3. Restore View
            if (role !== 'teacher') {
                roomRef.current.setViewMode("follower");
            }
            roomRef.current.moveCamera({ centerX: 0, centerY: 0, scale: 1, animationMode: "continuous" });
            console.log("[CoreSDK] Re-bind Complete");
        }, 100);
    };

    const isColorActive = (c: number[]) => activeColor[0] === c[0] && activeColor[1] === c[1] && activeColor[2] === c[2];

    // Loading
    if (!isMounted || !sdkLoaded) {
        return (
            <div className={`flex items-center justify-center h-full border-2 border-dashed border-gray-300 rounded-lg ${className || ''}`} style={{ backgroundColor: '#f1f2f6' }}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading SDK...</p>
                </div>
            </div>
        );
    }

    // Main Render
    return (
        <div className={className} style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: '#f1f2f6', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* 1. 狀態顯示 (Debug: 顯示所有關鍵同步資訊) */}
            <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 999, background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '11px', padding: '4px 8px', pointerEvents: 'none', borderRadius: '0 0 8px 0' }}>
                <span style={{ color: role==='teacher'?'#4ade80':'#fbbf24', fontWeight: 'bold' }}>{role?.toUpperCase()}</span> | {region} | {phase} | {viewMode} | {cameraState} | ID:..{roomUuid.slice(-6)}
            </div>

            {/* 2. 白板 (Canvas) - Added Green Border for Visibility Check */}
            <div 
                ref={containerRef} 
                style={{ 
                    flex: 1, 
                    width: '100%', 
                    height: '100%', 
                    minHeight: '400px', 
                    touchAction: 'none',
                    border: '4px solid #10b981' // Green Border for Visual Proof
                }} 
            />

            {/* 3. 學生專用透明遮罩 (Physical Guard) - 防止學生手動亂動，但允許 SDK 同步 */}
            {role !== 'teacher' && (
                <div 
                    style={{
                        position: 'absolute', inset: 0, zIndex: 20, cursor: 'not-allowed', background: 'transparent'
                    }}
                    title="視角跟隨中"
                />
            )}

            {/* 4. 老師工具欄 */}
            {role === 'teacher' && (
                <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                        <ToolButton active={activeTool === 'pencil'} onClick={() => setTool('pencil')} icon="✏️" />
                        <ToolButton active={activeTool === 'eraser'} onClick={() => setTool('eraser')} icon="🧹" />
                        <ToolButton active={activeTool === 'selector'} onClick={() => setTool('selector')} icon="✋" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                        <ColorDot color="#DC2626" active={isColorActive([220, 38, 38])} onClick={() => setColor([220, 38, 38])} />
                        <ColorDot color="#2563EB" active={isColorActive([37, 99, 235])} onClick={() => setColor([37, 99, 235])} />
                        <ColorDot color="#000000" active={isColorActive([0, 0, 0])} onClick={() => setColor([0, 0, 0])} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <ToolButton active={false} onClick={clearScene} icon="🗑️" />
                        <ToolButton active={false} onClick={forceFix} icon="🎯" />
                    </div>
                </div>
            )}

            {/* 5. 學生專用：萬用修復按鈕 - Updated to "Nuclear Re-Bind" */}
            {role !== 'teacher' && (
                 <button 
                    onClick={forceFix}
                    style={{
                        position: 'absolute', bottom: '20px', right: '20px', zIndex: 100,
                        padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none',
                        borderRadius: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold'
                    }}
                 >
                    🛠️ 畫面空白/跑掉請點我
                 </button>
            )}
        </div>
    );
});

const ToolButton = ({ active, onClick, icon }: any) => (
    <button onClick={onClick} style={{ padding: '8px', borderRadius: '4px', background: active ? '#e0f2fe' : 'transparent', border: active ? '1px solid #0ea5e9' : '1px solid transparent', cursor: 'pointer', fontSize: '18px' }}>{icon}</button>
);
const ColorDot = ({ color, active, onClick }: any) => (
    <button onClick={onClick} style={{ width: '20px', height: '20px', borderRadius: '50%', background: color, border: active ? '2px solid #333' : '2px solid transparent', cursor: 'pointer' }} />
);

BoardImpl.displayName = "BoardImpl";
export default BoardImpl;