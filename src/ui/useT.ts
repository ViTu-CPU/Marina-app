import { useCallback } from 'react';
import { translate, type StringKey } from '../i18n';
import { useAppStore } from '../state/store';

/** Translation function bound to the current UI language. */
export function useT(): (key: StringKey) => string {
  const language = useAppStore((s) => s.language);
  return useCallback((key: StringKey) => translate(language, key), [language]);
}
