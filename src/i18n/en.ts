/** English UI strings. This dictionary is the source of truth for the set of keys. */
export const en = {
  'app.title': 'Marina Layout Planner',
  'app.disclaimer':
    'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.',
} as const;

export type StringKey = keyof typeof en;
