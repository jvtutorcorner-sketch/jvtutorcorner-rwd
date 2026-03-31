import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

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
    line: 'LINE Push',
    push: 'Push Notification',
};

export function NotificationNode({ id, data, isConnectable }: any) {
    const channel = data.config?.channel || 'push';

    return (
        <div className="bg-white border-2 border-violet-500 rounded-lg shadow-lg w-56 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-violet-500 border-2 border-white"
            />
            <div className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>{CHANNEL_ICONS[channel] || '🔔'}</span> Notify
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            <div className="px-3 py-2">
                <div className="text-xs font-bold text-gray-700">{data.label}</div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-violet-500 border-2 border-white"
            />
        </div>
    );
}
