// lib/agora/connectionLog.ts
import type { AgoraDeviceSnapshot, AgoraNetworkType, AgoraOSName, AgoraBrowserName, AgoraDeviceCategory } from './types';

export interface AgoraConnectionLogParams {
    userId?: string;
    courseId?: string;
    page: string;
    role?: string;
    orderId?: string | null;
    /** Agora 頻道名（/classroom/room 必要欄位） */
    channelName?: string;
    /** 課堂 Session ID（/classroom/room 中產生） */
    sessionId?: string;
    /** 參與者 ID（若已由 session API 取得） */
    participantId?: string;
    /** Agora 數字 UID */
    agoraUid?: number;
}

// ─── 完整的設備快照解析（對應 Agora Dashboard OS / NET / SDK / Device / Browser）

/**
 * 解析 User-Agent 取得 OS 名稱與版本
 * 對應 Agora Dashboard 「OS」欄位，例如：iOS 17.6.1 / Windows 10 / iOS 18.5
 */
function parseOS(ua: string): { osName: AgoraOSName; osVersion: string } {
    let m: RegExpMatchArray | null;

    // Windows 10/11 → UA 固定為 "Windows NT 10.0"，對應 Dashboard 顯示 "Windows 10"
    // ⚠️ 優先檢測，避免其他模式混淆
    m = ua.match(/Windows NT\s+([\d.]+)/i);
    if (m) {
        const ntVer = parseFloat(m[1]);
        const winVer = ntVer >= 10.0 ? '10' : ntVer >= 6.3 ? '8.1' : ntVer >= 6.2 ? '8' : '7';
        return { osName: 'Windows', osVersion: winVer };
    }

    // MacOS （優先於 iOS，因為 iPad 可能同時包含 Mac OS X）
    m = ua.match(/Mac OS X\s+([\d_]+)/i);
    if (m && !/iPhone|iPad|iPod/.test(ua)) {
        return { osName: 'MacOS', osVersion: m[1].replace(/_/g, '.') };
    }

    // Linux
    if (/Linux/i.test(ua) && !/Android/.test(ua)) {
        return { osName: 'Linux', osVersion: '' };
    }

    // iOS / iPadOS （在 MacOS 之後）
    m = ua.match(/OS\s+([\d_]+)\s+like\s+Mac/i);
    if (m) return { osName: 'iOS', osVersion: m[1].replace(/_/g, '.') };

    // Android （最後檢測，避免其他競爭 pattern）
    m = ua.match(/Android\s+([\d.]+)/i);
    if (m) return { osName: 'Android', osVersion: m[1] };

    return { osName: 'unknown', osVersion: '' };
}

/**
 * 解析 User-Agent 取得瀏覽器名稱與版本
 * 對應 Agora Dashboard 「Browser」欄位，例如：Chrome 146.0.7680.151 / Mobile Safari 18.5
 */
function parseBrowser(ua: string): { browserName: AgoraBrowserName; browserVersion: string } {
    let m: RegExpMatchArray | null;

    // Edge
    if (/Edg\//i.test(ua)) {
        m = ua.match(/Edg\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Edge', browserVersion: m?.[1] ?? '' };
    }

    // Opera
    if (/OPR\//i.test(ua)) {
        m = ua.match(/OPR\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Opera', browserVersion: m?.[1] ?? '' };
    }
    if (/Opera\//i.test(ua)) {
        m = ua.match(/Opera\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Opera', browserVersion: m?.[1] ?? '' };
    }

    // Firefox
    if (/Firefox\//i.test(ua)) {
        m = ua.match(/Firefox\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Firefox', browserVersion: m?.[1] ?? '' };
    }

    // Chrome （需在 Safari 之前檢測，因為 Chrome 亦包含 "Safari" 字），匹配完整版本號
    if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
        m = ua.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/i) || ua.match(/Chrome\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Chrome', browserVersion: m?.[1] ?? '' };
    }

    // Chromium
    if (/Chromium\//i.test(ua)) {
        m = ua.match(/Chromium\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Chrome', browserVersion: m?.[1] ?? '' };
    }

    // Safari （包含 Mobile Safari；在 Chrome 之後檢測避免混淆）
    if (/Safari\//i.test(ua)) {
        m = ua.match(/Version\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Safari', browserVersion: m?.[1] ?? '' };
    }

    return { browserName: 'unknown', browserVersion: '' };
}

/**
 * 解析 User-Agent 取得裝置類型與型號
 * 對應 Agora Dashboard 「Device type」欄位，例如：Apple iPhone / Apple iPad / Mozilla/5.0...
 */
function parseDevice(ua: string): { deviceCategory: AgoraDeviceCategory; deviceModel: string } {
    // 優先檢測具體的移動設備
    if (/iPhone/i.test(ua)) return { deviceCategory: 'mobile', deviceModel: 'Apple iPhone' };
    if (/iPad/i.test(ua)) return { deviceCategory: 'tablet', deviceModel: 'Apple iPad' };
    if (/iPod/i.test(ua)) return { deviceCategory: 'mobile', deviceModel: 'Apple iPod' };

    // 檢查是否為 Android 設備
    if (/Android/i.test(ua)) {
        // 嘗試取得裝置型號
        const m = ua.match(/;\s*([^;)]+)\s*Build/i);
        const model = m?.[1]?.trim() ?? 'Android Device';
        const isMobile = /Mobile/i.test(ua);
        return { deviceCategory: isMobile ? 'mobile' : 'tablet', deviceModel: model };
    }

    // 檢測桌面設備特徵（Windows、MacOS、Linux）
    if (/Windows NT|MacOS|Mac OS X|Linux|CrOS/i.test(ua)) {
        return { deviceCategory: 'desktop', deviceModel: ua.substring(0, 80) };
    }

    // 檢測其他移動設備標誌
    if (/Mobile/i.test(ua)) return { deviceCategory: 'mobile', deviceModel: ua.substring(0, 80) };
    if (/(tablet|playbook|silk|kindle)/i.test(ua)) return { deviceCategory: 'tablet', deviceModel: ua.substring(0, 80) };

    // 預設為桌面裝置（未明確標記為移動 / 平板）
    return { deviceCategory: 'desktop', deviceModel: ua.substring(0, 80) };
}

/**
 * 取得當前網路類型
 * 對應 Agora Dashboard 「NET」欄位，例如：NETWORK_UNKNOWN / WIFI / LAN
 */
function getNetworkType(): AgoraNetworkType {
    if (typeof navigator === 'undefined') return 'NETWORK_UNKNOWN';
    const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
    if (!conn) return 'NETWORK_UNKNOWN';

    const type = (conn.type as string || '').toLowerCase();
    const effectiveType = (conn.effectiveType as string || '').toLowerCase();

    // 優先檢查 type 欄位
    if (type === 'wifi') return 'WIFI';
    if (type === 'ethernet') return 'LAN';
    if (type === 'cellular') {
        if (effectiveType === '4g') return 'MOBILE_4G';
        if (effectiveType === '3g') return 'MOBILE_3G';
        if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'MOBILE_2G';
        return 'MOBILE_4G';
    }
    if (type === 'none') return 'OFFLINE';

    // 若 type 無法判定，次要檢查 effectiveType
    if (effectiveType === '4g') return 'MOBILE_4G';
    if (effectiveType === '3g') return 'MOBILE_3G';
    if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'MOBILE_2G';

    return 'NETWORK_UNKNOWN';
}

/**
 * 組合完整的設備快照（對應 Agora Dashboard 五個可見欄位）
 */
async function buildDeviceSnapshot(): Promise<AgoraDeviceSnapshot> {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    
    if (typeof window !== 'undefined') {
        console.log('[buildDeviceSnapshot] Raw User-Agent:', ua);
    }

    const { osName, osVersion } = parseOS(ua);
    const { browserName, browserVersion } = parseBrowser(ua);
    const { deviceCategory, deviceModel } = parseDevice(ua);
    const networkType = getNetworkType();

    if (typeof window !== 'undefined') {
        console.log('[buildDeviceSnapshot] Parsed results:', {
            osName, osVersion, browserName, browserVersion, deviceCategory, deviceModel, networkType
        });
    }

    let sdkVersion = 'unknown';
    let sdkFullVersion = 'unknown';
    let systemRequirementsCheck: boolean | null = null;

    if (typeof window !== 'undefined') {
        const AgoraModule = await import('agora-rtc-sdk-ng');
        const Agora = (AgoraModule as any).default ?? AgoraModule;
        sdkVersion = Agora.VERSION || 'unknown';
        // 建構完整版本字串（對應 Dashboard SDK 欄位：4.24.2/release_20260313_01_v...）
        const buildInfo: string = (Agora as any).BUILD || '';
        sdkFullVersion = buildInfo ? `${sdkVersion}/${buildInfo}` : sdkVersion;
        systemRequirementsCheck = Agora.checkSystemRequirements ? Agora.checkSystemRequirements() : null;
    }

    return {
        osName,
        osVersion,
        networkType,
        sdkVersion,
        sdkFullVersion,
        deviceCategory,
        deviceModel,
        browserName,
        browserVersion,
        userAgent: ua,
        systemRequirementsCheck,
    };
}

/**
 * Logs the device information and connection parameters to DynamoDB.
 * 對應舊版 logAgoraConnection，保留向後相容性。
 */
export async function logAgoraConnection(params: AgoraConnectionLogParams) {
    try {
        const snapshot = await buildDeviceSnapshot();

        const payload = {
            ...params,
            // 舊欄位（向後相容）
            os: snapshot.osName,
            browser: snapshot.browserName,
            device: snapshot.deviceCategory,
            agoraVersion: snapshot.sdkVersion,
            systemRequirements: snapshot.systemRequirementsCheck,
            // 新增完整欄位（對應 Agora Dashboard）
            ...snapshot,
            timestamp: Date.now(),
        };

        const res = await fetch('/api/agora/connection-log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.warn('Failed to log Agora connection:', await res.text());
        }
    } catch (error) {
        console.warn('Error during logAgoraConnection:', error);
    }
}

// ─── 輔助函式：僅取得設備快照（供其他模組呼叫） ──────────────────────────────────
export { buildDeviceSnapshot };
