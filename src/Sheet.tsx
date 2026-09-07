import React, { useEffect, useRef } from "react";

/** A bottom sheet on a phone, a small card in the desktop frame. Native
 * <dialog>, so focus, Escape and the backdrop come for free.
 *
 * Only user gestures call `onClose`: the close button, the backdrop, and
 * Escape (the dialog's `cancel` event). The `close` event is deliberately
 * not used, because it also fires when the sheet is closed from code, which
 * happens whenever one sheet hands over to another. */
export function Sheet({
  open,
  onClose,
  label,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="sheet-body">
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          {children}
        </div>
      )}
    </dialog>
  );
}
