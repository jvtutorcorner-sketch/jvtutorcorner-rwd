import React, { useMemo } from 'react';
import { useT } from './IntlProvider';

interface Props {
  triggerFix: () => Promise<boolean> | Promise<void>;
  fixStatus: 'idle' | 'fixing' | 'success' | 'error';
  className?: string;
}

export const TroubleshootButton: React.FC<Props> = ({ triggerFix, fixStatus, className }) => {
  const t = useT();
  const isFixing = fixStatus === 'fixing';
  const label = useMemo(() => {
    if (fixStatus === 'fixing') return t('troubleshoot_fixing');
    if (fixStatus === 'success') return t('troubleshoot_success');
    if (fixStatus === 'error') return t('troubleshoot_error');
    return t('troubleshoot_button');
  }, [fixStatus, t]);

  return (
    <button
      type="button"
      disabled={isFixing}
      onClick={() => void triggerFix()}
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      {isFixing ? (
        <svg width="16" height="16" viewBox="0 0 50 50" aria-hidden>
          <path
            fill="#000"
            d="M43.935,25.145c0-10.318-8.365-18.683-18.683-18.683c-10.318,0-18.683,8.365-18.683,18.683h4.068
              c0-8.071,6.544-14.615,14.615-14.615c8.071,0,14.615,6.544,14.615,14.615H43.935z"
          >
            <animateTransform
              attributeType="xml"
              attributeName="transform"
              type="rotate"
              from="0 25 25"
              to="360 25 25"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      ) : null}

      <span>{label}</span>
    </button>
  );
};

export default TroubleshootButton;
