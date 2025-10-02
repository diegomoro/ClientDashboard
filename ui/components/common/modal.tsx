"use client";

import { ReactNode } from "react";

export function Modal({ open, title, children, onCancel, onConfirm, confirmLabel = "Confirm" }: {
  open: boolean;
  title: string;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} aria-hidden />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-md border border-neutral-200 bg-white p-4 shadow-lg">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        {children ? <div className="mt-2 text-sm text-neutral-700">{children}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">Cancel</button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

