import { describe, expect, it } from 'vitest';
import type { Issue } from '../engine/model';
import { groupIssues } from './issueGroups';

const issue = (severity: Issue['severity'], code: string, message: string): Issue => ({ severity, code, message });

describe('grouped issues (U21)', () => {
  it('one row per severity and code, errors first, otherwise in order of first appearance', () => {
    const groups = groupIssues([
      issue('warning', 'SEVERAL_ANCHORS', 'Line P1-A1 needs 6 822 kg'),
      issue('warning', 'ANCHOR_OUTSIDE_WATER', '1 anchor lies outside'),
      issue('warning', 'SEVERAL_ANCHORS', 'Line P1-A2 needs 6 822 kg'),
      issue('error', 'OVERLAP', 'Pier P1 overlaps P2'),
      issue('warning', 'SEVERAL_ANCHORS', 'Line P2-A1 needs 4 652 kg'),
    ]);
    expect(groups.map((g) => [g.severity, g.code, g.issues.length])).toEqual([
      ['error', 'OVERLAP', 1],
      ['warning', 'SEVERAL_ANCHORS', 3],
      ['warning', 'ANCHOR_OUTSIDE_WATER', 1],
    ]);
    expect(groups[1]!.issues.map((i) => i.message)).toEqual(['Line P1-A1 needs 6 822 kg', 'Line P1-A2 needs 6 822 kg', 'Line P2-A1 needs 4 652 kg']);
    expect(groupIssues([])).toEqual([]);
  });
});
