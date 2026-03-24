'use client';

import { AppIntegration, PAYMENT_TYPES, AI_META, PAYMENT_META, EMAIL_META, CHANNEL_META, EMAIL_TYPES } from '../_types';
import { ExecutionEnvironment, EXECUTION_ENVIRONMENT_META } from '@/lib/platform-agents';

interface ConnectedAppsListProps {
    apps: AppIntegration[];
    aiTypes: string[];
    openModal: (app: AppIntegration) => void;
}

export default function ConnectedAppsList({ apps, aiTypes, openModal }: ConnectedAppsListProps) {
    if (apps.length === 0) return null;

    return (
        <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-200 dark:border-gray-700 pb-2">
                <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                已連接的服務 ({apps.length})
            </h2>
            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">類型</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">名稱</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">建立時間</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {apps.map((app) => {
                            const isPayment = PAYMENT_TYPES.includes(app.type);
                            const isAI = aiTypes.includes(app.type);
                            const isEmail = EMAIL_TYPES.includes(app.type);

                            let meta;
                            if (isPayment) {
                                meta = PAYMENT_META[app.type];
                            } else if (isAI) {
                                meta = AI_META[app.type];
                            } else if (isEmail) {
                                meta = EMAIL_META[app.type];
                            } else {
                                meta = CHANNEL_META[app.type];
                            }

                            const badgeColor = meta?.badge || 'bg-gray-100 text-gray-800';
                            const label = meta?.label || app.type;
                            const icon = meta?.icon;

                            return (
                                <tr key={app.integrationId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded ${badgeColor}`}>
                                            {icon && <span>{icon}</span>}{label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        <div>
                                            {app.name}
                                            {app.type === 'ASK_PLAN_AGENT' && app.config?.executionEnvironment && (() => {
                                                const env = app.config.executionEnvironment as ExecutionEnvironment;
                                                const envMeta = EXECUTION_ENVIRONMENT_META[env];
                                                return envMeta ? (
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded ${envMeta.badge}`}>
                                                            <span>{envMeta.icon}</span>
                                                            {envMeta.label}
                                                        </span>
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                        {app.type === 'AI_CHATROOM' && app.config?.linkedServiceId && (() => {
                                            const linked = apps.find(a => a.integrationId === app.config?.linkedServiceId);
                                            const model = Array.isArray(linked?.config?.models)
                                                ? linked?.config?.models[0]
                                                : typeof linked?.config?.models === 'string'
                                                    ? linked?.config?.models.split(',')[0]
                                                    : null;
                                            return linked ? (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                                                        {AI_META[linked.type]?.icon} {linked.name}{model ? ` · ${model}` : ''}
                                                    </span>
                                                </div>
                                            ) : null;
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 py-1 text-xs font-bold rounded ${app.status === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                                            {app.status === 'ACTIVE' ? '啟用' : '停用'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(app.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => openModal(app)}
                                                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 font-medium py-2 px-4 rounded-lg transition-colors inline-block"
                                            >
                                                詳細
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
