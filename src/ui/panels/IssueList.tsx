/** Issue list with near-identical issues grouped into one row (U21). */
import { useState } from 'react';
import type { Issue } from '../../engine/model';
import { groupIssues, type IssueGroup } from '../issueGroups';
import { useT } from '../useT';

function IssueRow({ issue, onShow }: { issue: Issue; onShow?: ((issue: Issue) => void) | undefined }) {
  const t = useT();
  const badge = (
    <span className={`mt-0.5 shrink-0 rounded px-1 font-medium ${issue.severity === 'error' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
      {t(`severity.${issue.severity}`)}
    </span>
  );
  const body = <span className="text-slate-800">{issue.message}</span>;
  if (!onShow) {
    return (
      <div className="flex items-start gap-1.5 px-1 py-0.5 text-xs">
        {badge}
        {body}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onShow(issue)} className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100">
      {badge}
      {body}
    </button>
  );
}

function Group({ group, onShow }: { group: IssueGroup; onShow?: ((issue: Issue) => void) | undefined }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [first, ...rest] = group.issues;
  return (
    <li>
      <IssueRow issue={first!} onShow={onShow} />
      {rest.length > 0 && (
        <div className="pl-6">
          <button
            type="button"
            aria-expanded={open}
            className="rounded px-1 text-xs text-sky-800 underline hover:bg-sky-50"
            onClick={() => setOpen((x) => !x)}
          >
            {open ? t('issues.hide') : `+${rest.length} ${t('issues.similar')} – ${t('issues.showAll')}`}
          </button>
          {open && (
            <ul className="space-y-0.5">
              {rest.map((issue, i) => (
                <li key={i}>
                  <IssueRow issue={issue} onShow={onShow} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function IssueList({ issues, onShow, testId }: { issues: readonly Issue[]; onShow?: (issue: Issue) => void; testId?: string }) {
  return (
    <ul className="max-h-64 space-y-0.5 overflow-y-auto" data-testid={testId}>
      {groupIssues(issues).map((g) => (
        <Group key={g.key} group={g} onShow={onShow} />
      ))}
    </ul>
  );
}
