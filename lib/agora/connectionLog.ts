// lib/agora/connectionLog.ts
export interface AgoraConnectionLogParams {
    userId?: string;
    courseId?: string;
    page: string;
    role?: string;
    orderId?: string | null;
}

/**
 * Extracts device OS and Browser info from the User Agent.
 */
function getDevicePlatform() {
    if (typeof window === 'undefined') {
        return { os: 'unknown', browser: 'unknown', device: 'unknown' };
    }

    const ua = navigator.userAgent;
    let os = 'unknown';
    let browser = 'unknown';
    let device = 'desktop';

    // Detect OS
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X/i.test(ua)) os = 'MacOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    // Detect Browser
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua) && !/OPR/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Edg/i.test(ua)) browser = 'Edge';
    else if (/OPR/i.test(ua)) browser = 'Opera';

    // Detect Device Type
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
        device = 'mobile';
    } else if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        device = 'tablet';
    }

    return { os, browser, device };
}

/**
 * Logs the device information and connection parameters to DynamoDB.
 */
export async function logAgoraConnection(params: AgoraConnectionLogParams) {
    try {
        const { os, browser, device } = getDevicePlatform();
        let agoraVersion = 'unknown';
        let systemRequirements = null;

        // Load Agora dynamically to get version and system requirements
        if (typeof window !== 'undefined') {
            const AgoraModule = await import('agora-rtc-sdk-ng');
            const Agora = (AgoraModule as any).default ?? AgoraModule;

            agoraVersion = Agora.VERSION || 'unknown';
            systemRequirements = Agora.checkSystemRequirements ? Agora.checkSystemRequirements() : null;
        }

        const payload = {
            ...params,
            os,
            browser,
            device,
            agoraVersion,
            systemRequirements,
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
