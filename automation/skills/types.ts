export interface QAExecutionResult {
    success: boolean;             // 測試判定結果 (Pass / Fail)
    skillName: string;            // Skill 名稱
    executedAt: string;           // 執行時間戳記
    durationMs: number;           // 總耗時
    logs: string[];               // 執行過程的詳細 Log 軌跡
    errorDetails?: {              // 失敗時的錯誤詳細資訊
        step: string;               // 在哪一個步驟發生異常
        message: string;            // 明確的錯誤原因
        screenshotPath?: string;    // (可選) 發生錯誤時的截圖路徑
    };
    page?: any;                   // (可選) 執行完成後保留的 Page 對象
}

export interface StudentEnrollAndEnterClassroomInput {
    environmentUrl?: string;      // 測試環境網址
    courseId?: string;            // 欲報名的課程 ID
    email?: string;               // 登入 Email
    password?: string;            // 登入密碼
    studentUniversalCode?: string; // 學生萬用驗證碼 (可選)
    timeoutMs?: number;           // 全局預設的等待超時時間
    keepOpen?: boolean;           // 執行後是否保留頁面與 Context (預設 false)
}

export interface TeacherEnterClassroomInput {
    environmentUrl?: string;      // 測試環境網址
    email?: string;               // 老師 Email
    password?: string;            // 老師 密碼
    courseId?: string;            // 指定課程 ID (若有多堂課時可用來過濾)
    timeoutMs?: number;           // 全局預設的等待超時時間
    keepOpen?: boolean;           // 執行後是否保留頁面與 Context (預設 false)
}

export interface ClassroomSyncInput {
    environmentUrl?: string;
    classroomId?: string;
    teacherEmail?: string;
    teacherPassword?: string;
    studentEmail?: string;
    studentPassword?: string;
    teacherUniversalCode?: string;
    studentUniversalCode?: string;
    syncTimeoutMs?: number;
}
