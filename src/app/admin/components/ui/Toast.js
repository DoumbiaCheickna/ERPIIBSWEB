//src/app/admin/components/ui/Toast.js
'use client';

import { useState, useEffect } from 'react';

export default function Toast({ message, type, show, onClose }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => onClose(), 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  const bgClass = type === 'success' ? 'text-bg-success' : 'text-bg-danger';
  const title = type === 'success' ? 'Succès' : 'Erreur';

  return (
    <div
      className={`toast position-fixed bottom-0 end-0 m-3 ${bgClass}`}
      role="alert"
      style={{ display: show ? 'block' : 'none' }}
    >
      <div className={`toast-header ${bgClass} border-0`}>
        <strong className="me-auto text-white">{title}</strong>
        <button
          type="button"
          className="btn-close btn-close-white"
          onClick={onClose}
        ></button>
      </div>
      <div className="toast-body">{message}</div>
    </div>
  );
}