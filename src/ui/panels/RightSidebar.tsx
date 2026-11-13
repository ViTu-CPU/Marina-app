/** Right sidebar (SPEC §8): alternatives, selection, comparison table, issues. */
import { boundingBox } from '../../engine/geometry';
import type { Feasibility, Issue, Layout } from '../../engine/model';
import { pierAxis } from '../../engine/rows';
import { pierPolygon } from '../../engine/site';
import { appStore, useAppStore } from '../../state/store';
import { comparisonRows } from '../compare';
import { formatCount, formatLength } from '../format';
import { useT } from '../useT';
import { Button, Section } from './fields';

const state = () => appStore.getState();

const BADGE: Record<Feasibility, string> = {
  geometricFail: 'bg-red-100 text-red-800',
  geometricOK: 'bg-amber-100 text-amber-900',
  operationalOK: 'bg-emerald-100 text-emerald-800',
};

function FeasibilityBadge({ feasibility }: { feasibility: Feasibility }) {
  const t = useT();
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[feasibility]}`} title={t('feasibility.note')}>
      {t(`feasibility.${feasibility}`)}
    </span>
  );
}

function Alternatives() {
  const t = useT();
  const layouts = useAppStore((s) => s.project.layouts);
  const preferred = useAppStore((s) => s.project.preferredLayoutId);
  const selectedId = useAppStore((s) => s.selectedLayoutId);
  const diagnostics = useAppStore((s) => s.diagnostics);
  const language = useAppStore((s) => s.language);
  return (
    <Section title={t('results.alternatives')}>
      {diagnostics.length > 0 && (
        <ul role="alert" className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          {diagnostics.map((d) => (
            <li key={d.code}>{d.message}</li>
          ))}
        </ul>
      )}
      {layouts.length === 0 && diagnostics.length === 0 && <p className="text-sm text-slate-500">{t('results.none')}</p>}
      <ul className="space-y-1" aria-label={t('results.alternatives')}>
        {layouts.map((l) => (
          <li key={l.id}>
            <div
              role="button"
              tabIndex={0}
              aria-pressed={l.id === selectedId}
              data-testid="alternative"
              onClick={() => state().selectLayout(l.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && state().selectLayout(l.id)}
              className={`cursor-pointer rounded border p-2 text-sm ${l.id === selectedId ? 'border-sky-600 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-slate-900">
                  {l.id === preferred && <span title={t('results.preferred')}>★ </span>}
                  {l.name}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded px-1 text-xs text-slate-600 hover:bg-slate-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    state().setPreferredLayout(l.id === preferred ? null : l.id);
                  }}
                >
                  {l.id === preferred ? t('results.unmarkPreferred') : t('results.markPreferred')}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700">
                <span>
                  <strong>{formatCount(l.stats.totalBerths, language)}</strong> {t('results.berths')}
                </span>
                <span>
                  {formatLength(l.stats.pontoonLength, language)} m {t('results.pontoon')}
                </span>
                <FeasibilityBadge feasibility={l.feasibility} />
                {l.modified && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">{t('results.manuallyEdited')}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SelectionPanel({ layout }: { layout: Layout }) {
  const t = useT();
  const selection = useAppStore((s) => s.selection);
  const classes = useAppStore((s) => s.project.boatClasses);
  const language = useAppStore((s) => s.language);
  const row = (label: string, value: string) => (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );

  let body = <p className="text-sm text-slate-500">{t('selection.none')}</p>;
  const pier = selection?.kind === 'pier' ? layout.piers.find((p) => p.id === selection.id) : undefined;
  const berth = selection?.kind === 'berth' ? layout.berths.find((b) => b.id === selection.id) : undefined;
  if (pier) {
    const berths = layout.berths.filter((b) => b.pierId === pier.id && !b.removed).length;
    body = (
      <div className="space-y-1">
        {row(t('selection.pier'), pier.locked ? `${pier.id} (${t('selection.locked')})` : pier.id)}
        {row(t('selection.length'), `${formatLength(pierAxis(pier).length, language)} m`)}
        {row(t('selection.width'), `${formatLength(pier.width, language)} m`)}
        {row(t('selection.berthCount'), formatCount(berths, language))}
        <Button onClick={() => state().setPierLocked(layout.id, pier.id, !pier.locked)}>{pier.locked ? t('selection.unlock') : t('selection.lock')}</Button>
      </div>
    );
  } else if (berth) {
    const boat = classes.find((c) => c.id === berth.boatClassId);
    body = (
      <div className="space-y-1">
        {row(t('selection.berth'), berth.removed ? `${berth.id} (${t('selection.removed')})` : berth.id)}
        {row(t('selection.pier'), `${berth.pierId}, ${t(`side.${berth.side}`)}`)}
        {row(t('selection.class'), boat ? `${boat.name} (${formatLength(boat.length, language)} × ${formatLength(boat.beam, language)} m)` : berth.boatClassId)}
        <Button variant={berth.removed ? 'default' : 'danger'} onClick={() => state().setBerthRemoved(layout.id, berth.id, !berth.removed)}>
          {berth.removed ? t('selection.restore') : t('selection.remove')}
        </Button>
        {berth.issues.length > 0 && (
          <ul className="list-disc pl-4 text-xs text-red-800">
            {berth.issues.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return <Section title={t('selection.title')}>{body}</Section>;
}

function Comparison() {
  const t = useT();
  const layouts = useAppStore((s) => s.project.layouts);
  const classes = useAppStore((s) => s.project.boatClasses);
  const selectedId = useAppStore((s) => s.selectedLayoutId);
  const language = useAppStore((s) => s.language);
  if (layouts.length === 0) return null;
  const rows = comparisonRows(layouts, classes, language);
  return (
    <Section title={t('results.comparison')}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" data-testid="comparison">
          <thead>
            <tr>
              <th />
              {layouts.map((l) => (
                <th key={l.id} scope="col" className={`px-1 text-right font-semibold ${l.id === selectedId ? 'text-sky-800' : 'text-slate-700'}`} title={l.name}>
                  {l.strategy}
                  {l.modified ? '*' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100">
                <th scope="row" className={`py-0.5 pr-1 text-left font-normal text-slate-600 ${'text' in row.label ? 'pl-3' : ''}`}>
                  {'key' in row.label ? t(row.label.key) : row.label.text}
                  {row.unit && <span className="text-slate-400"> ({row.unit})</span>}
                </th>
                {row.values.map((value, k) => (
                  <td
                    key={k}
                    data-best={row.best.includes(k) || undefined}
                    className={`px-1 text-right tabular-nums ${row.best.includes(k) ? 'bg-emerald-100 font-semibold text-emerald-900' : 'text-slate-800'}`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function elementBox(layout: Layout, elementId: string) {
  const pier = layout.piers.find((p) => p.id === elementId);
  if (pier) return { box: boundingBox(pierPolygon(pier.start, pier.end, pier.width)), selection: { kind: 'pier' as const, id: pier.id } };
  const berth = layout.berths.find((b) => b.id === elementId);
  if (berth) return { box: boundingBox(berth.slot), selection: { kind: 'berth' as const, id: berth.id } };
  const finger = layout.fingers.find((f) => f.id === elementId);
  if (finger) return { box: boundingBox(finger.shape), selection: null };
  return null;
}

function Issues({ layout }: { layout: Layout }) {
  const t = useT();
  const show = (issue: Issue) => {
    if (!issue.elementId) return;
    const target = elementBox(layout, issue.elementId);
    if (!target) return;
    state().setTool('select');
    state().select(target.selection);
    state().zoomToBox(target.box);
  };
  const sorted = [...layout.issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return (
    <Section title={`${t('results.issues')} (${layout.issues.length})`}>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">{t('results.noIssues')}</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto" data-testid="issues">
          {sorted.map((issue, i) => (
            <li key={i}>
              <button type="button" onClick={() => show(issue)} className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100">
                <span className={`mt-0.5 shrink-0 rounded px-1 font-medium ${issue.severity === 'error' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                  {t(`severity.${issue.severity}`)}
                </span>
                <span className="text-slate-800">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RightSidebar() {
  const layout = useAppStore((s) => s.project.layouts.find((l) => l.id === s.selectedLayoutId) ?? null);
  return (
    <aside className="w-96 shrink-0 overflow-y-auto border-l border-slate-200 bg-white" aria-label="Results">
      <Alternatives />
      {layout && <SelectionPanel layout={layout} />}
      <Comparison />
      {layout && <Issues layout={layout} />}
    </aside>
  );
}
