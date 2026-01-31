"use client";

import React, { useImperativeHandle, forwardRef, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getPdfLib } from '@/lib/pdfUtils';

export interface AgoraWhiteboardRef {
    insertPDF: (url: string, title?: string) => Promise<void>;
    leave: () => Promise<void>;
    getState: () => {
        activeTool: string;
        activeColor: number[];
        currentPage: number;
        totalPages: number;
        phase: string;
        viewMode: string;
    };
    setTool: (tool: 'pencil' | 'eraser' | 'selector') => void;
    setColor: (color: number[]) => void;
    clearScene: () => void;
    forceFix: () => void;
    prevPage: () => void;
    nextPage: () => void;
}

interface AgoraWhiteboardProps {
    roomUuid: string;
    roomToken: string;
    appIdentifier: string;
    userId: string;
    region?: string;
    className?: string;
    role?: 'teacher' | 'student';
    courseId?: string;
}

type ToolType = "pencil" | "eraser" | "selector";

const BoardImpl = forwardRef<AgoraWhiteboardRef, AgoraWhiteboardProps>((props, ref) => {
    // 1. 使用動態 Region，預設為 sg
    const { roomUuid, roomToken, appIdentifier, userId, className, role = 'student', region = 'sg', courseId } = props;

    // Hooks
    const containerRef = useRef<HTMLDivElement>(null);
    const roomRef = useRef<any>(null);
    
    // Debug UI
    const [viewMode, setViewMode] = useState<string>("-"); 
    // const [cameraState, setCameraState] = useState<string>("X:0 Y:0 S:1"); 
    const [status, setStatus] = useState("載入 SDK...");
    const [phase, setPhase] = useState("Init");
    const [sdkLoaded, setSdkLoaded] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    
    // UI State
    const [activeTool, setActiveTool] = useState<ToolType>("pencil");
    const [activeColor, setActiveColor] = useState<number[]>([220, 38, 38]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

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
                    
                    // Check if element is still in DOM
                    if (!targetDiv.isConnected) {
                        console.warn("[CoreSDK] Target div detached from DOM, aborting bind");
                        return;
                    }

                    console.log("[CoreSDK] Binding HTML Element (Delayed)");
                    try {
                        room.bindHtmlElement(targetDiv);
                    } catch(e) {
                         console.error("[CoreSDK] Bind failed:", e);
                    }
                    
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

                /*
                // 監聽相機變化 (Debug 用)
                room.callbacks.on("onCameraUpdated", (camera: any) => {
                   setCameraState(`X:${Math.round(camera.centerX)} Y:${Math.round(camera.centerY)} S:${camera.scale.toFixed(1)}`);
                });
                */

                // 監聽頁面變換
                room.callbacks.on("onRoomStateChanged", (modifyState: any) => {
                    if (modifyState.sceneState) {
                         setTotalPages(modifyState.sceneState.scenes.length);
                         setCurrentPage(modifyState.sceneState.index + 1);
                    }
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
                if (room.state?.sceneState) {
                    setTotalPages(room.state.sceneState.scenes.length);
                    setCurrentPage(room.state.sceneState.index + 1);
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
        getState: () => ({
            activeTool,
            activeColor,
            currentPage,
            totalPages,
            phase,
            viewMode
        }),
        setTool,
        setColor,
        clearScene,
        forceFix,
        prevPage,
        nextPage,
        insertPDF: async (url, title) => {
            if (!roomRef.current || !roomRef.current.isWritable) return;
            try {
                console.log("[BoardImpl] Converting PDF to Scenes:", url);
                setStatus("處理 PDF 中...");
                
                // 1. Load PDF Library & Document
                const pdfjs = await getPdfLib();
                const loadingTask = pdfjs.getDocument(url);
                const pdf = await loadingTask.promise;
                const pageCount = pdf.numPages;
                console.log("[BoardImpl] PDF Pages:", pageCount);

                // 2. Render pages to images (Scenes) - Sequential & Compressed to avoid socket crash
                const dir = `/pdf/${uuidv4()}`;
                
                for (let i = 1; i <= pageCount; i++) {
                    const page = await pdf.getPage(i);
                    // Optimized: Reduced scale from 1.5 to 1.2 for balance between quality and size
                    const viewport = page.getViewport({ scale: 1.2 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context!, viewport }).promise;
                    
                    // Critical Fix: Use JPEG (0.6) instead of PNG to stay under WebSocket message limit (512KB)
                    const imgData = canvas.toDataURL('image/jpeg', 0.6);
                    
                    const scene = {
                        name: `${i}`,
                        ppt: {
                            src: imgData,
                            width: viewport.width,
                            height: viewport.height,
                        },
                    };
                    
                    // Insert scenes ONE BY ONE to avoid large payload
                    roomRef.current.putScenes(dir, [scene]);
                    
                    // Update status for UX
                    if (i % 2 === 0 || i === pageCount) setStatus(`轉換中: ${i}/${pageCount}`);
                }
                
                // Switch to the first page of the new doc
                // IMPORTANT: Ensure directory exists and switched correctly
                console.log("[BoardImpl] Switching to scene path:", `${dir}/1`);
                roomRef.current.setScenePath(`${dir}/1`);
                
                // Force camera reset to center and fit the new slide
                setTimeout(() => {
                    if (!roomRef.current) return;
                    
                    // Get current scene to calculate optimal scale
                    const sceneState = roomRef.current.state.sceneState;
                    if (sceneState && sceneState.scenes && sceneState.scenes.length > 0) {
                        const currentScene = sceneState.scenes[sceneState.index];
                        if (currentScene?.ppt) {
                            const pptWidth = currentScene.ppt.width;
                            const pptHeight = currentScene.ppt.height;
                            
                            // Get container dimensions
                            if (containerRef.current) {
                                const containerWidth = containerRef.current.clientWidth;
                                const containerHeight = containerRef.current.clientHeight;
                                
                                // Calculate scale to fit (with padding based on screen size)
                                // Mobile/small screens: 95% to maximize space
                                // Desktop: 90% for comfortable viewing
                                const isMobile = containerWidth < 768;
                                const padding = isMobile ? 0.95 : 0.9;
                                
                                const scaleX = (containerWidth * padding) / pptWidth;
                                const scaleY = (containerHeight * padding) / pptHeight;
                                
                                // Use the smaller scale to ensure entire PDF fits
                                // No upper limit cap - allow scaling up for small PDFs on large screens
                                // But set minimum to prevent too small display on mobile
                                const optimalScale = Math.max(Math.min(scaleX, scaleY), 0.2);
                                
                                console.log("[BoardImpl] Auto-fit scale:", optimalScale, "Container:", containerWidth, "x", containerHeight, "PPT:", pptWidth, "x", pptHeight, "Mobile:", isMobile);
                                roomRef.current.moveCamera({ centerX: 0, centerY: 0, scale: optimalScale });
                            } else {
                                roomRef.current.moveCamera({ centerX: 0, centerY: 0, scale: 0.8 });
                            }
                        }
                    }
                    roomRef.current?.refreshViewSize();
                }, 500);

                setStatus(`PDF 已載入 (${pageCount} 頁)`);
                setTimeout(() => setStatus(""), 3000);

            } catch (e: any) { 
                console.error("[BoardImpl] insertPDF Error:", e);
                setStatus(`PDF 錯誤: ${e.message}`);
            }
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

    const prevPage = () => {
        if (!roomRef.current) return;
        const { index } = roomRef.current.state.sceneState;
        if (index > 0) roomRef.current.setSceneIndex(index - 1);
    };

    const nextPage = () => {
        if (!roomRef.current) return;
        const { index, scenes } = roomRef.current.state.sceneState;
        if (index < scenes.length - 1) roomRef.current.setSceneIndex(index + 1);
    };

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
            {/* 白板 (Canvas) */}
            <div 
                ref={containerRef} 
                style={{ 
                    flex: 1, 
                    width: '100%', 
                    height: '100%', 
                    minHeight: '400px', 
                    touchAction: 'none',
                    position: 'relative',
                    zIndex: 1
                }} 
            />

            {/* 學生專用透明遮罩 (Physical Guard) - 防止學生手動亂動，但允許 SDK 同步 */}
            {role !== 'teacher' && (
                <div 
                    style={{
                        position: 'absolute', inset: 0, zIndex: 20, cursor: 'not-allowed', background: 'transparent'
                    }}
                    title="視角跟隨中"
                />
            )}

        </div>
    );
});

const ToolButton = ({ active, onClick, icon, title }: any) => (
    <button 
        onClick={onClick} 
        title={title}
        style={{ 
            padding: '10px', 
            borderRadius: '12px', 
            background: active ? '#eff6ff' : 'transparent', 
            border: active ? '2px solid #000000' : '2px solid transparent', 
            cursor: 'pointer', 
            fontSize: '22px',
            transition: 'all 0.2s ease',
            filter: active ? 'none' : 'grayscale(100%)',
            opacity: active ? 1 : 0.5,
            boxShadow: active ? '0 2px 5px rgba(0, 0, 0, 0.15)' : 'none'
        }}
    >
        {icon}
    </button>
);
const ColorDot = ({ color, active, onClick }: any) => (
    <div 
        onClick={onClick} 
        style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: '50%', 
            backgroundColor: color,
            border: active ? '3px solid #000000' : '2px solid #d1d5db', 
            boxShadow: active ? '0 0 0 2px white inset, 0 2px 6px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: active ? 'scale(1.15)' : 'scale(1)',
            opacity: active ? 1 : 0.7
        }} 
    />
);

BoardImpl.displayName = "BoardImpl";
export default BoardImpl;