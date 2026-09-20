'use client';

// app/apps/components/tools/ConnectionTools.tsx
// 連線詳情頁的「測試工具」：依 provider.capabilities.toolPanels 顯示對應面板。
// 一律使用 /api/integrations/[id]/test（以 DB 密鑰 + 未儲存編輯測試），LINE 模擬 / 推播
// 沿用既有的 /api/line/webhook/[id] 與 /api/line/push。

import { useState } from 'react';
import { testConnection, type ConnectionView, type CatalogProvider } from '@/lib/integrations/clientApi';

interface Props {
    connection: ConnectionView;
    provider: CatalogProvider;
    /** 尚未儲存的編輯，測試時一併帶上（遮罩/空密鑰由後端保留原值） */
    pendingConfig?: Record<string, any>;
}

type Res = { success: boolean; message: string } | null;

function ResultBox({ r }: { r: Res }) {
    if (!r) return null;
    return (
        <div className={`mt-2 text-sm p-2 rounded-lg ${r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {r.success ? '✓ ' : '✗ '}{r.message}
        </div>
    );
}

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm';

export default function ConnectionTools({ connection, provider, pendingConfig }: Props) {
    const id = connection.integrationId;
    const panels = provider.capabilities.toolPanels || [];
    const [busy, setBusy] = useState<string | null>(null);

    // generic
    const [genRes, setGenRes] = useState<Res>(null);
    // ai-prompt
    const [prompt, setPrompt] = useState('');
    const [promptRes, setPromptRes] = useState<Res>(null);
    // test-email
    const [emailTo, setEmailTo] = useState('');
    const [emailRes, setEmailRes] = useState<Res>(null);
    // test-payment
    const [payAmount, setPayAmount] = useState('1');
    const [payRes, setPayRes] = useState<Res>(null);
    // line
    const [simInput, setSimInput] = useState('');
    const [simReply, setSimReply] = useState<string | null>(null);
    const [pushTo, setPushTo] = useState('');
    const [pushMsg, setPushMsg] = useState('');
    const [pushRes, setPushRes] = useState<Res>(null);

    const overrides = pendingConfig;

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        try { await fn(); } finally { setBusy(null); }
    };

    return (
        <div className="space-y-6">
            {/* 通用連線測試 */}
            {provider.capabilities.testConnection && (
                <section>
                    <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">連線測試</h4>
                    <button
                        disabled={busy === 'gen'}
                        onClick={() => run('gen', async () => {
                            try { setGenRes(await testConnection(id, { configOverrides: overrides })); }
                            catch (e: any) { setGenRes({ success: false, message: e.message }); }
                        })}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >{busy === 'gen' ? '測試中…' : '測試連線'}</button>
                    <ResultBox r={genRes} />
                </section>
            )}

            {panels.includes('ai-prompt') && (
                <section>
                    <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">AI 對話測試</h4>
                    <textarea className={inputCls} rows={2} placeholder="輸入一段提示…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                    <button
                        disabled={busy === 'ai' || !prompt.trim()}
                        onClick={() => run('ai', async () => {
                            try { setPromptRes(await testConnection(id, { configOverrides: overrides, prompt: prompt.trim() })); }
                            catch (e: any) { setPromptRes({ success: false, message: e.message }); }
                        })}
                        className="mt-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >{busy === 'ai' ? '送出中…' : '送出'}</button>
                    <ResultBox r={promptRes} />
                </section>
            )}

            {panels.includes('test-email') && (
                <section>
                    <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">發送測試郵件</h4>
                    <input className={inputCls} placeholder="收件者 Email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
                    <button
                        disabled={busy === 'email' || !emailTo.trim()}
                        onClick={() => run('email', async () => {
                            try { setEmailRes(await testConnection(id, { configOverrides: overrides, emailTest: { to: emailTo.trim(), subject: '系統整合測試郵件', html: '<p>這是一封測試郵件。</p>' } })); }
                            catch (e: any) { setEmailRes({ success: false, message: e.message }); }
                        })}
                        className="mt-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >{busy === 'email' ? '發送中…' : '發送'}</button>
                    <ResultBox r={emailRes} />
                </section>
            )}

            {panels.includes('test-payment') && (
                <section>
                    <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">建立測試交易</h4>
                    <input className={inputCls} type="number" min={1} placeholder="金額" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                    <button
                        disabled={busy === 'pay'}
                        onClick={() => run('pay', async () => {
                            try { setPayRes(await testConnection(id, { configOverrides: overrides, testParams: { amount: Number(payAmount) || 1, productName: '測試商品' } })); }
                            catch (e: any) { setPayRes({ success: false, message: e.message }); }
                        })}
                        className="mt-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >{busy === 'pay' ? '建立中…' : '建立測試交易'}</button>
                    <ResultBox r={payRes} />
                </section>
            )}

            {panels.includes('line-simulate') && (
                <section>
                    <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">模擬 LINE 訊息</h4>
                    <input className={inputCls} placeholder="模擬使用者輸入…" value={simInput} onChange={(e) => setSimInput(e.target.value)} />
                    <button
                        disabled={busy === 'sim' || !simInput.trim()}
                        onClick={() => run('sim', async () => {
                            try {
                                const res = await fetch(`/api/line/webhook/${id}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-simulation': 'true' },
                                    body: JSON.stringify({ events: [{ type: 'message', replyToken: 'sim_token', source: { userId: 'U_SIMULATION_USER' }, message: { type: 'text', text: simInput } }] }),
                                });
                                const data = await res.json();
                                setSimReply(data.ok && data.replies?.length > 0 ? data.replies[0].text : '系統無回應或回覆格式錯誤');
                            } catch (e: any) { setSimReply(`模擬失敗: ${e.message}`); }
                        })}
                        className="mt-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >{busy === 'sim' ? '模擬中…' : '模擬'}</button>
                    {simReply && <div className="mt-2 text-sm p-2 rounded-lg bg-gray-100 dark:bg-gray-700">{simReply}</div>}
                </section>
            )}

            {panels.includes('line-push') && (
                <section>
                    <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">LINE 推播測試</h4>
                    <input className={inputCls} placeholder="收件者 LINE User ID" value={pushTo} onChange={(e) => setPushTo(e.target.value)} />
                    <input className={`${inputCls} mt-2`} placeholder="訊息內容" value={pushMsg} onChange={(e) => setPushMsg(e.target.value)} />
                    <button
                        disabled={busy === 'push' || !pushTo.trim() || !pushMsg.trim()}
                        onClick={() => run('push', async () => {
                            try {
                                const res = await fetch('/api/line/push', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ integrationId: id, to: pushTo.trim(), message: pushMsg.trim() }),
                                });
                                const data = await res.json();
                                setPushRes({ success: !!data.ok, message: data.ok ? '推播已送出' : (data.error || '推播失敗') });
                            } catch (e: any) { setPushRes({ success: false, message: e.message }); }
                        })}
                        className="mt-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >{busy === 'push' ? '推播中…' : '推播'}</button>
                    <ResultBox r={pushRes} />
                </section>
            )}
        </div>
    );
}
