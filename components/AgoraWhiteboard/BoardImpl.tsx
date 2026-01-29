"use client";

import React, { useImperativeHandle, forwardRef, useEffect, useRef, useState } from 'react';
import { createFastboard, FastboardApp } from "@netless/fastboard";
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

const BoardImpl = forwardRef<AgoraWhiteboardRef, AgoraWhiteboardProps>((props, ref) => {
    const { roomUuid, roomToken, appIdentifier, userId, className } = props;
    
    // ★★★ 鎖定 SG 區域 ★★★
    const fixedRegion = "sg"; 

    const containerRef = useRef<HTMLDivElement>(null);
    const appInstanceRef = useRef<FastboardApp | null>(null);
    const [isLayoutReady, setIsLayoutReady] = useState(false);
    const [status, setStatus] = useState("初始化中...");

    // 1. 尺寸守衛 (保持不變)
    useEffect(() => {
        const div = containerRef.current;
        if (!div) return;
        const checkSize = () => {
            if (div.clientWidth > 0 && div.clientHeight > 0) {
                console.log(`[Fastboard] Container Layout Ready: ${div.clientWidth}x${div.clientHeight}`);
                setIsLayoutReady(true);
                return true;
            }
            return false;
        };
        if (checkSize()) return;
        const observer = new ResizeObserver(() => { if (checkSize()) observer.disconnect(); });
        observer.observe(div);
        const timer = setTimeout(() => { if (!isLayoutReady) setIsLayoutReady(true); }, 1000);
        return () => { observer.disconnect(); clearTimeout(timer); };
    }, []);

    // 2. 初始化與掛載 (修正 bind -> mount)
    useEffect(() => {
        if (!isLayoutReady || !containerRef.current || appInstanceRef.current) return;

        let isMounted = true;
        const targetDiv = containerRef.current;

        const initFastboard = async () => {
            try {
                setStatus("創建實例中...");
                
                // 2.1 創建 App (添加 container 參數)
                const fastboard = await createFastboard({
                    sdkConfig: {
                        appIdentifier,
                        region: fixedRegion as any,
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
                });

                if (!isMounted) {
                    fastboard.destroy();
                    return;
                }

                // 2.2 實例創建完成，直接保存引用
                console.log('[Fastboard] Fastboard instance created successfully');
                
                appInstanceRef.current = fastboard;
                setStatus("已連接");
                console.log('[Fastboard] Instance ready!');

                // 2.3 設定工具 (使用 Vanilla SDK 的高層 API，更安全)
                setTimeout(() => {
                    try {
                        // 檢查可寫狀態 (修正類型比較問題)
                        const isWritable = fastboard.room?.isWritable || false;
                        console.log(`[Fastboard] Room writable: ${isWritable}`);
                        
                        // 設定紅色筆刷 (Vanilla SDK 直接有這些方法，不用去 call room.setMemberState)
                        fastboard.setAppliance('pencil');
                        fastboard.setStrokeColor([220, 38, 38]);
                        fastboard.setStrokeWidth(4);

                        // 注入測試標記
                        (window as any).__fastboard_ready = true;
                        console.log('[Fastboard] Tools configured successfully');
                    } catch(e) { 
                        console.warn('[Fastboard] Tool setup warning:', e); 
                    }
                }, 500);

            } catch (e: any) {
                console.error('[Fastboard] Init Failed:', e);
                setStatus(`錯誤: ${e.message || '未知錯誤'}`);
            }
        };

        initFastboard();

        return () => {
            isMounted = false;
            if (appInstanceRef.current) {
                console.log('[Fastboard] Destroying...');
                appInstanceRef.current.destroy();
                appInstanceRef.current = null;
            }
        };
    }, [isLayoutReady, roomUuid, roomToken, appIdentifier, userId]);

    // 3. 外部方法
    useImperativeHandle(ref, () => ({
        insertPDF: async (url, title) => { 
            if (appInstanceRef.current) await appInstanceRef.current.insertDocs({ fileType: 'pdf', url, title } as any); 
        },
        leave: async () => { 
            if (appInstanceRef.current) try { await appInstanceRef.current.destroy(); } catch (e) {} 
        }
    }));

    return (
        <div 
            className={className}
            style={{ 
                width: '100%', height: '100%', position: 'relative', isolation: 'isolate',
                display: 'flex', flexDirection: 'column', backgroundColor: '#f1f2f6', overflow: 'hidden'
            }}
        >
            <div style={{
                position: 'absolute', top: 0, left: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', padding: '4px'
            }}>
                Region: {fixedRegion} | Status: {status} | Layout: {isLayoutReady ? "Ready" : "Waiting"}
            </div>

            <div 
                ref={containerRef}
                data-testid="agora-whiteboard-wrapper" 
                style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}
            >
                {status !== "已連接" && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 z-10 bg-[#f1f2f6]">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-blue-500 rounded-full animate-spin"></div>
                            <div className="text-xs">{status}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default BoardImpl;