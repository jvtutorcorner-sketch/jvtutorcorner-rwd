'use client';
import { Handle, Position } from '@xyflow/react';

const CHANNEL_ICONS: Record<string, string> = {
    slack: '💬',
    discord: '🎮',
    telegram: '✈️',
    line: '🟢',
    push: '📱',
};

const CHANNEL_LABELS: Record<string, string> = {
    slack: 'Slack',
    discord: 'Discord',
    telegram: 'Telegram',
    line: 'LINE Notify',
    push: 'Push Notification',
};

export function NotificationNode({ data, isConnectable }: any) {
    const channel = data.config?.channel || 'push';

    return (
        <div className="bg-white border-2 border-violet-500 rounded-lg shadow-md w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-violet-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
            <div className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white px-3 py-2 flex items-center gap-2 font-bold shadow-sm">
                <span>{CHANNEL_ICONS[channel] || '🔔'}</span> Notification
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">
                        {CHANNEL_LABELS[channel] || 'Push'}
                    </span>
                </div>
                <div className="mt-2 text-[10px] text-gray-500 italic truncate">
                    {data.config?.message || 'No message configured'}
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-violet-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
