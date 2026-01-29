"use client";

import React, { useImperativeHandle, forwardRef, useEffect } from 'react';
import { useFastboard, Fastboard } from '@netless/fastboard-react';

// ★★★ 核心樣式：這行決定了白板能不能長出來 ★★★
import "@netless/window-manager/dist/style.css";

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
}

const AgoraWhiteboard = forwardRef<AgoraWhiteboardRef, AgoraWhiteboardProps>((props, ref) => {
    const { roomUuid, roomToken, appIdentifier, userId, region = "sg", className } = props;

    // 1. 使用官方 Hook 初始化
    const app = useFastboard(() => {
        // 檢查是否在 headless 環境中
        const isHeadless = typeof window !== 'undefined' && 
            (window.navigator.webdriver === true || 
             !window.screen || 
             window.screen.width === 0 || 
             window.screen.height === 0);

        console.log('[AgoraWhiteboard] Environment check:', { isHeadless, hasOffscreenCanvas: typeof window !== 'undefined' && 'OffscreenCanvas' in window });

        return {
            sdkConfig: {
                appIdentifier,
                region: region as any,
            },
            joinRoom: {
                uid: userId,
                uuid: roomUuid,
                roomToken,
                isWritable: true,
            },
            managerConfig: {
                cursor: true,
            },
            // ★★★ 條件性啟用 Appliance Plugin (只在非 headless 環境且支持 OffscreenCanvas 時) ★★★
            enableAppliancePlugin: !isHeadless && typeof window !== 'undefined' && 'OffscreenCanvas' in window ? {
                cdn: {
                    // 使用 CDN 版本的 worker
                    fullWorkerUrl: 'https://cdn.jsdelivr.net/npm/@netless/appliance-plugin@0.1.0/dist/fullWorker.js',
                    subWorkerUrl: 'https://cdn.jsdelivr.net/npm/@netless/appliance-plugin@0.1.0/dist/subWorker.js',
                }
            } : undefined,
        };
    });

    // Debug: Log app initialization
    useEffect(() => {
        console.log('[AgoraWhiteboard] Component mounted', { roomUuid, userId });
        if (app) {
            console.log('[AgoraWhiteboard] Fastboard app instance created');
            // ★★★ 暴露 app 到 window 以便 E2E 測試檢查 ★★★
            if (typeof window !== 'undefined') {
                (window as any).agoraWhiteboardApp = app;
            }
        }
    }, [app, roomUuid, userId]);

    // ★★★ 新增：WebGL/Canvas 診斷與強制初始化 ★★★
    useEffect(() => {
        const checkWebGLSupport = () => {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl', { willReadFrequently: true }) as WebGLRenderingContext | null;
                
                if (gl) {
                    console.log('[WebGL Check]', {
                        hasWebGL: true,
                        hasOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
                        webGLVendor: gl.getParameter(gl.VENDOR),
                        webGLRenderer: gl.getParameter(gl.RENDERER),
                        webGLVersion: gl.getParameter(gl.VERSION)
                    });
                } else {
                    console.log('[WebGL Check]', { hasWebGL: false, hasOffscreenCanvas: typeof OffscreenCanvas !== 'undefined' });
                }

                // 嘗試強制創建一個測試 Canvas 來觸發 WebGL 初始化
                if (gl) {
                    const testCanvas = document.createElement('canvas');
                    testCanvas.width = 1;
                    testCanvas.height = 1;
                    testCanvas.style.display = 'none';
                    document.body.appendChild(testCanvas);

                    const testGL = testCanvas.getContext('webgl', { willReadFrequently: true }) as WebGLRenderingContext | null;
                    if (testGL) {
                        testGL.clearColor(0, 0, 0, 1);
                        testGL.clear(testGL.COLOR_BUFFER_BIT);
                        console.log('[WebGL Test] 成功創建測試 WebGL 上下文');
                    }

                    // 清理測試 canvas
                    setTimeout(() => {
                        if (document.body.contains(testCanvas)) {
                            document.body.removeChild(testCanvas);
                        }
                    }, 1000);
                }
            } catch (e) {
                console.error('[WebGL Check] 錯誤:', e);
            }
        };

        // 延遲檢查以確保 DOM 準備就緒
        const timer = setTimeout(checkWebGLSupport, 2000);
        return () => clearTimeout(timer);
    }, []);

    // ★★★ 3. 強制 Fastboard 佈局刷新 (針對 WindowManager) ★★★
    useEffect(() => {
        if (app?.manager) {
            const refreshManager = () => {
                try {
                    console.log('[AgoraWhiteboard] Manager refresh triggered');
                    // 如果有 WindowManager，嘗試刷新其佈局
                    if ((app.manager as any).refresh) {
                        (app.manager as any).refresh();
                    }
                    window.dispatchEvent(new Event('resize'));
                } catch (e) {
                    console.warn('[AgoraWhiteboard] Refresh failed', e);
                }
            };
            
            const timer = setTimeout(refreshManager, 2000);
            return () => clearTimeout(timer);
        }
    }, [app, app?.manager]);

    // 2. 自動處理權限與工具初始化
    useEffect(() => {
        const setupRoom = async () => {
            if (!app?.room) return;
            
            console.log('[AgoraWhiteboard] Room found, phase:', (app.room as any).phase);
            
            // ★★★ Debug: 詳細狀態檢查 ★★★
            console.log('[AgoraWhiteboard Status]', {
                isWritable: app.room.isWritable,
                memberState: app.room.state.memberState,
                phase: (app.room as any).phase, 
                roomState: app.room.state
            });

            // 確保加入時是可寫狀態
            if (!app.room.isWritable) {
                console.log('[AgoraWhiteboard] Setting room to writable');
                await app.room.setWritable(true).catch(console.warn);
            }
            
            // 設定預設筆刷
            console.log('[AgoraWhiteboard] Setting member state');
            app.room.setMemberState({
                currentApplianceName: 'pencil' as any,
                strokeColor: [220, 38, 38],
                strokeWidth: 4
            });

            // ★★★ 注入「喚醒」與就緒訊號 ★★★
            if (typeof window !== 'undefined') {
                (window as any).__fastboard_ready = true;
                
                // 強制觸發一次 resize 讓 WindowManager 重新佈局
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                    console.log('[AgoraWhiteboard] Wake up: Triggered manual resize');
                }, 1000);
            }
        };

        setupRoom();
    }, [app, app?.room]); // 關鍵：增加 app.room 作為依賴項

    // ★★★ Prompt Request 2: 強制修復按鈕邏輯 ★★★
    const handleForceFix = async () => {
        if (!app?.room) return;
        try {
            console.log('[AgoraWhiteboard] 執行強制修復...');
            await app.room.setWritable(true);
            app.room.setMemberState({
                currentApplianceName: 'pencil' as any,
                strokeColor: [220, 38, 38],
                strokeWidth: 4
            });
            console.log('已執行強制修復指令', {
                isWritable: app.room.isWritable,
                memberState: app.room.state.memberState
            });
        } catch (e) {
            console.error('強制修復失敗', e);
        }
    };

    // 3. 暴露 PDF 方法與 Leave 方法
    useImperativeHandle(ref, () => ({
        insertPDF: async (url: string, title: string = 'Course Material') => {
            if (!app) return;
            try {
                await app.insertDocs({ fileType: 'pdf', url, title } as any);
            } catch (error) {
                console.error("Insert PDF failed", error);
            }
        },
        leave: async () => {
            if (app) {
                try { await app.destroy(); } catch (e) {}
            }
        }
    }));

    // 4. 渲染標準組件
    // ★★★ 重點：外層 div 必須有明確的 style 寬高，不能只靠 class ★★★
    // ★★★ Prompt Request 3: CSS 點擊穿透檢查 (Explicit pointerEvents: auto) ★★★
    console.log('[AgoraWhiteboard] Rendering', { hasApp: !!app });
    return (
        <div 
            className={className} 
            style={{ 
                width: '100%', 
                height: '100%', 
                position: 'relative', 
                background: '#f1f2f6',
                pointerEvents: 'auto' // Explicitly set to auto
            }}
            data-testid="agora-whiteboard-wrapper"
        >
            {/* ★★★ 狀態指示器 ★★★ */}
            <div 
                style={{ position: 'absolute', top: 10, left: 10, zIndex: 50 }}
                data-testid="wb-status-indicator"
            >
                <span style={{
                    padding: '4px 8px',
                    background: app?.room?.isWritable ? '#10b981' : '#6b7280',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                    {app?.room?.isWritable ? '可寫' : '唯讀'}
                </span>
            </div>

            {/* ★★★ Prompt Request 2: 強制修復按鈕 UI ★★★ */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 50, pointerEvents: 'auto' }}>
                <button 
                    onClick={handleForceFix}
                    id="btn-fix-whiteboard"
                    data-testid="btn-fix-whiteboard"
                    style={{
                        padding: '6px 12px',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                >
                    修復畫筆 (Force Fix)
                </button>
            </div>

            {app ? (
                <>
                    {console.log('[AgoraWhiteboard] Rendering Fastboard component')}
                    <div 
                        data-testid="fastboard-canvas-root" 
                        style={{ width: '100%', height: '100%', flex: 1, position: 'relative' }}
                    >
                        <Fastboard app={app} language="zh-CN" theme="light" />
                    </div>
                </>
            ) : (
                <div 
                    className="absolute inset-0 flex items-center justify-center"
                    data-testid="wb-loading"
                >
                    <span className="text-slate-400 text-sm">正在連接白板...</span>
                </div>
            )}
        </div>
    );
});

AgoraWhiteboard.displayName = 'AgoraWhiteboard';
export default AgoraWhiteboard;