import { AISkill } from './ai-skills';

export type ComplexityLevel = 'FAST' | 'BALANCED' | 'COMPLEX';

export interface SmartRouterResult {
    level: ComplexityLevel;
    reason: string;
}

/**
 * 啟發式評估提示詞的複雜度 (Heuristic Prompt Complexity Evaluation)
 * @param messages 聊天記錄
 * @returns 複雜度等級與判斷原因
 */
export function evaluatePromptComplexity(messages: any[]): SmartRouterResult {
    if (!messages || messages.length === 0) {
        return { level: 'FAST', reason: '無對話歷史，預設使用極速模型' };
    }

    const latestMessage = messages[messages.length - 1];
    const latestText = latestMessage?.content || '';

    // 1. 歷史上下文總長度
    const totalLength = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);

    // 2. 判斷是否有程式碼標記
    const hasCodeBlocks = /```[\s\S]*?```/.test(latestText);
    const hasManyCodeBlocks = (latestText.match(/```/g) || []).length >= 4; // 包含兩個以上的 code block

    // 3. 複雜意圖關鍵字 (Complex Intent)
    const complexKeywords = [
        'debug', '除錯', '報錯', 'error', 'exception', 'stack trace',
        '架構', '結構', 'architecture', 'design pattern', '設計模式',
        '撰寫', '幫我寫', '重構', 'refactor', '分析', 'analyze',
        '資料庫', 'database', 'sql', 'migration', '原理', '為什麼',
        '幫我修改', '優化', '幫我看', '什麼問題'
    ];

    const hasComplexIntent = complexKeywords.some(kw => latestText.toLowerCase().includes(kw));

    // 4. 簡單意圖關鍵字 (Fast Intent)
    const fastKeywords = [
        '你好', 'hi', 'hello', '早安', '午安', '晚安', '掰掰', '謝謝', '感謝'
    ];
    // 僅當字數很短且完全符合這些單純打招呼行為
    const isVeryShortAndFast = latestText.length < 30 && fastKeywords.some(kw => latestText.toLowerCase().includes(kw));

    // [判斷邏輯]
    // 一、高階模型 (COMPLEX)：需要強大推理能力的情境
    if (hasManyCodeBlocks || totalLength > 2000) {
        return { level: 'COMPLEX', reason: '上下文極長或包含多個程式碼區塊 (總字數 > 2000)，需要高階模型。' };
    }
    if (hasCodeBlocks && hasComplexIntent) {
        return { level: 'COMPLEX', reason: '包含程式碼且意圖複雜 (Debug/重構/分析)，需要高階模型。' };
    }
    if (totalLength > 1000 && hasComplexIntent) {
        return { level: 'COMPLEX', reason: '上下文長度較長且意圖複雜，需要高階模型。' };
    }

    // 二、極速模型 (FAST)：非常簡單的對話，或是單純打招呼
    if (totalLength < 100 && !hasCodeBlocks && !hasComplexIntent) {
        if (isVeryShortAndFast || messages.length <= 2) {
            return { level: 'FAST', reason: '對話簡短且無複雜意圖，使用極速模型即可。' };
        }
    }

    // 三、均衡模型 (BALANCED)：預設中間地帶
    return { level: 'BALANCED', reason: '常規對話任務，使用均衡模型以兼顧效能與成本。' };
}
