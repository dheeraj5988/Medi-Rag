import React from 'react';
import {
  MessageSquare,
  Stethoscope,
  BookOpen,
  FlaskConical,
  Settings,
  Info,
  FileCode,
  ShieldAlert,
  Moon,
  Sun,
} from 'lucide-react';

export type ScreenId = 'chat' | 'symptoms' | 'knowledge' | 'testlab' | 'settings' | 'about' | 'readme';

interface NavigationProps {
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  redFlagActive?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeScreen,
  onNavigate,
  darkMode,
  onToggleDarkMode,
  redFlagActive = false,
}) => {
  const navItems: Array<{ id: ScreenId; label: string; icon: React.ReactNode }> = [
    { id: 'chat', label: 'Consultation', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'symptoms', label: 'Symptom Checker', icon: <Stethoscope className="w-4 h-4" /> },
    { id: 'knowledge', label: 'Knowledge Base', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'testlab', label: 'Test Lab', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
    { id: 'about', label: 'About & Clinical Safety', icon: <Info className="w-4 h-4" /> },
    { id: 'readme', label: 'Architecture Doc', icon: <FileCode className="w-4 h-4" /> },
  ];

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Zone 1: Single text wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigate('chat')}
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-600 dark:bg-teal-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
              M
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                Medi-RAG
              </span>
              <span className="hidden sm:inline-block text-xs text-slate-500 dark:text-slate-400 ml-2 font-normal">
                Clinical Decision Support
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-1 overflow-x-auto py-1">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action + Theme Toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onToggleDarkMode}
            aria-label="Toggle color theme"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {redFlagActive ? (
            <button
              onClick={() => onNavigate('symptoms')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900 rounded-md whitespace-nowrap animate-pulse"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Red Flag Active</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('symptoms')}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md shadow-sm transition-colors whitespace-nowrap"
            >
              Check Symptoms
            </button>
          )}
        </div>
      </div>

      {/* Mobile nav drawer row */}
      <div className="md:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-colors ${
              activeScreen === item.id
                ? 'bg-teal-100 text-teal-900 dark:bg-teal-900/60 dark:text-teal-200 font-semibold'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
