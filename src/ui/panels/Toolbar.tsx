import { useRef } from 'react';
import { DEMO_PROJECTS } from '../../engine/demos';
import { serializeProject } from '../../state/projectFile';
import { appStore, needsRegeneration, useAppStore } from '../../state/store';
import { buildCsv } from '../export/csv';
import { downloadText, exportPng, readFileAsText, safeFileName } from '../export/download';
import { useT } from '../useT';
import { Button } from './fields';

/** True when there is nothing to lose by replacing the project. */
const isPristine = (): boolean => {
  const { project, past } = appStore.getState();
  return past.length === 0 && project.site.water.length === 0 && project.layouts.length === 0;
};

export function Toolbar() {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const language = useAppStore((s) => s.language);
  const canUndo = useAppStore((s) => s.past.length > 0);
  const canRedo = useAppStore((s) => s.future.length > 0);
  const stale = useAppStore((s) => needsRegeneration(s.project));
  const hasLayouts = useAppStore((s) => s.project.layouts.length > 0);

  const confirmDiscard = (): boolean => isPristine() || window.confirm(t('confirm.discard'));
  const state = () => appStore.getState();
  const baseName = () => safeFileName(state().project.name);

  return (
    <header className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1.5">
      <h1 className="mr-2 text-base font-semibold text-slate-900">{t('app.title')}</h1>

      <Button onClick={() => confirmDiscard() && state().newProject()}>{t('toolbar.new')}</Button>
      <Button onClick={() => fileInput.current?.click()}>{t('toolbar.open')}</Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        data-testid="open-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            if (state().openProjectFile(await readFileAsText(file))) state().fitView();
          } catch {
            state().setNotice('The file could not be read.');
          }
        }}
      />
      <Button onClick={() => downloadText(`${baseName()}.marina.json`, serializeProject(state().project), 'application/json')}>
        {t('toolbar.save')}
      </Button>
      <select
        aria-label={t('toolbar.examples')}
        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm"
        value=""
        onChange={(e) => {
          const id = e.target.value as (typeof DEMO_PROJECTS)[number]['id'];
          if (id && confirmDiscard()) {
            state().loadDemo(id);
            state().fitView();
          }
        }}
      >
        <option value="">{t('toolbar.examples')}…</option>
        {DEMO_PROJECTS.map((d) => (
          <option key={d.id} value={d.id}>
            {t(`demo.${d.id}`)}
          </option>
        ))}
      </select>

      <span className="mx-1 h-5 w-px bg-slate-300" />
      <Button onClick={() => state().undo()} disabled={!canUndo} title="Ctrl+Z">
        {t('toolbar.undo')}
      </Button>
      <Button onClick={() => state().redo()} disabled={!canRedo} title="Ctrl+Y">
        {t('toolbar.redo')}
      </Button>

      <span className="mx-1 h-5 w-px bg-slate-300" />
      <Button variant="primary" onClick={() => state().generate()}>
        {stale ? t('toolbar.regenerate') : t('toolbar.generate')}
      </Button>
      {stale && (
        <span role="status" className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
          {t('toolbar.regenerateHint')}
        </span>
      )}

      <span className="mx-1 h-5 w-px bg-slate-300" />
      <Button onClick={() => exportPng(`${baseName()}.png`)}>{t('toolbar.exportPng')}</Button>
      <Button
        disabled={!hasLayouts}
        onClick={() =>
          // The byte-order mark makes spreadsheet programs read the file as UTF-8.
          downloadText(`${baseName()}.csv`, `﻿${buildCsv(state().project, state().selectedLayoutId, language)}`, 'text/csv')
        }
      >
        {t('toolbar.exportCsv')}
      </Button>
      <Button onClick={() => state().fitView()}>{t('toolbar.fit')}</Button>

      <div className="ml-auto flex items-center gap-1" role="group" aria-label={t('toolbar.language')}>
        <Button active={language === 'en'} onClick={() => state().setLanguage('en')}>
          EN
        </Button>
        <Button active={language === 'fi'} onClick={() => state().setLanguage('fi')}>
          FI
        </Button>
      </div>
    </header>
  );
}
