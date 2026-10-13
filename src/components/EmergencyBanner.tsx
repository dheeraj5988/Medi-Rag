import React from 'react';
import { AlertOctagon, PhoneCall, X } from 'lucide-react';
import { RedFlagAlert } from '../types';

interface EmergencyBannerProps {
  alert: RedFlagAlert;
  onDismiss?: () => void;
}

export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({ alert, onDismiss }) => {
  if (!alert.triggered) return null;

  return (
    <div
      role="alert"
      className="bg-rose-600 text-white p-4 sm:p-5 shadow-lg border-b-2 border-rose-800 transition-all duration-200"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2 bg-rose-700/80 rounded-lg shrink-0 mt-0.5">
            <AlertOctagon className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide uppercase text-rose-100">
                CRITICAL MEDICAL ALERT
              </span>
              <span className="text-xs bg-rose-800 px-2 py-0.5 rounded font-mono">
                {alert.emergencyType}
              </span>
            </div>
            <p className="text-sm font-semibold text-white mt-1 leading-snug">
              {alert.immediateAction}
            </p>
            <div className="text-xs text-rose-200 mt-1">
              Triggered keywords detected: <span className="underline font-mono">{alert.matchedKeywords.join(', ')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
          <a
            href="tel:911"
            className="flex items-center gap-2 bg-white text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-md font-bold text-sm shadow-sm transition-colors"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Call 911 / 112 / 108</span>
          </a>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Acknowledge alert"
              className="p-1.5 text-rose-200 hover:text-white rounded hover:bg-rose-700/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
