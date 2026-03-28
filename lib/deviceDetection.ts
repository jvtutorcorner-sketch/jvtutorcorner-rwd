/**
 * lib/deviceDetection.ts
 * 纯网页 API 系统信息检测，无需 Agora SDK
 */

export interface SystemInfo {
    osName: string;
    osVersion: string;
    browserName: string;
    browserVersion: string;
    deviceCategory: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    deviceModel: string;
    networkType: string;
    networkIsWired?: boolean;
    userAgent: string;
}

/**
 * 解析 User-Agent 取得 OS 名稱
 */
function parseOS(ua: string): { osName: string; osVersion: string } {
    let m: RegExpMatchArray | null;

    // Windows （優先檢測）
    m = ua.match(/Windows NT\s+([\d.]+)/i);
    if (m) {
        const ntVer = parseFloat(m[1]);
        const winVer = ntVer >= 10.0 ? '10' : ntVer >= 6.3 ? '8.1' : ntVer >= 6.2 ? '8' : '7';
        return { osName: 'Windows', osVersion: winVer };
    }

    // MacOS （優先於 iOS）
    m = ua.match(/Mac OS X\s+([\d_]+)/i);
    if (m && !/iPhone|iPad|iPod/.test(ua)) {
        return { osName: 'MacOS', osVersion: m[1].replace(/_/g, '.') };
    }

    // Linux
    if (/Linux/i.test(ua) && !/Android/.test(ua)) {
        return { osName: 'Linux', osVersion: '' };
    }

    // iOS
    m = ua.match(/OS\s+([\d_]+)\s+like\s+Mac/i);
    if (m) return { osName: 'iOS', osVersion: m[1].replace(/_/g, '.') };

    // Android
    m = ua.match(/Android\s+([\d.]+)/i);
    if (m) return { osName: 'Android', osVersion: m[1] };

    return { osName: 'unknown', osVersion: '' };
}

/**
 * 解析 User-Agent 取得瀏覽器資訊
 */
function parseBrowser(ua: string): { browserName: string; browserVersion: string } {
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

    // Firefox
    if (/Firefox\//i.test(ua)) {
        m = ua.match(/Firefox\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Firefox', browserVersion: m?.[1] ?? '' };
    }

    // Chrome （需在 Safari 之前）
    if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
        m = ua.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/i) || ua.match(/Chrome\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Chrome', browserVersion: m?.[1] ?? '' };
    }

    // Safari
    if (/Safari\//i.test(ua)) {
        m = ua.match(/Version\/(\d+(?:\.\d+)*)/i);
        return { browserName: 'Safari', browserVersion: m?.[1] ?? '' };
    }

    return { browserName: 'unknown', browserVersion: '' };
}

/**
 * 解析 User-Agent 取得裝置類型
 */
function parseDevice(ua: string): { deviceCategory: 'mobile' | 'tablet' | 'desktop' | 'unknown'; deviceModel: string } {
    // 移動設備
    if (/iPhone/i.test(ua)) return { deviceCategory: 'mobile', deviceModel: 'Apple iPhone' };
    if (/iPad/i.test(ua)) return { deviceCategory: 'tablet', deviceModel: 'Apple iPad' };
    if (/iPod/i.test(ua)) return { deviceCategory: 'mobile', deviceModel: 'Apple iPod' };

    // Android 設備
    if (/Android/i.test(ua)) {
        const m = ua.match(/;\s*([^;)]+)\s*Build/i);
        const model = m?.[1]?.trim() ?? 'Android Device';
        const isMobile = /Mobile/i.test(ua);
        return { deviceCategory: isMobile ? 'mobile' : 'tablet', deviceModel: model };
    }

    // 桌面設備
    if (/Windows NT|Mac OS X|Linux|CrOS/i.test(ua)) {
        return { deviceCategory: 'desktop', deviceModel: ua.substring(0, 80) };
    }

    // 其他
    if (/Mobile/i.test(ua)) return { deviceCategory: 'mobile', deviceModel: ua.substring(0, 80) };
    if (/(tablet|playbook|silk|kindle)/i.test(ua)) return { deviceCategory: 'tablet', deviceModel: ua.substring(0, 80) };

    return { deviceCategory: 'desktop', deviceModel: ua.substring(0, 80) };
}

/**
 * 取得網路類型 (含有線/無線標記)
 */
function getNetworkInfo(): { type: string; isWired?: boolean } {
    if (typeof navigator === 'undefined') return { type: '未檢測到' };
    
    const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
    if (!conn) return { type: '未檢測到 (API 不支援)' };

    const effectiveType = (conn.effectiveType as string || '').toLowerCase();
    const type = (conn.type as string || '').toLowerCase();

    // 優先使用 effectiveType
    if (effectiveType === '4g') return { type: '無線 / 4G (LTE)', isWired: false };
    if (effectiveType === '3g') return { type: '無線 / 3G', isWired: false };
    if (effectiveType === '2g' || effectiveType === 'slow-2g') return { type: '無線 / 2G', isWired: false };

    // 根據 type
    if (type === 'wifi') return { type: '無線 WiFi', isWired: false };
    if (type === 'ethernet') return { type: '有線連接 (LAN)', isWired: true };
    if (type === 'cellular') return { type: '行動網路 (蜂窩)', isWired: false };
    if (type === 'wimax') return { type: '無線 WiMAX', isWired: false };
    if (type === 'bluetooth') return { type: '藍牙', isWired: true };
    if (type === 'none') return { type: '離線', isWired: false };

    // 嘗試用 downlink 推測
    const downlink = (conn.downlink as number | undefined);
    if (typeof downlink === 'number') {
        if (downlink > 10) return { type: '高速連接 (推測 4G 或以上)', isWired: false };
        if (downlink > 1) return { type: '中速連接 (推測 3G)', isWired: false };
        if (downlink > 0) return { type: '低速連接 (推測 2G)', isWired: false };
    }

    return { type: '未檢測到' };
}

/**
 * 取得 CPU 詳細資訊
 */
function getCpuInfo(): { cores?: number; info: string } {
    const cores = typeof navigator !== 'undefined' ? (navigator as any).hardwareConcurrency : undefined;
    
    let info = '';
    if (cores) {
        if (cores === 1) {
            info = `單核心`;
        } else if (cores <= 2) {
            info = `雙核心`;
        } else if (cores <= 4) {
            info = `四核心`;
        } else if (cores <= 8) {
            info = `八核心`;
        } else {
            info = `${cores} 核心`;
        }
    } else {
        info = '未檢測到';
    }
    
    return { cores, info };
}

/**
 * 取得記憶體詳細資訊
 */
function getMemoryInfo(): { gb?: number; mb?: number; info: string } {
    const deviceMemory = typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined;
    
    if (deviceMemory) {
        const info = `${deviceMemory} GB (~${deviceMemory * 1024} MB)`;
        return { gb: deviceMemory, mb: deviceMemory * 1024, info };
    }
    
    return { info: '未檢測到' };
}

/**
 * 獲取完整系統資訊（純網頁 API）
 */
export function getSystemInfo(): SystemInfo {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const { osName, osVersion } = parseOS(ua);
    const { browserName, browserVersion } = parseBrowser(ua);
    const { deviceCategory, deviceModel } = parseDevice(ua);
    
    const networkInfo = getNetworkInfo();
    const cpuInfo = getCpuInfo();
    const memoryInfo = getMemoryInfo();

    // 調試：列出網路 API 詳細資訊
    if (typeof window !== 'undefined') {
        const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
        if (conn) {
            console.log('[Network API] Available:', {
                type: conn.type,
                effectiveType: conn.effectiveType,
                downlink: conn.downlink,
                rtt: conn.rtt,
                saveData: conn.saveData,
            });
        } else {
            console.log('[Network API] Not available in this browser');
        }
    }

    return {
        osName,
        osVersion,
        browserName,
        browserVersion,
        deviceCategory,
        deviceModel,
        networkType: networkInfo.type,
        networkIsWired: networkInfo.isWired,
        userAgent: ua,
    };
}
