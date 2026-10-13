import React, { useState } from 'react';
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
  Menu,
  Type,
} from 'lucide-react';
import { Sheet } from './Sheet';

export type ScreenId = 'chat' | 'symptoms' | 'knowledge' | 'testlab' | 'settings' | 'about' | 'readme';

interface NavigationProps {
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  textSize: 'normal' | 'large';
  onToggleTextSize: () => void;
  redFlagActive?: boolean;
}

const NAV_ITEMS: Array<{ id: ScreenId; label: string; short: string; icon: React.ReactNode }> = [
  { id: 'symptoms', label: 'Symptom Checker', short: 'Check', icon: <Stethoscope className="w-5 h-5" /> },
  { id: 'chat', label: 'Consultation', short: 'Chat', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'knowledge', label: 'Knowledge Base', short: 'Library', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'testlab', label: 'Test Lab', short: 'Lab', icon: <FlaskConical className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { id: 'about', label: 'About & Clinical Safety', short: 'About', icon: <Info className="w-5 h-5" /> },
  { id: 'readme', label: 'Architecture Doc', short: 'Docs', icon: <FileCode className="w-5 h-5" /> },
];

const PRIMARY_TABS: ScreenId[] = ['symptoms', 'chat', 'knowledge', 'testlab'];

const Logo: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="flex items-center gap-2.5 text-left tap-auto min-h-0 shrink-0" aria-label="Medi-RAG home">
    <span className="floaty w-9 h-9 rounded-xl border-[1.5px] border-slate-900 dark:border-lime-400 bg-lime-400 text-slate-900 flex items-center justify-center font-display font-extrabold text-lg shadow-xs">
      M
    </span>
    <span className="font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none whitespace-nowrap">
      Medi-RAG
      <span className="hidden 2xl:block text-xs font-sans font-semibold text-slate-500 dark:text-slate-400 mt-0.5 tracking-normal">
        Educational health companion
      </span>
    </span>
  </button>
);

export const Navigation: React.FC<NavigationProps> = ({
  activeScreen,
  onNavigate,
  darkMode,
  onToggleDarkMode,
  textSize,
  onToggleTextSize,
  redFlagActive = false,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = !PRIMARY_TABS.includes(activeScreen);

  const go = (id: ScreenId) => {
    setMoreOpen(false);
    onNavigate(id);
  };

  return (
    <>
      {/* Top bar: slim on phones, full navigation from md up */}
      <header className="print:hidden shrink-0 border-b-[1.5px] border-slate-900 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-30 pt-[var(--safe-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <Logo onClick={() => go('symptoms')} />

          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-2 text-sm font-bold rounded-xl whitespace-nowrap border-[1.5px] transition-colors ${
                    isActive
                      ? 'bg-lime-400 text-slate-900 border-slate-900 dark:border-lime-400'
                      : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4' })}
                  {/* icon only from 768px, short label from 1024px, full label from 1536px */}
                  <span className="hidden 2xl:inline">{item.label}</span>
                  <span className="hidden lg:inline 2xl:hidden">{item.short}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {redFlagActive && (
              <button onClick={() => go('symptoms')} className="btn btn-danger btn-sm animate-pulse">
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden sm:inline">Red flag active</span>
              </button>
            )}
            <button onClick={onToggleTextSize} aria-pressed={textSize === 'large'} aria-label="Toggle larger text" className="btn btn-ghost btn-sm hidden md:inline-flex">
              <Type className="w-4 h-4" />
            </button>
            <button onClick={onToggleDarkMode} aria-label="Toggle color theme" className="btn btn-ghost btn-sm">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Bottom tab bar (phones only) */}
      <nav className="tabbar md:hidden print:hidden" aria-label="Main">
        {PRIMARY_TABS.map((id) => {
          const item = NAV_ITEMS.find((n) => n.id === id)!;
          return (
            <button key={id} className="tab" aria-current={activeScreen === id ? 'page' : undefined} onClick={() => go(id)}>
              {item.icon}
              <span>{item.short}</span>
            </button>
          );
        })}
        <button className="tab" aria-current={moreActive ? 'page' : undefined} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <Menu className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid gap-2">
          {(['settings', 'about', 'readme'] as ScreenId[]).map((id) => {
            const item = NAV_ITEMS.find((n) => n.id === id)!;
            return (
              <button key={id} onClick={() => go(id)} className="btn justify-start w-full text-left" aria-current={activeScreen === id ? 'page' : undefined}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onToggleDarkMode} className="btn w-full">
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button onClick={onToggleTextSize} aria-pressed={textSize === 'large'} className="btn w-full">
            <Type className="w-5 h-5" />
            <span>{textSize === 'large' ? 'Normal text' : 'Larger text'}</span>
          </button>
        </div>
        <p className="mt-5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Educational information, not a medical diagnosis. Please consult a qualified doctor. In an emergency contact your local emergency number.
        </p>
      </Sheet>
    </>
  );
};
