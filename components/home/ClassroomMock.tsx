// components/home/ClassroomMock.tsx
/**
 * 首頁 Hero 與教學體驗區的「真人老師 ＋ AI 助教 ＋ 學生」互動情境圖。
 *
 * 圖是 AI 生成的示意圖（筆電上的教室畫面：教材紅筆圈選、老師與學生視訊），原圖的橫幅標題
 * 已裁掉，文字都由頁面本身提供，所以三種語系都不會出現沒翻譯的字。
 * 根節點維持 `.cm` 這個 class（e2e 以它判斷 Hero 的視覺區塊存在）。
 */

interface ClassroomMockProps {
  /** md：Hero 右側；lg：教學體驗區左側（略大） */
  size?: 'md' | 'lg';
  /** 圖片替代文字（螢幕閱讀器用） */
  alt: string;
  className?: string;
}

export const CLASSROOM_VISUAL_SRC = '/home/teacher-ai-interaction.webp';

export function ClassroomMock({ size = 'md', alt, className = '' }: ClassroomMockProps) {
  return (
    <figure className={`cm cm-photo ${size === 'lg' ? 'cm--lg' : ''} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CLASSROOM_VISUAL_SRC}
        alt={alt}
        width={999}
        height={847}
        loading={size === 'lg' ? 'lazy' : 'eager'}
        decoding="async"
      />
    </figure>
  );
}

export default ClassroomMock;
