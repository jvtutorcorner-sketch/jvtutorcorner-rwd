"use client";

import { PropsWithChildren } from 'react';

export default function Modal({ children, onClose }: PropsWithChildren<{ onClose: () => void }>) {
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="modal bg-white rounded-lg shadow-lg w-full max-w-3xl mx-4 p-6 relative">
        <button
          aria-label="Close modal"
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
        >
          ✕
        </button>
        {children}
      </div>
      <style jsx>{`
        .modal-backdrop { background: rgba(0,0,0,0.5); }
      `}</style>
    </div>
  );
}
