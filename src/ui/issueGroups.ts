import type { Issue } from '../engine/model';

/** Issues of one kind (same severity and code), in their original order (U21). */
export interface IssueGroup {
  key: string;
  severity: Issue['severity'];
  code: string;
  issues: Issue[];
}

/**
 * Groups issues by severity and code, errors first, otherwise in order of first appearance.
 * A long list of near-identical warnings (e.g. one per anchor line) becomes one row.
 */
export function groupIssues(issues: readonly Issue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}`;
    const group = groups.get(key);
    if (group) group.issues.push(issue);
    else groups.set(key, { key, severity: issue.severity, code: issue.code, issues: [issue] });
  }
  const list = [...groups.values()];
  return [...list.filter((g) => g.severity === 'error'), ...list.filter((g) => g.severity !== 'error')];
}
