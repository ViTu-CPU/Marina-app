import { useEffect, useRef, useState } from 'react';
import { DEMO_PROJECTS } from '../../engine/demos';
import { serializeProject } from '../../state/projectFile';
import { appStore, needsRegeneration, useAppStore } from '../../state/store';
import { buildCsv } from '../export/csv';
import { canvasImage, downloadText, exportPng, printHtml, readFileAsText, safeFileName } from '../export/download';
import { buildReportHtml } from '../export/report';
import { buildDxf } from '../export/dxf';
import { computeCostModel } from '../costModel';
import { useT } from '../useT';
import { Button } from './fields';

/** True when there is nothing to lose by replacing the project. */
const isPristine = (): boolean => {
  const { project, past } = appStore.getState();
  return past.length === 0 && project.site.water.length === 0 && project.layouts.length === 0;
};

interface MenuItem {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}

/** A button that opens a list of actions; closes on a choice, Escape or a click outside. */
function ExportMenu({ items }: { items: MenuItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded border px-2 py-1 text-sm ${open ? 'border-sky-600 bg-sky-100 text-sky-900' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'}`}
        onClick={() => setOpen(!open)}
      >
        {t('toolbar.export')} ▾
      </button>
      {open && (
        <div role="menu" aria-label={t('toolbar.export')} className="absolute left-0 top-full z-40 mt-1 w-56 rounded border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const language = useAppStore((s) => s.language);
  const canUndo = useAppStore((s) => s.past.length > 0);
  const canRedo = useAppStore((s) => s.future.length > 0);
  const stale = useAppStore((s) => needsRegeneration(s.project));
  const generating = useAppStore((s) => s.generating);
  const waveOpen = useAppStore((s) => s.waveToolOpen);
  /** U24: report of the selected alternative, printed from a hidden frame ("Save as PDF"). */
  const printReport = () => {
    const s = state();
    const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
    if (!layout) {
      s.setNotice(t('report.noLayout'));
      return;
    }
    const model = computeCostModel(s.project, layout, s.builtInPriceList);
    printHtml(buildReportHtml({ project: s.project, layout, model, image: canvasImage(), language: s.language, date: new Date().toISOString().slice(0, 10) }));
  };
  const hasLayouts = useAppStore((s) => s.project.layouts.length > 0);
  /** D61, I111: the selected alternative as DXF with the product library as blocks. */
  const exportDxf = () => {
    const s = state();
    const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
    if (!layout) {
      s.setNotice(t('report.noLayout'));
      return;
    }
    const model = computeCostModel(s.project, layout, s.builtInPriceList);
    const text = buildDxf({ project: s.project, layout, priceList: model?.priceList ?? null, choices: model?.choices ?? null, vatPct: model?.vatPct ?? 0, date: new Date().toISOString().slice(0, 10) });
    downloadText(`${safeFileName(`${s.project.name}-${layout.name.split(' ')[0]}`)}.dxf`, text, 'application/dxf');
  };

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
      <Button variant="primary" onClick={() => state().generate()} disabled={generating}>
        {stale ? t('toolbar.regenerate') : t('toolbar.generate')}
      </Button>
      {generating && (
        <>
          <span role="status" className="animate-pulse rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-900">
            {t('toolbar.generating')}
          </span>
          <Button onClick={() => state().cancelGeneration()}>{t('toolbar.cancel')}</Button>
        </>
      )}
      {stale && !generating && (
        <span role="status" className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
          {t('toolbar.regenerateHint')}
        </span>
      )}

      <span className="mx-1 h-5 w-px bg-slate-300" />
      {/* UI_REVIEW 6: the four exports in one menu. */}
      <ExportMenu
        items={[
          { label: t('toolbar.exportPng'), onClick: () => exportPng(`${baseName()}.png`) },
          {
            label: t('toolbar.exportCsv'),
            disabled: !hasLayouts,
            // The byte-order mark makes spreadsheet programs read the file as UTF-8.
            onClick: () => downloadText(`${baseName()}.csv`, `﻿${buildCsv(state().project, state().selectedLayoutId, language)}`, 'text/csv'),
          },
          { label: t('toolbar.exportDxf'), title: t('toolbar.exportDxfHint'), disabled: !hasLayouts, onClick: exportDxf },
          { label: t('report.button'), title: t('report.printHint'), disabled: !hasLayouts, onClick: printReport },
        ]}
      />
      <Button onClick={() => state().fitView()}>{t('toolbar.fit')}</Button>
      {/* D40: the wave screening window. */}
      <Button active={waveOpen} title={t('toolbar.wavesHint')} onClick={() => state().setWaveToolOpen(!waveOpen)}>
        {t('toolbar.waves')}
      </Button>

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
