import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** accessible label when no visible title is given */
  label?: string;
}

/**
 * Bottom sheet on phones, centred dialog from `md` up (layout lives in index.css `.sheet`).
 * Closes on Escape and backdrop tap, locks body scroll, moves focus inside and restores it on close.
 */
export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, children, footer, label }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
      );
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      (lastFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : label || 'Dialog'}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="sheet-handle" />
            {title !== undefined && (
              <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="font-display text-lg font-bold min-w-0">{title}</div>
                <button type="button" onClick={onClose} className="btn btn-ghost btn-sm shrink-0" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-4">{children}</div>
            {footer && <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
