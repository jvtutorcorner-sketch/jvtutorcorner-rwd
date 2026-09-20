// components/home/ClassroomMock.tsx
/**
 * 純 HTML/CSS 的「線上教室」示意圖，用於首頁 Hero 與教學體驗區。
 *
 * 不載入任何圖片：以 CSS 畫出視訊格、白板筆跡、教材頁籤與「上課中」標記，
 * 讓使用者第一眼看到「正在發生的線上教學」。整體是裝飾性內容（aria-hidden），
 * 只有 liveLabel 是可翻譯文字，由呼叫端傳入。
 */

interface ClassroomMockProps {
  /** md：Hero 右側；lg：教學體驗區左側（略大、資訊多一點） */
  size?: 'md' | 'lg';
  /** 「上課中 / LIVE」標記文字 */
  liveLabel: string;
  className?: string;
}

export function ClassroomMock({ size = 'md', liveLabel, className = '' }: ClassroomMockProps) {
  return (
    <div className={`cm ${size === 'lg' ? 'cm--lg' : ''} ${className}`} aria-hidden="true">
      <div className="cm-window">
        {/* 視窗列 */}
        <div className="cm-topbar">
          <span className="cm-dot" />
          <span className="cm-dot" />
          <span className="cm-dot" />
          <span className="cm-live">
            <span className="cm-live-pulse" />
            {liveLabel}
          </span>
        </div>

        {/* 教材頁籤 */}
        <div className="cm-tabs">
          <span className="cm-tab cm-tab--active" />
          <span className="cm-tab" />
          <span className="cm-tab" />
        </div>

        {/* 白板 + 視訊 */}
        <div className="cm-stage">
          <div className="cm-board">
            <svg className="cm-ink" viewBox="0 0 220 130" preserveAspectRatio="none">
              <path d="M12 96 C 40 40, 70 40, 96 88 S 150 20, 208 60" />
              <path className="cm-ink--accent" d="M20 112 C 60 100, 110 118, 200 104" />
            </svg>
            <span className="cm-board-line" style={{ width: '62%' }} />
            <span className="cm-board-line" style={{ width: '44%' }} />
            <span className="cm-board-line cm-board-line--muted" style={{ width: '72%' }} />
          </div>

          <div className="cm-video">
            <span className="cm-avatar">T</span>
            <span className="cm-wave">
              <i /><i /><i /><i /><i />
            </span>
          </div>
        </div>

        {/* 工具列 */}
        <div className="cm-tools">
          <span className="cm-tool" />
          <span className="cm-tool" />
          <span className="cm-tool" />
          <span className="cm-tool cm-tool--wide" />
        </div>
      </div>
    </div>
  );
}

export default ClassroomMock;
