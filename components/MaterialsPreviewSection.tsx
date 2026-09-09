'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const ProtectedPdfPreview = dynamic(() => import('./ProtectedPdfPreview'), { ssr: false });

export interface CourseMaterial {
  key: string;
  name: string;
  size?: number;
  uploadedAt?: number;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MaterialsPreviewSection({
  courseId,
  materials,
}: {
  courseId: string;
  materials: CourseMaterial[];
}) {
  const [active, setActive] = useState<CourseMaterial | null>(null);

  if (!materials || materials.length === 0) {
    return <p style={{ color: '#6b7280' }}>尚無教材。</p>;
  }

  return (
    <>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
        {materials.map((m) => (
          <li key={m.key}>
            <button
              onClick={() => setActive(m)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="flex items-center gap-2 text-gray-800">
                📄 {m.name}
              </span>
              <span className="text-xs text-gray-400">{formatSize(m.size)}</span>
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <ProtectedPdfPreview
          title={active.name}
          previewUrl={`/api/courses/${courseId}/materials/preview?key=${encodeURIComponent(active.key)}`}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
