'use client';

import React from 'react';
import Editor from '@monaco-editor/react';
import { AI_SKILLS, getSkillById } from '@/lib/ai-skills';
import {
    AppIntegration, AI_META, DATABASE_META, LABEL_MAP,
    AI_CONTAINER_TYPES, DATABASE_TYPES,
} from '../_types';

interface AppConfigModalProps {
    app: AppIntegration;
    apps: AppIntegration[];
    aiTypes: string[];
    aiModelOptions: Record<string, string[]>;
    testResults: Record<string, { success: boolean; message: string; details?: any }>;
    testingId: string | null;
    // Editable state
    editedConfig: Record<string, any>;
    editedName: string;
    editedStatus: string;
    editedScriptEnabled: boolean;
    editedCustomScript: string;
    showSecret: boolean;
    isSavingConfig: boolean;
    saveResult: { success: boolean; message: string } | null;
    // Simulate (LINE text)
    simulating: boolean;
    simInput: string;
    simReply: string | null;
    // Push
    pushTesting: boolean;
    pushMessage: string;
    pushTitle: string;
    pushResult: string | null;
    // Payment test
    testPayAmount: string;
    testPayProductName: string;
    // Image test
    imageTestFile: File | null;
    imageTestPreview: string | null;
    imageTestResult: string | null;
    imageTesting: boolean;
    // Email test
    showTestEmail: boolean;
    testEmailData: { to: string; subject: string; html: string };
    testSending: boolean;
    testResult: { success: boolean; message: string } | null;
    // Setters
    setEditedConfig: (c: Record<string, any>) => void;
    setEditedName: (v: string) => void;
    setEditedStatus: (v: string) => void;
    setEditedScriptEnabled: (v: boolean) => void;
    setEditedCustomScript: (v: string) => void;
    setShowSecret: (v: boolean) => void;
    setSaveResult: (v: { success: boolean; message: string } | null) => void;
    setSimInput: (v: string) => void;
    setSimReply: (v: string | null) => void;
    setPushMessage: (v: string) => void;
    setPushTitle: (v: string) => void;
    setPushResult: (v: string | null) => void;
    setTestPayAmount: (v: string) => void;
    setTestPayProductName: (v: string) => void;
    setImageTestFile: (f: File | null) => void;
    setImageTestPreview: (v: string | null) => void;
    setImageTestResult: (v: string | null) => void;
    setImageTesting: (v: boolean) => void;
    setShowTestEmail: (v: boolean) => void;
    setTestEmailData: (v: { to: string; subject: string; html: string }) => void;
    setTestSending: (v: boolean) => void;
    setTestResult: (v: { success: boolean; message: string } | null) => void;
    // Handlers
    onClose: () => void;
    onSave: () => Promise<void>;
    onTest: (app: AppIntegration) => Promise<void>;
    onAiTestPrompt: (app: AppIntegration) => Promise<void>;
    onSendTestEmail: (app: AppIntegration) => Promise<void>;
    onSimulateLine: (app: AppIntegration) => Promise<void>;
    onSimulateLineImage: (app: AppIntegration) => Promise<void>;
    onImageFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onPushLine: () => Promise<void>;
}

const SpinnerIcon = () => (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);

export default function AppConfigModal({
    app, apps, aiTypes, aiModelOptions, testResults, testingId,
    editedConfig, editedName, editedStatus, editedScriptEnabled, editedCustomScript,
    showSecret, isSavingConfig, saveResult,
    simulating, simInput, simReply,
    pushTesting, pushMessage, pushTitle, pushResult,
    testPayAmount, testPayProductName,
    imageTestFile, imageTestPreview, imageTestResult, imageTesting,
    showTestEmail, testEmailData, testSending, testResult,
    setEditedConfig, setEditedName, setEditedStatus, setEditedScriptEnabled, setEditedCustomScript,
    setShowSecret, setSaveResult,
    setSimInput, setSimReply,
    setPushMessage, setPushTitle, setPushResult,
    setTestPayAmount, setTestPayProductName,
    setImageTestFile, setImageTestPreview, setImageTestResult, setImageTesting,
    setShowTestEmail, setTestEmailData, setTestSending, setTestResult,
    onClose, onSave, onTest, onAiTestPrompt, onSendTestEmail,
    onSimulateLine, onSimulateLineImage, onImageFileChange, onPushLine,
}: AppConfigModalProps) {
    const isAI = aiTypes.includes(app.type);
    const isNonContainerAI = isAI && !AI_CONTAINER_TYPES.includes(app.type);

    const selectedModels: string[] = Array.isArray(editedConfig.models)
        ? editedConfig.models
        : typeof editedConfig.models === 'string'
            ? editedConfig.models.split(',').filter(Boolean)
            : [];

    const isSaveDisabled =
        isSavingConfig ||
        (JSON.stringify(editedConfig) === JSON.stringify(app.config || {}) &&
            editedName === app.name &&
            editedStatus === app.status) ||
        (isNonContainerAI && selectedModels.length > 1) ||
        (isNonContainerAI && selectedModels.length === 0);

    const saveLabel = isSavingConfig ? '儲存中...'
        : (isNonContainerAI && selectedModels.length > 1) ? '模型限選一個'
            : (isNonContainerAI && selectedModels.length === 0) ? '請選擇模型'
                : '儲存設定';

    return (
        <div
            className="fixed inset-0 z-[999] overflow-y-auto"
            aria-labelledby="modal-title"
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
                <div
                    className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity z-[999]"
                    aria-hidden="true"
                    onClick={onClose}
                />
                <div className="relative inline-block align-middle bg-white dark:bg-gray-800 rounded-lg text-left overflow-visible shadow-xl transform transition-all sm:align-middle sm:max-w-lg w-full max-h-[90vh] flex flex-col z-[1000]">
                    <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-y-auto flex-1">
                        <div className="sm:flex sm:items-start">
                            {/* Icon */}
                            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 sm:mx-0 sm:h-10 sm:w-10 overflow-hidden border border-blue-200 dark:border-blue-700 shadow-sm">
                                {app.type.toUpperCase() === 'LINE' && testResults[app.integrationId]?.details?.pictureUrl ? (
                                    <img src={testResults[app.integrationId].details.pictureUrl} alt="Bot Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <svg className="h-6 w-6 text-blue-600 dark:text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </div>

                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                                    詳細資訊 - {app.name}
                                </h3>
                                <div className="mt-4">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                        <strong>服務類型：</strong> {app.type}
                                    </p>

                                    {/* Name + Status */}
                                    <div className="space-y-4 mb-6">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">服務名稱:</label>
                                            <input
                                                type="text"
                                                className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                value={editedName}
                                                onChange={(e) => setEditedName(e.target.value)}
                                                placeholder="例如: 我的 LINE 機器人"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">連線狀態:</label>
                                            <select
                                                className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                value={editedStatus}
                                                onChange={(e) => setEditedStatus(e.target.value)}
                                            >
                                                <option value="ACTIVE">啟用 (ACTIVE)</option>
                                                <option value="INACTIVE">停用 (INACTIVE)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <h4 className="font-bold text-sm text-gray-800 dark:text-white mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">進階配置參數</h4>

                                    {/* Test result banner */}
                                    {testResults[app.integrationId] && (
                                        <div className={`text-sm p-3 rounded-lg mb-4 ${testResults[app.integrationId].success ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                                            <span className="font-bold text-base">{testResults[app.integrationId].success ? '✓ 測試成功' : '✗ 測試失敗'}</span>
                                            <p className="mt-1 break-all">{testResults[app.integrationId].message}</p>
                                        </div>
                                    )}

                                    {/* Save result */}
                                    {saveResult && (
                                        <div className={`text-sm p-3 rounded-lg mb-4 animate-in fade-in slide-in-from-top-1 duration-300 flex items-center justify-between ${saveResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border border-green-200 dark:border-green-800' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800'}`}>
                                            <span className="font-bold">{saveResult.message}</span>
                                            <button onClick={() => setSaveResult(null)} className="text-current opacity-50 hover:opacity-100">✕</button>
                                        </div>
                                    )}

                                    {/* Show secret toggle */}
                                    <div className="flex items-center gap-2 mb-4 px-1">
                                        <input
                                            type="checkbox"
                                            id="show-secret-toggle"
                                            checked={showSecret}
                                            onChange={(e) => setShowSecret(e.target.checked)}
                                            className="rounded text-blue-600 focus:ring-blue-500 bg-white border-gray-300"
                                        />
                                        <label htmlFor="show-secret-toggle" className="text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                                            顯示隱藏的內容 (解除星號)
                                        </label>
                                    </div>

                                    {/* Config fields */}
                                    <ConfigFields
                                        app={app}
                                        aiTypes={aiTypes}
                                        editedConfig={editedConfig}
                                        showSecret={showSecret}
                                        setEditedConfig={setEditedConfig}
                                    />

                                    {/* RESEND email test */}
                                    {app.type === 'RESEND' && (
                                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                            <button
                                                type="button"
                                                onClick={() => setShowTestEmail(!showTestEmail)}
                                                className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                                            >
                                                <span>{showTestEmail ? '▼' : '▶'}</span>
                                                測試寄送實際郵件 (可選)
                                            </button>
                                            {showTestEmail && (
                                                <div className="mt-4 space-y-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-inner">
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">收件者 (To)</label>
                                                        <input type="email" value={testEmailData.to} onChange={(e) => setTestEmailData({ ...testEmailData, to: e.target.value })} placeholder="您的測試信箱" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">主旨 (Subject)</label>
                                                        <input type="text" value={testEmailData.subject} onChange={(e) => setTestEmailData({ ...testEmailData, subject: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">內容 (HTML / Text)</label>
                                                        <textarea rows={3} value={testEmailData.html} onChange={(e) => setTestEmailData({ ...testEmailData, html: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => onSendTestEmail(app)}
                                                        disabled={testSending || !testEmailData.to}
                                                        className={`w-full py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${testSending ? 'bg-indigo-200 text-indigo-400 cursor-wait' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                                                    >
                                                        {testSending ? <><SpinnerIcon />正在發送測試郵件...</> : '🚀 發送測試郵件'}
                                                    </button>
                                                    {testResult && (
                                                        <div className={`p-3 rounded text-xs font-medium animate-in zoom-in-95 ${testResult.success ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                                            {testResult.success ? '✅ ' : '❌ '}{testResult.message}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* AI-specific config */}
                                    {isAI && (
                                        <AIConfigSection
                                            app={app}
                                            apps={apps}
                                            aiTypes={aiTypes}
                                            aiModelOptions={aiModelOptions}
                                            editedConfig={editedConfig}
                                            setEditedConfig={setEditedConfig}
                                            selectedModels={selectedModels}
                                        />
                                    )}

                                    {/* Webhook script editor */}
                                    {!['STRIPE', 'PAYPAL', 'ECPAY', ...aiTypes.filter(t => !AI_CONTAINER_TYPES.includes(t))].includes(app.type) && (
                                        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
                                            <div className="flex items-center justify-between mb-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editedScriptEnabled}
                                                        onChange={(e) => setEditedScriptEnabled(e.target.checked)}
                                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                    />
                                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">使用自訂 Webhook 腳本</span>
                                                </label>
                                            </div>
                                            {editedScriptEnabled && (
                                                <div className="border border-gray-300 dark:border-gray-700 rounded overflow-hidden shadow-inner">
                                                    <Editor
                                                        height="350px"
                                                        defaultLanguage="javascript"
                                                        theme="vs-dark"
                                                        value={editedCustomScript}
                                                        onChange={(val) => setEditedCustomScript(val || '')}
                                                        options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, automaticLayout: true }}
                                                    />
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-500 mt-2">勾選後將在收到訊息時優先執行此腳本，停止將訊息傳送給 AI 或原始處理函式。</p>
                                        </div>
                                    )}

                                    {/* AI prompt test */}
                                    {isAI && (
                                        <AiPromptTestSection
                                            app={app}
                                            simulating={simulating}
                                            simInput={simInput}
                                            simReply={simReply}
                                            setSimInput={setSimInput}
                                            onTest={() => onAiTestPrompt(app)}
                                        />
                                    )}

                                    {/* Test connection button (payment/channel/email/AI) */}
                                    <TestConnectionSection
                                        app={app}
                                        aiTypes={aiTypes}
                                        testingId={testingId}
                                        testPayAmount={testPayAmount}
                                        testPayProductName={testPayProductName}
                                        setTestPayAmount={setTestPayAmount}
                                        setTestPayProductName={setTestPayProductName}
                                        editedConfig={editedConfig}
                                        onTest={onTest}
                                    />

                                    {/* LINE-specific features */}
                                    {app.type.toUpperCase() === 'LINE' && (
                                        <LineFeatures
                                            app={app}
                                            simulating={simulating}
                                            simInput={simInput}
                                            simReply={simReply}
                                            pushTesting={pushTesting}
                                            pushMessage={pushMessage}
                                            pushTitle={pushTitle}
                                            pushResult={pushResult}
                                            imageTestFile={imageTestFile}
                                            imageTestPreview={imageTestPreview}
                                            imageTestResult={imageTestResult}
                                            imageTesting={imageTesting}
                                            setSimInput={setSimInput}
                                            setSimReply={setSimReply}
                                            setPushMessage={setPushMessage}
                                            setPushTitle={setPushTitle}
                                            setPushResult={setPushResult}
                                            setImageTestFile={setImageTestFile}
                                            setImageTestPreview={setImageTestPreview}
                                            setImageTestResult={setImageTestResult}
                                            setImageTesting={setImageTesting}
                                            onSimulateLine={() => onSimulateLine(app)}
                                            onSimulateLineImage={() => onSimulateLineImage(app)}
                                            onImageFileChange={onImageFileChange}
                                            onPushLine={onPushLine}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 flex justify-end gap-3 rounded-b-lg">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex justify-center items-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none sm:text-sm transition-colors"
                        >
                            關閉
                        </button>
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaveDisabled}
                            className={`inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:text-sm transition-colors ${isSaveDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {saveLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────

function ConfigFields({ app, aiTypes, editedConfig, showSecret, setEditedConfig }: {
    app: AppIntegration;
    aiTypes: string[];
    editedConfig: Record<string, any>;
    showSecret: boolean;
    setEditedConfig: (c: Record<string, any>) => void;
}) {
    const filteredKeys = Object.keys(editedConfig).filter(key => {
        if (key === 'models') return false;
        if (app.type === 'RESEND' && !['smtpPass', 'fromAddress'].includes(key)) return false;
        if (aiTypes.includes(app.type)) {
            if (key === 'systemInstruction') return false;
            if (app.type === 'AI_CHATROOM' && key === 'linkedServiceId') return false;
        }
        return true;
    });

    return (
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto text-sm">
            <ul className="space-y-4 text-gray-700 dark:text-gray-300">
                {filteredKeys.map(key => {
                    if (app.type === 'RESEND' && !['smtpPass', 'fromAddress'].includes(key)) return null;
                    const label = (app.type === 'RESEND' && key === 'smtpPass') ? 'API Key' :
                        LABEL_MAP[key] || (key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'));
                    const isSecretField = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('password') || key === 'smtpPass';
                    return (
                        <li key={key} className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-semibold w-full sm:w-1/3 text-gray-500 dark:text-gray-400 mb-1 sm:mb-0">{label}:</span>
                            <input
                                type={isSecretField && !showSecret ? 'password' : 'text'}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm"
                                value={editedConfig[key] || ''}
                                onChange={(e) => setEditedConfig({ ...editedConfig, [key]: e.target.value })}
                            />
                            {key === 'channelSecret' && (
                                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">* 此欄位於 Webhook 驗證時使用，「測試連線」僅驗證 Token。</p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function AIConfigSection({ app, apps, aiTypes, aiModelOptions, editedConfig, setEditedConfig, selectedModels }: {
    app: AppIntegration;
    apps: AppIntegration[];
    aiTypes: string[];
    aiModelOptions: Record<string, string[]>;
    editedConfig: Record<string, any>;
    setEditedConfig: (c: Record<string, any>) => void;
    selectedModels: string[];
}) {
    const activeAiApps = apps.filter(a => !AI_CONTAINER_TYPES.includes(a.type) && a.status === 'ACTIVE');

    return (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {app.type === 'AI_CHATROOM' && (
                <AIChatroomConfig app={app} apps={apps} activeAiApps={activeAiApps} editedConfig={editedConfig} setEditedConfig={setEditedConfig} />
            )}
            {app.type === 'ASK_PLAN_AGENT' && (
                <AskPlanAgentConfig activeAiApps={activeAiApps} editedConfig={editedConfig} setEditedConfig={setEditedConfig} />
            )}
            {app.type === 'SMART_ROUTER' && (
                <SmartRouterConfig activeAiApps={activeAiApps} editedConfig={editedConfig} setEditedConfig={setEditedConfig} />
            )}
            {!AI_CONTAINER_TYPES.includes(app.type) && (
                <>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {(aiModelOptions[app.type] || []).map(model => {
                            const isChecked = selectedModels.includes(model);
                            return (
                                <label key={model} className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none">
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => setEditedConfig({ ...editedConfig, models: e.target.checked ? [model] : [] })}
                                        className="rounded text-blue-600 focus:ring-blue-500 bg-gray-100 border-gray-300"
                                    />
                                    <span>{model}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">固定提示詞 (System Prompt):</label>
                        <textarea
                            className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-sans min-h-[100px] resize-y"
                            value={editedConfig.systemInstruction || ''}
                            onChange={(e) => setEditedConfig({ ...editedConfig, systemInstruction: e.target.value })}
                            placeholder="在此輸入 AI 的角色設定或指令..."
                        />
                        <p className="text-[10px] text-gray-400 mt-1">* 這些指令將作為 AI 的核心準則，優先於使用者的提問。</p>
                    </div>
                </>
            )}
        </div>
    );
}

function AIChatroomConfig({ app, apps, activeAiApps, editedConfig, setEditedConfig }: {
    app: AppIntegration;
    apps: AppIntegration[];
    activeAiApps: AppIntegration[];
    editedConfig: Record<string, any>;
    setEditedConfig: (c: Record<string, any>) => void;
}) {
    const linked = apps.find(a => a.integrationId === editedConfig.linkedServiceId);
    const model = Array.isArray(linked?.config?.models) ? linked?.config?.models[0] : typeof linked?.config?.models === 'string' ? linked?.config?.models.split(',').filter(Boolean)[0] : null;
    const skill = editedConfig.linkedSkillId ? getSkillById(editedConfig.linkedSkillId) : null;

    return (
        <div className="mb-4 space-y-4">
            {linked && (
                <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    <span className="text-2xl">{AI_META[linked.type]?.icon || '🤖'}</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300">{linked.name}</p>
                        <p className="text-[11px] text-indigo-600 dark:text-indigo-400">{AI_META[linked.type]?.label || linked.type}</p>
                        {model && <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-mono font-bold">🧩 {model}</span>}
                    </div>
                </div>
            )}

            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">串接的 AI 服務:</label>
                <select
                    className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    value={editedConfig.linkedServiceId || ''}
                    onChange={(e) => setEditedConfig({ ...editedConfig, linkedServiceId: e.target.value })}
                >
                    <option value="">-- 請選擇已設定的 AI 服務 --</option>
                    {activeAiApps.map(a => {
                        const m = Array.isArray(a.config?.models) ? a.config?.models[0] : typeof a.config?.models === 'string' ? a.config?.models.split(',').filter(Boolean)[0] : null;
                        return <option key={a.integrationId} value={a.integrationId}>{AI_META[a.type]?.icon} {a.name} ({a.type}){m ? ` · ${m}` : ''}</option>;
                    })}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">* 請先在 AI 工具串接區塊完成相關服務的設定。</p>
            </div>

            <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">✨ 串接 AI 技能 (Skill):</label>
                <select
                    className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-indigo-300 dark:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    value={editedConfig.linkedSkillId || ''}
                    onChange={(e) => setEditedConfig({ ...editedConfig, linkedSkillId: e.target.value })}
                >
                    <option value="">-- 不使用特定技能 (通用客服) --</option>
                    {AI_SKILLS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label} - {s.desc}</option>)}
                </select>
                {skill && (
                    <div className="mt-2 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-800">
                        <p className="text-[11px] text-indigo-600 dark:text-indigo-400 leading-relaxed font-medium">💡 啟用此技能後，AI 將扮演「{skill.label}」並遵循專屬指令。</p>
                    </div>
                )}
            </div>

            <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">🗄️ 串接資料庫 (選填):</label>
                <select
                    className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-orange-300 dark:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    value={editedConfig.linkedDatabaseId || ''}
                    onChange={(e) => setEditedConfig({ ...editedConfig, linkedDatabaseId: e.target.value })}
                >
                    <option value="">-- 不使用資料庫 --</option>
                    {apps.filter(a => DATABASE_TYPES.includes(a.type) && a.status === 'ACTIVE').map(db => (
                        <option key={db.integrationId} value={db.integrationId}>{DATABASE_META[db.type]?.icon} {db.name} ({db.type})</option>
                    ))}
                </select>
                {editedConfig.linkedDatabaseId && (() => {
                    const database = apps.find(a => a.integrationId === editedConfig.linkedDatabaseId);
                    return database ? (
                        <div className="mt-2 p-3 bg-orange-50/50 dark:bg-orange-900/10 rounded-lg border border-dashed border-orange-200 dark:border-orange-800">
                            <p className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">💡 啟用此資料庫後，AI 將優先參考「{database.name}」中的內容。</p>
                        </div>
                    ) : null;
                })()}
            </div>
        </div>
    );
}

function AskPlanAgentConfig({ activeAiApps, editedConfig, setEditedConfig }: {
    activeAiApps: AppIntegration[];
    editedConfig: Record<string, any>;
    setEditedConfig: (c: Record<string, any>) => void;
}) {
    const phases = [
        { key: 'ask', label: '階段一：諮詢釐清 (Ask Phase)', promptKey: 'askSystemPrompt', serviceKey: 'askLinkedServiceId', color: 'purple', placeholder: '請定義諮詢階段的 System Prompt...' },
        { key: 'plan', label: '階段二：策略規劃 (Plan Phase)', promptKey: 'planSystemPrompt', serviceKey: 'planLinkedServiceId', color: 'indigo', placeholder: '請定義規劃階段的 System Prompt...' },
        { key: 'agent', label: '階段三：任務執行 (Execute Phase)', promptKey: 'agentSystemPrompt', serviceKey: 'agentLinkedServiceId', color: 'blue', placeholder: '請定義執行階段的 System Prompt...' },
    ];

    return (
        <div className="mb-4 space-y-4">
            {phases.map(p => (
                <div key={p.key} className={`p-4 bg-${p.color}-50 dark:bg-${p.color}-900/10 rounded-lg border border-${p.color}-100 dark:border-${p.color}-800 space-y-3`}>
                    <label className={`block text-[12px] font-bold text-${p.color}-700 dark:text-${p.color}-300 uppercase tracking-wider`}>{p.label}</label>
                    <select
                        className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 text-sm"
                        value={editedConfig[p.serviceKey] || ''}
                        onChange={(e) => setEditedConfig({ ...editedConfig, [p.serviceKey]: e.target.value })}
                    >
                        <option value="">-- 請選擇模型 --</option>
                        {activeAiApps.map(a => <option key={a.integrationId} value={a.integrationId}>{AI_META[a.type]?.icon} {a.name} ({a.type})</option>)}
                    </select>
                    <textarea
                        placeholder={p.placeholder}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white min-h-[60px]"
                        value={editedConfig[p.promptKey] || ''}
                        onChange={(e) => setEditedConfig({ ...editedConfig, [p.promptKey]: e.target.value })}
                    />
                </div>
            ))}
        </div>
    );
}

function SmartRouterConfig({ activeAiApps, editedConfig, setEditedConfig }: {
    activeAiApps: AppIntegration[];
    editedConfig: Record<string, any>;
    setEditedConfig: (c: Record<string, any>) => void;
}) {
    const tiers = [
        { key: 'fastModelId', label: 'Fast Model (極速模型)', color: 'emerald' },
        { key: 'balancedModelId', label: 'Balanced Model (平衡模型)', color: 'blue' },
        { key: 'complexModelId', label: 'Complex Model (複雜模型)', color: 'purple' },
    ];

    return (
        <div className="mb-4 space-y-4">
            {tiers.map(t => (
                <div key={t.key} className={`p-4 bg-${t.color}-50 dark:bg-${t.color}-900/10 rounded-lg border border-${t.color}-100 dark:border-${t.color}-800 space-y-3`}>
                    <label className={`block text-[12px] font-bold text-${t.color}-700 dark:text-${t.color}-300 uppercase tracking-wider`}>{t.label}</label>
                    <select
                        className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none text-sm"
                        value={editedConfig[t.key] || ''}
                        onChange={(e) => setEditedConfig({ ...editedConfig, [t.key]: e.target.value })}
                    >
                        <option value="">-- 請選擇模型 --</option>
                        {activeAiApps.map(a => <option key={a.integrationId} value={a.integrationId}>{AI_META[a.type]?.icon} {a.name} ({a.type})</option>)}
                    </select>
                </div>
            ))}
        </div>
    );
}

function AiPromptTestSection({ app, simulating, simInput, simReply, setSimInput, onTest }: {
    app: AppIntegration;
    simulating: boolean;
    simInput: string;
    simReply: string | null;
    setSimInput: (v: string) => void;
    onTest: () => void;
}) {
    return (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                <span className="text-xl">💬</span> Prompt 功能測試
            </h4>
            <div className="space-y-3">
                <p className="text-xs text-gray-500 mb-2">您可以輸入一段文字，測試 AI 是否能正確回應內容。</p>
                <textarea
                    value={simInput}
                    onChange={(e) => setSimInput(e.target.value)}
                    placeholder="請輸入測試問題 (例如：你好，請自我介紹)"
                    rows={3}
                    className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onTest(); }}
                />
                <button
                    onClick={onTest}
                    disabled={simulating || !simInput.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {simulating ? <><SpinnerIcon />AI 思考中...</> : '🚀 傳送並測試 Prompt'}
                </button>
                <div className="text-[10px] text-gray-400 text-right">支援 Ctrl + Enter 快速傳送</div>
                <div className={`p-4 rounded-lg border-2 min-h-[120px] max-h-[400px] overflow-auto resize-y transition-all ${!simReply ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 border-dashed' : simReply.startsWith('❌') ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/50' : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900/50'}`}>
                    {simulating ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-gray-400 gap-3">
                            <SpinnerIcon />
                            <span className="text-xs font-medium animate-pulse">正在取得 AI 回應...</span>
                        </div>
                    ) : simReply ? (
                        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-medium leading-relaxed">{simReply}</div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-gray-400 italic">
                            <p className="text-xs">尚未執行測試，在上方輸入內容並點擊傳送</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TestConnectionSection({ app, aiTypes, testingId, testPayAmount, testPayProductName, setTestPayAmount, setTestPayProductName, editedConfig, onTest }: {
    app: AppIntegration;
    aiTypes: string[];
    testingId: string | null;
    testPayAmount: string;
    testPayProductName: string;
    setTestPayAmount: (v: string) => void;
    setTestPayProductName: (v: string) => void;
    editedConfig: Record<string, any>;
    onTest: (app: AppIntegration) => Promise<void>;
}) {
    const PAYMENT_TYPES_LOCAL = ['ECPAY', 'PAYPAL', 'STRIPE', 'LINEPAY', 'JKOPAY'];
    const CHANNEL_TYPES_LOCAL = ['LINE', 'TELEGRAM', 'WHATSAPP', 'MESSENGER', 'SLACK', 'TEAMS', 'DISCORD', 'WECHAT'];
    const EMAIL_TYPES_LOCAL = ['SMTP', 'RESEND'];
    const isPayment = PAYMENT_TYPES_LOCAL.includes(app.type);
    const isChannel = CHANNEL_TYPES_LOCAL.includes(app.type);
    const isAI = aiTypes.includes(app.type);
    const isEmail = EMAIL_TYPES_LOCAL.includes(app.type);

    if (!isPayment && !isChannel && !isAI && !isEmail) return null;

    const testApp: AppIntegration = {
        ...app,
        config: editedConfig,
        testParams: (app.type === 'LINEPAY' || app.type === 'JKOPAY') ? { amount: testPayAmount, productName: testPayProductName } : undefined,
    };

    return (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            {(app.type === 'LINEPAY' || app.type === 'JKOPAY') && (
                <div className="mb-4 space-y-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <h5 className="text-xs font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wider mb-2">金流測試參數</h5>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] text-gray-500 mb-1">測試金額</label>
                            <input type="number" value={testPayAmount} onChange={(e) => setTestPayAmount(e.target.value)} className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-500 mb-1">商品名稱</label>
                            <input type="text" value={testPayProductName} onChange={(e) => setTestPayProductName(e.target.value)} className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </div>
                    </div>
                </div>
            )}
            <button
                onClick={() => onTest(testApp)}
                disabled={testingId === app.integrationId}
                className={`w-full px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${testingId === app.integrationId ? 'bg-gray-300 text-gray-600 cursor-wait dark:bg-gray-600' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300'}`}
            >
                {testingId === app.integrationId ? (
                    <span className="flex items-center justify-center gap-2"><SpinnerIcon />測試連線中...</span>
                ) : '🔍 測試連線'}
            </button>
        </div>
    );
}

function LineFeatures({
    app, simulating, simInput, simReply,
    pushTesting, pushMessage, pushTitle, pushResult,
    imageTestFile, imageTestPreview, imageTestResult, imageTesting,
    setSimInput, setSimReply, setPushMessage, setPushTitle, setPushResult,
    setImageTestFile, setImageTestPreview, setImageTestResult, setImageTesting,
    onSimulateLine, onSimulateLineImage, onImageFileChange, onPushLine,
}: {
    app: AppIntegration;
    simulating: boolean;
    simInput: string;
    simReply: string | null;
    pushTesting: boolean;
    pushMessage: string;
    pushTitle: string;
    pushResult: string | null;
    imageTestFile: File | null;
    imageTestPreview: string | null;
    imageTestResult: string | null;
    imageTesting: boolean;
    setSimInput: (v: string) => void;
    setSimReply: (v: string | null) => void;
    setPushMessage: (v: string) => void;
    setPushTitle: (v: string) => void;
    setPushResult: (v: string | null) => void;
    setImageTestFile: (f: File | null) => void;
    setImageTestPreview: (v: string | null) => void;
    setImageTestResult: (v: string | null) => void;
    setImageTesting: (v: boolean) => void;
    onSimulateLine: () => void;
    onSimulateLineImage: () => void;
    onImageFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onPushLine: () => void;
}) {
    return (
        <div className="space-y-6">
            {/* 訊息模擬測試 */}
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                    <span className="text-xl">🤖</span> 訊息模擬測試
                </h4>
                <p className="text-xs text-gray-500 mb-2">您可以輸入指令測試帳號綁定（例如：<code>BIND 您的電子信箱</code>）</p>
                <div className="flex gap-2">
                    <input type="text" value={simInput} onChange={(e) => setSimInput(e.target.value)} placeholder="輸入指令..." className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" onKeyDown={(e) => e.key === 'Enter' && onSimulateLine()} />
                    <button onClick={onSimulateLine} disabled={simulating || !simInput.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {simulating ? '...' : '模擬傳送'}
                    </button>
                </div>
                {simReply && (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-green-200 dark:border-green-900/50">
                        <p className="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1 uppercase tracking-wider">Bot 模擬回覆：</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-medium">{simReply}</p>
                    </div>
                )}
            </div>

            {/* 圖片辨識測試 */}
            <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
                <h4 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                    <span className="text-xl">📸</span> 圖片辨識測試
                </h4>
                <p className="text-xs text-gray-500 mb-2">上傳藥品圖片進行 Gemini Vision 辨識測試</p>
                {imageTestPreview && (
                    <div className="relative mb-3">
                        <img src={imageTestPreview} alt="preview" className="max-w-[200px] max-h-[200px] rounded-lg border border-gray-300 dark:border-gray-600" />
                        <button onClick={() => { setImageTestFile(null); setImageTestPreview(null); setImageTestResult(null); }} className="mt-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700">✕ 清除</button>
                    </div>
                )}
                <div className="flex gap-2">
                    <label className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 text-center">
                        選擇圖片
                        <input type="file" accept="image/*" onChange={onImageFileChange} className="hidden" />
                    </label>
                    <button onClick={onSimulateLineImage} disabled={imageTesting || !imageTestFile} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {imageTesting ? '分析中...' : '開始辨識'}
                    </button>
                </div>
                {imageTestResult && (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-amber-200 dark:border-amber-900/50">
                        <p className="text-[10px] font-bold text-amber-600 mb-1 uppercase">圖片分析結果：</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-medium">{imageTestResult}</p>
                    </div>
                )}
            </div>

            {/* Webhook URL */}
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Webhook URL 設定</h4>
                <p className="text-xs text-blue-700 dark:text-blue-400 mb-3 leading-relaxed">請將以下網址複製並貼上至 LINE Developers Console 的 <strong>Webhook settings</strong>，並開啟「Use webhook」。</p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 block bg-white dark:bg-gray-800 px-3 py-2 rounded shadow-inner border border-blue-200 dark:border-blue-700 text-[10px] font-mono text-gray-800 dark:text-gray-200 break-all">
                        {typeof window !== 'undefined' ? `${window.location.origin}/api/line/webhook/${app.integrationId}` : ''}
                    </code>
                    <button
                        onClick={(e) => {
                            const btn = e.currentTarget;
                            navigator.clipboard.writeText(`${window.location.origin}/api/line/webhook/${app.integrationId}`);
                            btn.textContent = '已複製';
                            setTimeout(() => { btn.textContent = '複製'; }, 2000);
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white font-medium text-xs rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                        複製
                    </button>
                </div>
            </div>

            {/* LINE 推播測試 */}
            <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-3">LINE 推播測試</h4>
                <p className="text-xs text-purple-700 dark:text-purple-400 mb-3">向所有已綁定 LINE 的使用者發送推播通知</p>
                <div className="space-y-3">
                    <input type="text" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="標題（可選）" className="w-full px-3 py-2 text-sm border border-purple-300 dark:border-purple-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" />
                    <textarea value={pushMessage} onChange={(e) => setPushMessage(e.target.value)} placeholder="推播訊息內容" rows={3} className="w-full px-3 py-2 text-sm border border-purple-300 dark:border-purple-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none" />
                    <button onClick={onPushLine} disabled={pushTesting || !pushMessage.trim()} className="w-full px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {pushTesting ? '✉️ 推播中...' : '📤 發送推播'}
                    </button>
                    {pushResult && (
                        <div className={`p-3 rounded-lg text-sm ${pushResult.startsWith('✅') ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                            {pushResult}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
