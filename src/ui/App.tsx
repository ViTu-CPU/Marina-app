import { useEffect, type ReactNode } from 'react';
import { appStore, useAppStore } from '../state/store';
import { LeftSidebar } from './panels/LeftSidebar';
import { RightSidebar } from './panels/RightSidebar';
import { Toolbar } from './panels/Toolbar';
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

/** The frame of the app. The canvas is passed in so the frame can be tested without one. */
export function AppShell({ canvas }: { canvas: ReactNode }) {
  const t = useT();
  const notice = useAppStore((s) => s.notice);
  useShortcuts();
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
        <LeftSidebar />
        <main className="min-w-0 flex-1">{canvas}</main>
        <RightSidebar />
      </div>
      <footer role="note" className="border-t border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-900">
        {t('app.disclaimer')}
      </footer>
    </div>
  );
}
