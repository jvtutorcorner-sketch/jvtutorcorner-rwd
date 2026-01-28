"use client";

import React, { useImperativeHandle, forwardRef, useEffect } from 'react';
import { useFastboard, Fastboard, FastboardApp } from '@netless/fastboard-react';

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
    className?: string; // Allow custom styling for the container
}

const AgoraWhiteboard = forwardRef<AgoraWhiteboardRef, AgoraWhiteboardProps>((props, ref) => {
    const { 
        roomUuid, 
        roomToken, 
        appIdentifier, 
        userId, 
        region = "sg",
        className 
    } = props;

    // Initialize Fastboard
    // Documentation: https://github.com/netless-io/fastboard/tree/master/packages/fastboard-react
    const app = useFastboard(() => ({
        sdkConfig: {
            appIdentifier,
            region: region as any, // "sg" is valid but types might be strict
        },
        joinRoom: {
            uid: userId,
            uuid: roomUuid,
            roomToken,
        },
        // Setup default tool preferences (optional, but ensures best practices)
        managerConfig: {
            cursor: true,
        },
    }));

    // Log props and app state only after initial render
    useEffect(() => {
        console.log('[AgoraWhiteboard] Props received:', { roomUuid, roomToken: roomToken ? '***' : null, appIdentifier, userId, region });
        console.log('[AgoraWhiteboard] Fastboard app initialized:', !!app);
    }, [roomUuid, roomToken, appIdentifier, userId, region, app]);

    useImperativeHandle(ref, () => ({
        /**
         * Insert a PDF file into the whiteboard.
         * Note: For production use with multi-page PDFs, Agora usually requires
         * the "Projector" (Transcoding) service to convert PDF to images/vectors first.
         * However, Fastboard's `insertDocs` can handle basic insertions or rely on registered converters.
         * 
         * @param url Publicly accessible URL of the PDF (S3)
         * @param title Title of the document
         */
        insertPDF: async (url: string, title: string = 'Course Material') => {
            if (!app) {
                console.error("Board instance not ready.");
                return;
            }

            try {
                // insertDocs will automatically handle page creation for the document
                await app.insertDocs({
                    fileType: 'pdf',
                    url: url,
                    title: title
                } as any);
            } catch (error) {
                console.error("Error inserting PDF:", error);
                throw error;
            }
        },
        leave: async () => {
            if (app) {
               await app.destroy();
            }
        }
    }));

    return (
        <div 
             className={`w-full h-full relative ${className || ''}`}
             style={{ 
                 // Fallback inline styles to ensure full filling if Tailwind missing
                 minHeight: '400px',
                 flexGrow: 1,
                 display: 'flex',
                 flexDirection: 'column'
             }}
        >
            {app ? (
                <Fastboard 
                    app={app} 
                    language="zh-CN"
                    theme="light"
                    config={{
                        toolbar: {
                            enable: true,
                        },
                        redo_undo: {
                            enable: true,
                        },
                        page_control: {
                            enable: true,
                        },
                    }}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" />
                        <p>正在連接白板...</p>
                    </div>
                </div>
            )}
        </div>
    );
});

AgoraWhiteboard.displayName = 'AgoraWhiteboard';

export default AgoraWhiteboard;
