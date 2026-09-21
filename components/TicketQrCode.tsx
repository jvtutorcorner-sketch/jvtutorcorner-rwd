'use client';

import { QRCodeSVG } from 'qrcode.react';

export default function TicketQrCode({ value }: { value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24, background: '#fff', borderRadius: 12 }}>
      <QRCodeSVG value={value} size={220} level="M" includeMargin />
    </div>
  );
}
