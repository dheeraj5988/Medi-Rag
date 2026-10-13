import React from 'react';
import { AlertOctagon, PhoneCall, X } from 'lucide-react';
import { RedFlagAlert } from '../types';

interface EmergencyBannerProps {
  alert: RedFlagAlert;
  onDismiss?: () => void;
}

/**
 * Highest-priority element in the app: full width, solid red, always the first thing on screen
 * (it sits above the header and never scrolls away). Intentionally NOT styled "playful".
 */
export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({ alert, onDismiss }) => {
  if (!alert.triggered) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="shrink-0 z-50 bg-rose-700 text-white px-4 py-2.5 sm:py-4 border-b-4 border-rose-950 pt-[calc(0.5rem+var(--safe-top))] print:hidden"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <AlertOctagon className="w-7 h-7 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-extrabold text-base tracking-wide uppercase">Possible emergency <span className="normal-case tracking-normal font-bold text-sm opacity-90">- {alert.emergencyType}</span></p>
            <p className="text-base font-semibold mt-1 leading-snug">{alert.immediateAction}</p>
            <p className="hidden sm:block text-xs text-rose-100 mt-1.5 break-words">
              Detected: <span className="underline font-mono">{alert.matchedKeywords.join(', ')}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="tel:112"
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl bg-white text-rose-800 font-extrabold text-base border-2 border-white hover:bg-rose-50"
          >
            <PhoneCall className="w-5 h-5" />
            <span>Call 112</span>
          </a>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Acknowledge alert"
              className="inline-flex items-center justify-center min-h-12 min-w-12 rounded-xl border-2 border-rose-200 text-white hover:bg-rose-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="hidden sm:block md:hidden text-xs text-rose-100">Or use your local emergency number (for example 911 or 108).</p>
      </div>
    </div>
  );
};
