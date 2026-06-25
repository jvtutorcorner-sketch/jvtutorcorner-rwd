"use client";

import dynamic from 'next/dynamic';
import React from 'react';
import { WhiteboardErrorBoundary } from './WhiteboardErrorBoundary';

export type {
    AgoraWhiteboardRef,
    PdfInsertErrorCode,
    PdfInsertResult,
} from './BoardImpl';
export { PdfInsertError } from './BoardImpl';

const AgoraWhiteboardComponent = dynamic(
    () => import('./BoardImpl'),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-full flex items-center justify-center bg-slate-50">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        )
    }
);

const AgoraWhiteboard = React.forwardRef((props: any, ref) => {
    return (
        <WhiteboardErrorBoundary>
            <AgoraWhiteboardComponent {...props} ref={ref} />
        </WhiteboardErrorBoundary>
    );
});

AgoraWhiteboard.displayName = 'AgoraWhiteboardLoader';

export default AgoraWhiteboard;
