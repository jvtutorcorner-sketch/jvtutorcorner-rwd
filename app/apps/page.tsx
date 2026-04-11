'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppsPage } from './_hooks/useAppsPage';
import { CHANNEL_TYPES, PAYMENT_TYPES, EMAIL_TYPES, AI_CONTAINER_TYPES, DATABASE_TYPES } from './_types';
import AppConfigModal from './components/AppConfigModal';
import SyncModal from './components/SyncModal';
import SkillPreviewModal from './components/SkillPreviewModal';
import ChannelsSection from './components/sections/ChannelsSection';
import PaymentsSection from './components/sections/PaymentsSection';
import AutomationSection from './components/sections/AutomationSection';
import SkillsSection from './components/sections/SkillsSection';
import AIToolsSection from './components/sections/AIToolsSection';
import AIChatroomSection from './components/sections/AIChatroomSection';
import PlatformAgentsSection from './components/sections/PlatformAgentsSection';
import AskPlanAgentSection from './components/sections/AskPlanAgentSection';
import EmailSection from './components/sections/EmailSection';
import DatabaseSection from './components/sections/DatabaseSection';
import ConnectedAppsList from './components/ConnectedAppsList';

export default function AppsPage() {
    const router = useRouter();
    const state = useAppsPage();
    const {
        apps, loading, aiTypes, aiModelOptions, categoryPermissions,
        cronStatus, fetchingCronStatus, testingId, testResults, copySuccess,
        showSyncModal, selectedSyncProvider, syncPreview, isSyncing, syncActionStatus,
        selectedAppConfig, editedConfig, editedName, editedStatus,
        editedScriptEnabled, editedCustomScript, showSecret, isSavingConfig, saveResult,
        simulating, simInput, simReply, pushTesting, pushMessage, pushTitle, pushResult,
        testPayAmount, testPayProductName, testPayEnv, imageTestFile, imageTestPreview, imageTestResult, imageTesting,
        showTestEmail, testEmailData, testSending, testResult,
        selectedSkillPreview,
        // Setters
        setShowSyncModal, setSelectedSyncProvider, setSyncPreview, setSyncActionStatus,
        setEditedConfig, setEditedName, setEditedStatus,
        setEditedScriptEnabled, setEditedCustomScript, setShowSecret,
        setSaveResult, setSimInput, setSimReply,
        setPushMessage, setPushTitle, setPushResult,
        setTestPayAmount, setTestPayProductName, setTestPayEnv,
        setImageTestFile, setImageTestPreview, setImageTestResult, setImageTesting,
        setShowTestEmail, setTestEmailData, setTestSending, setTestResult,
        setSelectedSkillPreview,
        // Handlers
        fetchCronStatus,
        getConnectedApps, handleTest, handleCopyToken,
        handleSyncModelPreview, handleApplySyncUpdate,
        openModal, closeModal,
        handleSaveConfig, handleAiTestPrompt, handleSendTestEmail,
        handleSimulateLine, handleSimulateLineImage, handleImageFileChange, handlePushLine,
    } = state;

    const handleOpenReport = () => router.push('/dashboard/daily-report');

    // Tab state management
    const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'automation' | 'data-storage'>('general');

    // Visibility derived from permissions OR existing connected apps
    const showChannels = categoryPermissions.APP_CATEGORY_CHANNEL || apps.some(a => CHANNEL_TYPES.includes(a.type));
    const showPayments = categoryPermissions.APP_CATEGORY_PAYMENT || apps.some(a => PAYMENT_TYPES.includes(a.type));
    const showAI = categoryPermissions.APP_CATEGORY_AI || apps.some(a => !AI_CONTAINER_TYPES.includes(a.type));
    const showAIChatroom = categoryPermissions.APP_CATEGORY_AI_CHATROOM || apps.some(a => a.type === 'AI_CHATROOM');
    const showAskPlanAgent = categoryPermissions.APP_CATEGORY_ASK_PLAN_AGENT || apps.some(a => a.type === 'ASK_PLAN_AGENT');
    const showEmail = categoryPermissions.APP_CATEGORY_EMAIL || apps.some(a => EMAIL_TYPES.includes(a.type));
    const showAutomation = categoryPermissions.APP_CATEGORY_AUTOMATION;
    const showSkills = categoryPermissions.APP_CATEGORY_SKILLS ?? true;
    const showDatabase = categoryPermissions.APP_CATEGORY_DATABASE ?? true;

    // Check if any AI features should be shown
    const showAITab = showAI || showAIChatroom || showAskPlanAgent;

    // Check if automation should show as separate tab
    const showAutomationTab = showAutomation;
    
    // Data storage tab always shown
    const showDataStorageTab = showDatabase;

    // Shared section props
    const sectionCommon = { apps, getConnectedApps, testingId, testResults, handleTest, openModal };

    return (
        <div className="page p-6 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">應用程式</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">管理您的通訊渠道與金流串接</p>
                </div>
                <div>
                    <Link href="/apps/page-permissions" className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center shadow-sm">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        頁面存取權限
                    </Link>
                </div>
            </header>

            {/* Tab Navigation */}
            {(showAITab || showAutomationTab || showDataStorageTab) && (
                <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
                            activeTab === 'general'
                                ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                                : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-300'
                        }`}
                    >
                        基本設定
                    </button>
                    {showAutomationTab && (
                        <button
                            onClick={() => setActiveTab('automation')}
                            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === 'automation'
                                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                        >
                            <span>⚙️</span>
                            自動化
                        </button>
                    )}
                    {showAITab && (
                        <button
                            onClick={() => setActiveTab('ai')}
                            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === 'ai'
                                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                        >
                            <span>🤖</span>
                            AI 功能
                        </button>
                    )}
                    {showDataStorageTab && (
                        <button
                            onClick={() => setActiveTab('data-storage')}
                            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === 'data-storage'
                                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                                    : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                        >
                            <span>🗄️</span>
                            資料庫與知識庫
                        </button>
                    )}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                </div>
            ) : (
                <>
                    {/* General Tab */}
                    {activeTab === 'general' && (
                        <>
                            {showChannels && <ChannelsSection {...sectionCommon} />}
                            {showPayments && <PaymentsSection {...sectionCommon} />}
                            {showEmail && <EmailSection {...sectionCommon} />}
                            <ConnectedAppsList apps={apps} aiTypes={aiTypes} openModal={openModal} />
                        </>
                    )}

                    {/* Automation Tab */}
                    {activeTab === 'automation' && (
                        <>
                            {showAutomation && (
                                <AutomationSection
                                    cronStatus={cronStatus}
                                    fetchingCronStatus={fetchingCronStatus}
                                    copySuccess={copySuccess}
                                    fetchCronStatus={fetchCronStatus}
                                    handleCopyToken={handleCopyToken}
                                    handleOpenReport={handleOpenReport}
                                />
                            )}
                        </>
                    )}

                    {/* AI Tab */}
                    {activeTab === 'ai' && (
                        <>
                            {showSkills && <SkillsSection setSelectedSkillPreview={setSelectedSkillPreview} />}
                            {showAI && (
                                <AIToolsSection
                                    {...sectionCommon}
                                    aiTypes={aiTypes}
                                    setShowSyncModal={setShowSyncModal}
                                />
                            )}
                            {showAIChatroom && <AIChatroomSection {...sectionCommon} />}
                            <PlatformAgentsSection />
                            {showAskPlanAgent && <AskPlanAgentSection {...sectionCommon} />}
                        </>
                    )}

                    {/* Data Storage Tab */}
                    {activeTab === 'data-storage' && (
                        <>
                            {showDatabase && <DatabaseSection {...sectionCommon} />}
                        </>
                    )}
                </>
            )}

            {selectedAppConfig && (
                <AppConfigModal
                    app={selectedAppConfig}
                    apps={apps}
                    aiTypes={aiTypes}
                    aiModelOptions={aiModelOptions}
                    testingId={testingId}
                    testResults={testResults}
                    editedConfig={editedConfig}
                    editedName={editedName}
                    editedStatus={editedStatus}
                    editedScriptEnabled={editedScriptEnabled}
                    editedCustomScript={editedCustomScript}
                    showSecret={showSecret}
                    isSavingConfig={isSavingConfig}
                    saveResult={saveResult}
                    simulating={simulating}
                    simInput={simInput}
                    simReply={simReply}
                    pushTesting={pushTesting}
                    pushMessage={pushMessage}
                    pushTitle={pushTitle}
                    pushResult={pushResult}
                    testPayAmount={testPayAmount}
                    testPayProductName={testPayProductName}
                    testPayEnv={testPayEnv}
                    imageTestFile={imageTestFile}
                    imageTestPreview={imageTestPreview}
                    imageTestResult={imageTestResult}
                    imageTesting={imageTesting}
                    showTestEmail={showTestEmail}
                    testEmailData={testEmailData}
                    testSending={testSending}
                    testResult={testResult}
                    onClose={closeModal}
                    setEditedConfig={setEditedConfig}
                    setEditedName={setEditedName}
                    setEditedStatus={setEditedStatus}
                    setEditedScriptEnabled={setEditedScriptEnabled}
                    setEditedCustomScript={setEditedCustomScript}
                    setShowSecret={setShowSecret}
                    setSaveResult={setSaveResult}
                    setSimInput={setSimInput}
                    setSimReply={setSimReply}
                    setPushMessage={setPushMessage}
                    setPushTitle={setPushTitle}
                    setPushResult={setPushResult}
                    setTestPayAmount={setTestPayAmount}
                    setTestPayProductName={setTestPayProductName}
                    setTestPayEnv={setTestPayEnv}
                    setImageTestFile={setImageTestFile}
                    setImageTestPreview={setImageTestPreview}
                    setImageTestResult={setImageTestResult}
                    setImageTesting={setImageTesting}
                    setShowTestEmail={setShowTestEmail}
                    setTestEmailData={setTestEmailData}
                    setTestSending={setTestSending}
                    setTestResult={setTestResult}
                    onSave={handleSaveConfig}
                    onTest={handleTest}
                    onAiTestPrompt={handleAiTestPrompt}
                    onSendTestEmail={handleSendTestEmail}
                    onSimulateLine={handleSimulateLine}
                    onSimulateLineImage={handleSimulateLineImage}
                    onImageFileChange={handleImageFileChange}
                    onPushLine={handlePushLine}
                />
            )}

            {showSyncModal && (
                <SyncModal
                    aiModelOptions={aiModelOptions}
                    selectedSyncProvider={selectedSyncProvider}
                    syncPreview={syncPreview}
                    isSyncing={isSyncing}
                    syncActionStatus={syncActionStatus}
                    setSelectedSyncProvider={setSelectedSyncProvider}
                    setSyncPreview={setSyncPreview}
                    setSyncActionStatus={setSyncActionStatus}
                    onClose={() => { setShowSyncModal(false); }}
                    onPreview={handleSyncModelPreview}
                    onApply={handleApplySyncUpdate}
                />
            )}

            {selectedSkillPreview && (
                <SkillPreviewModal
                    skill={selectedSkillPreview}
                    copySuccess={copySuccess}
                    onClose={() => setSelectedSkillPreview(null)}
                    onCopyToken={handleCopyToken}
                />
            )}
        </div>
    );
}
