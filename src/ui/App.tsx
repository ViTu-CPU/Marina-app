import { useEffect, useState, type ReactNode } from 'react';
import { appStore, useAppStore } from '../state/store';
import { LeftSidebar } from './panels/LeftSidebar';
import { RightSidebar } from './panels/RightSidebar';
import { Toolbar } from './panels/Toolbar';
import { WaveTool } from './panels/WaveTool';
import { useAutoSiteDepth } from './siteDepth';
import { useT } from './useT';

/** Keyboard shortcuts: undo/redo, and finishing or cancelling the shape being drawn. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const s = appStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'Escape') {
        if (s.draft.length > 0) s.cancelDraft();
        else if (s.tool !== 'select') s.setTool('select');
        else if (s.waveToolOpen && !typing) s.setWaveToolOpen(false);
      } else if (e.key === 'Enter' && !typing && s.draft.length > 0) {
        // Without this, Enter would also press the focused tool button again.
        e.preventDefault();
        s.finishDraft();
      } else if (e.key === 'Backspace' && !typing && s.draft.length > 0) {
        e.preventDefault();
        s.removeLastDraftPoint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * UI_REVIEW 5: on an empty project, a choice between a layout study and a wave study alone.
 * It goes away once anything is drawn, a tool or the wave panel is opened, or it is dismissed.
 */
function StartChoice() {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const empty = useAppStore(
    (s) => s.project.site.water.length === 0 && s.project.layouts.length === 0 && s.project.waves.sectors.every((x) => !(x.fetch > 0)) && s.tool === 'select' && s.draft.length === 0 && !s.waveToolOpen,
  );
  if (!empty || dismissed) return null;
  const card = 'flex-1 rounded border border-slate-200 bg-white p-3 text-left hover:border-sky-500 hover:bg-sky-50';
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div role="region" aria-label={t('start.title')} data-testid="start-choice" className="pointer-events-auto w-full max-w-xl rounded-lg border border-slate-200 bg-white/95 p-4 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">{t('start.title')}</h2>
          <button type="button" className="rounded px-2 text-xs text-slate-500 hover:bg-slate-100" onClick={() => setDismissed(true)}>
            {t('notice.dismiss')}
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className={card} onClick={() => appStore.getState().setTool('water')}>
            <div className="font-medium text-slate-900">{t('start.layout')}</div>
            <div className="mt-1 text-xs text-slate-600">{t('start.layoutHint')}</div>
          </button>
          <button type="button" className={card} onClick={() => appStore.getState().setWaveToolOpen(true)}>
            <div className="font-medium text-slate-900">{t('start.waves')}</div>
            <div className="mt-1 text-xs text-slate-600">{t('start.wavesHint')}</div>
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('start.example')}</p>
      </div>
    </div>
  );
}

/** The frame of the app. The canvas is passed in so the frame can be tested without one. */
export function AppShell({ canvas }: { canvas: ReactNode }) {
  const t = useT();
  const notice = useAppStore((s) => s.notice);
  const waveOpen = useAppStore((s) => s.waveToolOpen);
  useShortcuts();
  useAutoSiteDepth();
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <Toolbar />
      {notice && (
        <div role="alert" className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-1 text-sm text-red-900">
          <span>{notice}</span>
          <button type="button" className="rounded px-2 text-xs hover:bg-red-100" onClick={() => appStore.getState().setNotice(null)}>
            {t('notice.dismiss')}
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* UI_REVIEW 4: the wave panel takes the place of the layout panels, beside the map. */}
        {!waveOpen && <LeftSidebar />}
        <main className="relative min-w-0 flex-1">
          {canvas}
          <StartChoice />
        </main>
        {waveOpen ? <WaveTool /> : <RightSidebar />}
      </div>
      <footer role="note" className="border-t border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-900">
        {t('app.disclaimer')}
      </footer>
    </div>
  );
}
