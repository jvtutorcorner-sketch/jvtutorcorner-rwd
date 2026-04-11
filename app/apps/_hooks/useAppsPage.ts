import { useState, useEffect } from 'react';
import { AppIntegration, TestResult, AI_CONTAINER_TYPES } from '../_types';

// ─── Page-level state ────────────────────────────────────
export interface AppsPageState {
    apps: AppIntegration[];
    loading: boolean;
    aiModelOptions: Record<string, string[]>;
    aiTypes: string[];
    categoryPermissions: Record<string, boolean>;
    cronStatus: { hasReport: boolean; report?: any; message?: string } | null;
    fetchingCronStatus: boolean;
    testingId: string | null;
    testResults: Record<string, TestResult>;
    copySuccess: string | null;
    // Sync modal
    showSyncModal: boolean;
    selectedSyncProvider: string;
    syncPreview: SyncPreview | null;
    isSyncing: boolean;
    syncActionStatus: { type: 'success' | 'error'; message: string } | null;
}

export interface SyncPreview {
    fetchedCount: number;
    currentCount: number;
    added: string[];
    removed: string[];
    unchanged: string[];
    allLatestModels: string[];
}

// ─── Modal state ──────────────────────────────────────────
export interface ModalState {
    selectedAppConfig: AppIntegration | null;
    editedConfig: Record<string, any>;
    editedName: string;
    editedStatus: string;
    editedScriptEnabled: boolean;
    editedCustomScript: string;
    showSecret: boolean;
    isSavingConfig: boolean;
    saveResult: { success: boolean; message: string } | null;
    simulating: boolean;
    simInput: string;
    simReply: string | null;
    pushTesting: boolean;
    pushMessage: string;
    pushTitle: string;
    pushResult: string | null;
    testPayAmount: string;
    testPayProductName: string;
    imageTestFile: File | null;
    imageTestPreview: string | null;
    imageTestResult: string | null;
    imageTesting: boolean;
    showTestEmail: boolean;
    testEmailData: { to: string; subject: string; html: string };
    testSending: boolean;
    testResult: { success: boolean; message: string } | null;
    testPayEnv: 'production' | 'sandbox';
}

export interface ModalHandlers {
    openModal: (app: AppIntegration) => void;
    closeModal: () => void;
    setEditedConfig: (config: Record<string, any>) => void;
    setEditedName: (name: string) => void;
    setEditedStatus: (status: string) => void;
    setEditedScriptEnabled: (enabled: boolean) => void;
    setEditedCustomScript: (script: string) => void;
    setShowSecret: (show: boolean) => void;
    setSaveResult: (result: { success: boolean; message: string } | null) => void;
    setSimInput: (input: string) => void;
    setSimReply: (reply: string | null) => void;
    setPushMessage: (msg: string) => void;
    setPushTitle: (title: string) => void;
    setPushResult: (result: string | null) => void;
    setTestPayAmount: (amount: string) => void;
    setTestPayProductName: (name: string) => void;
    setImageTestFile: (file: File | null) => void;
    setImageTestPreview: (preview: string | null) => void;
    setImageTestResult: (result: string | null) => void;
    setImageTesting: (testing: boolean) => void;
    setShowTestEmail: (show: boolean) => void;
    setTestEmailData: (data: { to: string; subject: string; html: string }) => void;
    setTestSending: (sending: boolean) => void;
    setTestResult: (result: { success: boolean; message: string } | null) => void;
    setTestPayEnv: (env: 'production' | 'sandbox') => void;
    handleSaveConfig: () => Promise<void>;
    handleAiTestPrompt: (app: AppIntegration) => Promise<void>;
    handleSendTestEmail: (app: AppIntegration) => Promise<void>;
    handleSimulateLine: (app: AppIntegration) => Promise<void>;
    handleSimulateLineImage: (app: AppIntegration) => Promise<void>;
    handleImageFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handlePushLine: () => Promise<void>;
}

export function useAppsPage() {
    const [apps, setApps] = useState<AppIntegration[]>([]);
    const [loading, setLoading] = useState(true);
    const [aiModelOptions, setAiModelOptions] = useState<Record<string, string[]>>({});
    const [aiTypes, setAiTypes] = useState<string[]>(['AI_CHATROOM', 'ASK_PLAN_AGENT', 'SMART_ROUTER', 'CONTEXT7']);
    const [categoryPermissions, setCategoryPermissions] = useState<Record<string, boolean>>({
        APP_CATEGORY_CHANNEL: true,
        APP_CATEGORY_PAYMENT: true,
        APP_CATEGORY_AUTOMATION: true,
        APP_CATEGORY_AI: true,
        APP_CATEGORY_AI_CHATROOM: true,
        APP_CATEGORY_ASK_PLAN_AGENT: true,
        APP_CATEGORY_EMAIL: true,
        APP_CATEGORY_DATABASE: true,
        APP_CATEGORY_SKILLS: true,
    });
    const [cronStatus, setCronStatus] = useState<{ hasReport: boolean; report?: any; message?: string } | null>(null);
    const [fetchingCronStatus, setFetchingCronStatus] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
    const [copySuccess, setCopySuccess] = useState<string | null>(null);

    // Sync modal
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [selectedSyncProvider, setSelectedSyncProvider] = useState<string>('GEMINI');
    const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncActionStatus, setSyncActionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Modal state
    const [selectedAppConfig, setSelectedAppConfig] = useState<AppIntegration | null>(null);
    const [editedConfig, setEditedConfig] = useState<Record<string, any>>({});
    const [editedName, setEditedName] = useState('');
    const [editedStatus, setEditedStatus] = useState('ACTIVE');
    const [editedScriptEnabled, setEditedScriptEnabled] = useState(false);
    const [editedCustomScript, setEditedCustomScript] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
    const [simulating, setSimulating] = useState(false);
    const [simInput, setSimInput] = useState('');
    const [simReply, setSimReply] = useState<string | null>(null);
    const [pushTesting, setPushTesting] = useState(false);
    const [pushMessage, setPushMessage] = useState('');
    const [pushTitle, setPushTitle] = useState('');
    const [pushResult, setPushResult] = useState<string | null>(null);
    const [testPayAmount, setTestPayAmount] = useState('1');
    const [testPayProductName, setTestPayProductName] = useState('測試商品');
    const [testPayEnv, setTestPayEnv] = useState<'production' | 'sandbox'>('sandbox');
    const [imageTestFile, setImageTestFile] = useState<File | null>(null);
    const [imageTestPreview, setImageTestPreview] = useState<string | null>(null);
    const [imageTestResult, setImageTestResult] = useState<string | null>(null);
    const [imageTesting, setImageTesting] = useState(false);
    const [showTestEmail, setShowTestEmail] = useState(false);
    const [testEmailData, setTestEmailData] = useState({
        to: '',
        subject: 'JVTutorCorner 整合測試郵件',
        html: '<p>這是一封從您的 Resend 整合發出的測試郵件。如果您收到這封信，代表您的 API Key 與寄件者設定已正確生效！</p>',
    });
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // ─── Skill preview ────────────────────────────────────
    const [selectedSkillPreview, setSelectedSkillPreview] = useState<any>(null);

    // ─── Effects ──────────────────────────────────────────
    useEffect(() => {
        if (selectedAppConfig || selectedSkillPreview) {
            document.body.style.overflow = 'hidden';
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    setSelectedAppConfig(null);
                    setSelectedSkillPreview(null);
                    setSimInput('');
                    setSimReply(null);
                }
            };
            document.addEventListener('keydown', handleEscape);
            return () => {
                document.removeEventListener('keydown', handleEscape);
                document.body.style.overflow = 'unset';
            };
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [selectedAppConfig, selectedSkillPreview]);

    useEffect(() => {
        fetchApps();
        fetchAiModels();
        fetchCronStatus();
         
    }, []);

    // ─── Data fetching ────────────────────────────────────
    async function fetchApps() {
        try {
            let userRole = 'student';
            const raw = localStorage.getItem('tutor_mock_user');
            if (raw) {
                const stored = JSON.parse(raw);
                userRole = stored.role || stored.roleId || 'student';
            }

            const permRes = await fetch('/api/apps/permissions');
            const permData = await permRes.json();
            if (permRes.ok && permData.settings && permData.settings.appConfigs) {
                const configs = permData.settings.appConfigs;
                const relevantCategories = [
                    'APP_CATEGORY_CHANNEL', 'APP_CATEGORY_PAYMENT', 'APP_CATEGORY_AUTOMATION',
                    'APP_CATEGORY_AI', 'APP_CATEGORY_AI_CHATROOM', 'APP_CATEGORY_ASK_PLAN_AGENT',
                    'APP_CATEGORY_EMAIL', 'APP_CATEGORY_DATABASE',
                ];
                const newPerms: Record<string, boolean> = {};
                relevantCategories.forEach(catId => {
                    const appConf = configs.find((c: any) => c.id === catId);
                    if (appConf) {
                        if (userRole === 'admin') {
                            newPerms[catId] = true;
                        } else {
                            const rolePerm = appConf.permissions?.find((p: any) => p.roleId === userRole);
                            newPerms[catId] = rolePerm ? rolePerm.visible : false;
                        }
                    } else {
                        newPerms[catId] = userRole === 'admin';
                    }
                });
                setCategoryPermissions(newPerms);
            }

            const res = await fetch('/api/app-integrations');
            const result = await res.json();
            if (result.ok) setApps(result.data);
        } catch (err) {
            console.error('Failed to fetch apps:', err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchAiModels() {
        try {
            const aiRes = await fetch('/api/admin/ai-models');
            const aiResult = await aiRes.json();
            if (aiResult.ok) {
                const modelsMap: Record<string, string[]> = {};
                const typesFromDb: string[] = ['AI_CHATROOM', 'ASK_PLAN_AGENT', 'SMART_ROUTER', 'CONTEXT7'];
                aiResult.data.forEach((model: any) => {
                    modelsMap[model.provider] = model.models;
                    if (!typesFromDb.includes(model.provider)) typesFromDb.push(model.provider);
                });
                setAiModelOptions(modelsMap);
                setAiTypes(typesFromDb);
            }
        } catch (err) {
            console.error('Failed to fetch AI models:', err);
        }
    }

    async function fetchCronStatus() {
        setFetchingCronStatus(true);
        try {
            const res = await fetch('/api/cron/daily-report/status');
            const data = await res.json();
            setCronStatus(data);
        } catch (error) {
            console.error('Failed to fetch cron status:', error);
        } finally {
            setFetchingCronStatus(false);
        }
    }

    // ─── Handlers ─────────────────────────────────────────
    const getConnectedApps = (type: string) => apps.filter(a => a.type === type);

    const handleTest = async (app: AppIntegration) => {
        const id = app.integrationId;
        setTestingId(id);
        setTestResults(prev => { const n = { ...prev }; delete n[id]; return n; });
        try {
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ integrationId: id, type: app.type, config: app.config, testParams: { ...app.testParams, env: testPayEnv } }),
            });
            const data = await res.json();
            if (data.ok && data.result) {
                setTestResults(prev => ({ ...prev, [id]: data.result }));
            } else {
                setTestResults(prev => ({ ...prev, [id]: { success: false, message: data.error || '測試失敗' } }));
            }
        } catch (e: any) {
            setTestResults(prev => ({ ...prev, [id]: { success: false, message: `請求失敗: ${e.message}` } }));
        } finally {
            setTestingId(null);
        }
    };

    const handleCopyToken = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(type);
        setTimeout(() => setCopySuccess(null), 2000);
    };

    const handleSyncModelPreview = async (provider: string, apiKey?: string) => {
        setIsSyncing(true);
        setSyncActionStatus(null);
        setSyncPreview(null);
        try {
            let finalApiKey = apiKey || editedConfig.apiKey || selectedAppConfig?.config?.apiKey;
            if (!finalApiKey) {
                const existingApp = apps.find(a => a.type === provider);
                finalApiKey = existingApp?.config?.apiKey;
            }
            if (!finalApiKey) {
                setSyncActionStatus({ type: 'error', message: `找不到 ${provider} 的 API Key。請先在服務設定中填寫並儲存。` });
                return;
            }
            const res = await fetch('/api/admin/ai-models/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey: finalApiKey }),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSyncPreview(data.preview);
            } else {
                setSyncActionStatus({ type: 'error', message: data.error || '無法取得最新的模型列表' });
            }
        } catch (error: any) {
            setSyncActionStatus({ type: 'error', message: `發生錯誤: ${error.message}` });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleApplySyncUpdate = async (provider: string, updatedModels: string[]) => {
        setIsSyncing(true);
        setSyncActionStatus(null);
        try {
            const res = await fetch('/api/admin/ai-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, models: updatedModels }),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSyncActionStatus({ type: 'success', message: '模型清單已成功更新！' });
                setAiModelOptions(prev => ({ ...prev, [provider]: updatedModels }));
                setTimeout(() => { setSyncPreview(null); setSyncActionStatus(null); }, 3000);
            } else {
                setSyncActionStatus({ type: 'error', message: data.error || '更新模型清單失敗' });
            }
        } catch (error: any) {
            setSyncActionStatus({ type: 'error', message: `套用更新時發生錯誤: ${error.message}` });
        } finally {
            setIsSyncing(false);
        }
    };

    // ─── Modal handlers ───────────────────────────────────
    const openModal = (app: AppIntegration) => {
        setSelectedAppConfig(app);
        setEditedConfig(app.config ? { ...app.config } : {});
        setEditedName(app.name || '');
        setEditedStatus(app.status || 'ACTIVE');
        setEditedScriptEnabled(!!(app.config && app.config.customScript));
        setEditedCustomScript(
            app.config?.customScript ||
            `function doPost(event) {\n  const incoming = event.events[0]?.message?.text;\n  return "You said: " + incoming;\n}`
        );
    };

    const closeModal = () => {
        setSelectedAppConfig(null);
        setEditedConfig({});
        setShowSecret(false);
        setSimInput('');
        setSimReply(null);
        setPushMessage('');
        setPushTitle('');
        setPushResult(null);
        setSaveResult(null);
    };

    const handleSaveConfig = async () => {
        if (!selectedAppConfig) return;
        setIsSavingConfig(true);
        try {
            const updatedConfig = { ...selectedAppConfig.config, ...editedConfig };
            if (editedScriptEnabled && editedCustomScript.trim()) {
                updatedConfig.customScript = editedCustomScript;
            } else {
                delete updatedConfig.customScript;
            }
            const res = await fetch('/api/app-integrations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrationId: selectedAppConfig.integrationId,
                    userId: selectedAppConfig.userId,
                    type: selectedAppConfig.type,
                    config: updatedConfig,
                    name: editedName,
                    status: editedStatus,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setApps(prev => prev.map(a =>
                    a.integrationId === selectedAppConfig.integrationId
                        ? { ...a, config: updatedConfig, name: editedName, status: editedStatus }
                        : a
                ));
                setSelectedAppConfig(prev =>
                    prev ? { ...prev, config: updatedConfig, name: editedName, status: editedStatus } : null
                );
                setSaveResult({ success: true, message: '✅ 設定於系統中儲存成功' });
                setTimeout(() => setSaveResult(null), 3000);
            } else {
                setSaveResult({ success: false, message: `❌ 儲存失敗: ${data.error}` });
            }
        } catch (e: any) {
            setSaveResult({ success: false, message: `❌ 系統錯誤: ${e.message}` });
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleAiTestPrompt = async (app: AppIntegration) => {
        if (!simInput.trim() || simulating) return;
        setSimulating(true);
        setSimReply(null);
        try {
            const config = { ...app.config, ...editedConfig };
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ integrationId: app.integrationId, type: app.type, config, prompt: simInput.trim() }),
            });
            const data = await res.json();
            if (data.ok && data.result.success) {
                setSimReply(data.result.message);
            } else {
                setSimReply(`❌ 錯誤: ${data.result?.message || data.error || '不明原因'}`);
            }
        } catch (error: any) {
            setSimReply(`❌ 測試失敗: ${error.message}`);
        } finally {
            setSimulating(false);
        }
    };

    const handleSendTestEmail = async (app: AppIntegration) => {
        if (!editedConfig.smtpPass || !editedConfig.fromAddress || !testEmailData.to) {
            alert('請填寫 API Key、寄件者以及收件者內容');
            return;
        }
        setTestSending(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/app-integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    integrationId: app.integrationId,
                    type: 'RESEND',
                    config: {
                        smtpHost: 'smtp.resend.com',
                        smtpPort: '465',
                        smtpUser: 'resend',
                        smtpPass: editedConfig.smtpPass,
                        fromAddress: editedConfig.fromAddress,
                    },
                    emailTest: testEmailData,
                }),
            });
            const data = await res.json();
            if (data.ok && data.result.success) {
                setTestResult({ success: true, message: data.result.message });
            } else {
                setTestResult({ success: false, message: data.result?.message || data.error || '發送失敗' });
            }
        } catch (error: any) {
            setTestResult({ success: false, message: `發送失敗: ${error.message}` });
        } finally {
            setTestSending(false);
        }
    };

    const handleSimulateLine = async (app: AppIntegration) => {
        if (!simInput.trim()) return;
        setSimulating(true);
        setSimReply(null);
        try {
            const res = await fetch(`/api/line/webhook/${app.integrationId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-simulation': 'true' },
                body: JSON.stringify({
                    events: [{ type: 'message', replyToken: 'sim_token', source: { userId: 'U_SIMULATION_USER' }, message: { type: 'text', text: simInput } }],
                }),
            });
            const data = await res.json();
            setSimReply(data.ok && data.replies?.length > 0 ? data.replies[0].text : '系統無回應或回覆格式錯誤');
        } catch (e: any) {
            setSimReply(`模擬失敗: ${e.message}`);
        } finally {
            setSimulating(false);
        }
    };

    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageTestFile(file);
            const reader = new FileReader();
            reader.onload = (event) => setImageTestPreview(event.target?.result as string);
            reader.readAsDataURL(file);
            setImageTestResult(null);
        }
    };

    const handleSimulateLineImage = async (app: AppIntegration) => {
        if (!imageTestFile) { setImageTestResult('請先選擇圖片'); return; }
        setImageTesting(true);
        setImageTestResult(null);
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const base64Data = (event.target?.result as string).split(',')[1];
                    const res = await fetch('/api/image-analysis', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageBase64: base64Data }),
                    });
                    const data = await res.json();
                    if (data.ok && data.result) {
                        let responseText = '📸 藥品辨識結果：\n\n';
                        if (data.result.raw) {
                            responseText += data.result.raw;
                        } else {
                            responseText += `🔷 形狀：${data.result.shape || '無法辨識'}\n`;
                            responseText += `🔶 顏色：${data.result.color || '無法辨識'}\n`;
                            responseText += `✏️ 刻字：${data.result.imprint || '無'}\n`;
                            responseText += `📏 刻痕：${data.result.score_line || '無'}\n`;
                        }
                        setImageTestResult(responseText);
                    } else {
                        setImageTestResult(`圖片分析失敗: ${data.error || '未知錯誤'}`);
                    }
                } catch (err: any) {
                    setImageTestResult(`圖片測試失敗: ${err.message}`);
                } finally {
                    setImageTesting(false);
                }
            };
            reader.readAsDataURL(imageTestFile);
        } catch (e: any) {
            setImageTestResult(`模擬失敗: ${e.message}`);
            setImageTesting(false);
        }
    };

    const handlePushLine = async () => {
        if (!pushMessage.trim()) { setPushResult('訊息內容不能為空'); return; }
        setPushTesting(true);
        setPushResult(null);
        try {
            const res = await fetch('/api/line/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userEmail: selectedAppConfig?.config?.testEmail, message: pushMessage, title: pushTitle || undefined }),
            });
            const data = await res.json();
            if (data.ok) {
                setPushResult(`✅ 推播成功！${data.recipientCount ? `已發送給 ${data.recipientCount} 位使用者` : ''}`);
                setPushMessage('');
                setPushTitle('');
            } else {
                setPushResult(`❌ 推播失敗: ${data.error || '未知錯誤'}`);
            }
        } catch (e: any) {
            setPushResult(`❌ 推播失敗: ${e.message}`);
        } finally {
            setPushTesting(false);
        }
    };

    return {
        // Page state
        apps, loading, aiModelOptions, aiTypes, categoryPermissions,
        cronStatus, fetchingCronStatus, testingId, testResults, copySuccess,
        showSyncModal, setShowSyncModal,
        selectedSyncProvider, setSelectedSyncProvider,
        syncPreview, setSyncPreview,
        isSyncing, syncActionStatus, setSyncActionStatus,
        selectedSkillPreview, setSelectedSkillPreview,
        // Page handlers
        getConnectedApps, handleTest, handleCopyToken, fetchCronStatus,
        handleSyncModelPreview, handleApplySyncUpdate,
        // Modal state
        selectedAppConfig,
        editedConfig, setEditedConfig,
        editedName, setEditedName,
        editedStatus, setEditedStatus,
        editedScriptEnabled, setEditedScriptEnabled,
        editedCustomScript, setEditedCustomScript,
        showSecret, setShowSecret,
        isSavingConfig,
        saveResult, setSaveResult,
        simulating, simInput, setSimInput, simReply, setSimReply,
        pushTesting, pushMessage, setPushMessage, pushTitle, setPushTitle, pushResult, setPushResult,
        testPayAmount, setTestPayAmount,
        testPayProductName, setTestPayProductName,
        testPayEnv, setTestPayEnv,
        imageTestFile, setImageTestFile,
        imageTestPreview, setImageTestPreview,
        imageTestResult, setImageTestResult,
        imageTesting, setImageTesting,
        showTestEmail, setShowTestEmail,
        testEmailData, setTestEmailData,
        testSending, setTestSending, testResult, setTestResult,
        // Modal handlers
        openModal, closeModal, handleSaveConfig, handleAiTestPrompt,
        handleSendTestEmail, handleSimulateLine, handleSimulateLineImage,
        handleImageFileChange, handlePushLine,
    };
}
