// components/AgoraWhiteboard/index.tsx
"use client";

import dynamic from 'next/dynamic';
import React from 'react';

// 匯出型別
export type { AgoraWhiteboardRef } from './BoardImpl';

// 動態載入 AgoraWhiteboard 組件，並強制關閉 SSR
const AgoraWhiteboardComponent = dynamic(
    () => import('./BoardImpl'), 
    { 
        ssr: false, // 關鍵：這行保護 Server 不會執行 Fastboard 程式碼
        loading: () => (
            <div className="w-full h-full flex items-center justify-center bg-slate-50">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        )
    }
);

// 封裝轉發 Ref
const AgoraWhiteboard = React.forwardRef((props: any, ref) => {
    return <AgoraWhiteboardComponent {...props} ref={ref} />;
});

AgoraWhiteboard.displayName = 'AgoraWhiteboardLoader';

export default AgoraWhiteboard;