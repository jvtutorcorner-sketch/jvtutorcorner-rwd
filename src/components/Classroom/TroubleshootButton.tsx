import React from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import useClassroomFix from '../../hooks/useClassroomFix';

type Props = {
  client: IAgoraRTCClient | null | undefined;
  localTracks: Array<ICameraVideoTrack | IMicrophoneAudioTrack | null | undefined>;
  className?: string;
};

export const TroubleshootButton: React.FC<Props> = ({ client, localTracks, className }) => {
  const { fixStatus, triggerFix } = useClassroomFix(client, localTracks);

  const handleClick = async () => {
    try {
      await triggerFix();
    } catch (e) {
      // swallow
    }
  };

  return (
    <button
      id="btn-troubleshoot"
      type="button"
      onClick={handleClick}
      disabled={fixStatus === 'fixing'}
      className={
        (className ?? '') +
        ' inline-flex items-center px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60'
      }
    >
      {fixStatus === 'fixing' ? (
        <>
          <svg className="animate-spin mr-2 h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          修復中...
        </>
      ) : fixStatus === 'success' ? (
        <span>✅ 修復成功</span>
      ) : fixStatus === 'error' ? (
        <span>❌ 修復失敗</span>
      ) : (
        <span>🔧 沒聲音/沒畫面點我</span>
      )}
    </button>
  );
};

export default TroubleshootButton;
