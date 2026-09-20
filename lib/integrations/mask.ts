// lib/integrations/mask.ts
//
// 整合設定的密鑰遮罩與合併工具。Server 端專用（無外部相依，Phase 0 起沿用到 store）。
//
// 設計原則：
//   - GET 回傳時，secret 欄位以 `MASK_PREFIX + last4` 取代真值，避免明文外洩。
//   - 寫入（PUT/POST）時，若收到的 secret 值本身是遮罩佔位（或空/undefined），
//     視為「未變更」，保留 DB 既有值；只有收到全新的明文才覆寫。
//   - 這是伺服器端權威合併，不依賴前端是否乖乖不回送遮罩值。
//
// Phase 0 尚無 registry，secret 欄位以「已知 key 名 + 後援 regex」判斷；
// Phase 3 之後 registry 會提供明確的 `secret: true`，屆時可傳入 secretKeys 覆寫。

/** 遮罩字元（U+2022 BULLET）。偵測遮罩值時以此開頭。 */
export const MASK_CHAR = '•';
const MASK_BODY = MASK_CHAR.repeat(4);

/** 已知的密鑰欄位（依 DB 實際持久化的 key，含歷史別名） */
const KNOWN_SECRET_KEYS = new Set(
    [
        'channelAccessToken', 'channelSecret',
        'hashKey', 'hashIV', 'ecpayHashKey', 'ecpayHashIV',
        'secretKey', 'stripeSecretKey', 'paypalSecretKey', 'jkopaySecretKey',
        'clientSecret', 'linePayChannelSecret',
        'apiKey', 'context7ApiKey',
        'smtpPass', 'webhookSecret',
    ].map((k) => k.toLowerCase())
);

/** 明確「非密鑰」的欄位，即使 key 名含 key/secret/token 也不遮罩 */
const KNOWN_PUBLIC_KEYS = new Set(
    [
        'merchantId', 'accountId', 'publicKey', 'stripePublicKey', 'clientId',
        'stripeAccountId', 'linePayChannelId', 'jkopayMerchantId', 'ecpayMerchantId',
        'smtpHost', 'smtpPort', 'smtpUser', 'fromAddress', 'region', 'tableName',
        'partitionKey', 'sortKey', 'databasePath', 'models', 'systemInstruction',
        'linkedServiceId', 'linkedSkillId', 'askLinkedServiceId', 'planLinkedServiceId',
        'agentLinkedServiceId', 'executionEnvironment',
    ].map((k) => k.toLowerCase())
);

const SECRET_KEY_REGEX = /(secret|token|password|passwd|apikey|api_key|accesstoken|hashiv|hashkey|privatekey)/i;

/** 判斷某個 config key 是否為密鑰欄位 */
export function isSecretKey(key: string): boolean {
    const lower = key.toLowerCase();
    if (KNOWN_PUBLIC_KEYS.has(lower)) return false;
    if (KNOWN_SECRET_KEYS.has(lower)) return true;
    // 後援：以 pass/secret/token/hashKey 等結尾或包含，但排除已知公開欄位
    if (lower === 'pass') return true;
    return SECRET_KEY_REGEX.test(lower);
}

/** 是否為遮罩佔位值（GET 回傳過的、或前端原樣送回的） */
export function isMaskedValue(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith(MASK_CHAR);
}

/** 產生遮罩值：顯示末四碼，方便辨識是哪一組金鑰 */
export function maskValue(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) return MASK_BODY;
    const last4 = value.length > 4 ? value.slice(-4) : '';
    return MASK_BODY + last4;
}

/**
 * 回傳遮罩後的 config 副本（供 GET 使用）。
 * @param secretKeys 若提供（如 registry 的 secretKeysOf），以此為準；否則用 isSecretKey 判斷。
 */
export function maskConfig(
    config: Record<string, any> | undefined | null,
    secretKeys?: Iterable<string>
): Record<string, any> {
    if (!config || typeof config !== 'object') return {};
    const secretSet = secretKeys ? new Set([...secretKeys].map((k) => k.toLowerCase())) : null;
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(config)) {
        const secret = secretSet ? secretSet.has(key.toLowerCase()) : isSecretKey(key);
        out[key] = secret && val != null && val !== '' ? maskValue(val) : val;
    }
    return out;
}

/** 遮罩整筆整合紀錄的 config（不改動其他欄位） */
export function maskRecord<T extends { config?: Record<string, any> }>(record: T, secretKeys?: Iterable<string>): T {
    return { ...record, config: maskConfig(record.config, secretKeys) };
}

/**
 * 合併寫入的 config 與既有 config：
 *   - incoming 的 secret 欄位若為遮罩值 / 空字串 / undefined → 保留 existing 的原值
 *   - incoming 若送 `{ __clear: true }` → 清除該欄位
 *   - 其餘（明文新值、非 secret 欄位）→ 採用 incoming
 * 回傳可直接寫入 DynamoDB 的合併結果。
 */
export function mergeSecrets(
    incoming: Record<string, any> | undefined | null,
    existing: Record<string, any> | undefined | null,
    secretKeys?: Iterable<string>
): Record<string, any> {
    const base = existing && typeof existing === 'object' ? { ...existing } : {};
    if (!incoming || typeof incoming !== 'object') return base;
    const secretSet = secretKeys ? new Set([...secretKeys].map((k) => k.toLowerCase())) : null;
    const out: Record<string, any> = { ...base };

    for (const [key, val] of Object.entries(incoming)) {
        // 明確清除
        if (val && typeof val === 'object' && (val as any).__clear === true) {
            delete out[key];
            continue;
        }
        const secret = secretSet ? secretSet.has(key.toLowerCase()) : isSecretKey(key);
        if (secret) {
            // 遮罩 / 空 → 視為未變更，保留原值
            if (val == null || val === '' || isMaskedValue(val)) {
                // 保留 existing（若原本沒有就不寫入）
                continue;
            }
            out[key] = val;
        } else {
            // 非 secret：空字串代表清除
            if (val === '') {
                delete out[key];
            } else if (val != null) {
                out[key] = val;
            }
        }
    }
    return out;
}
