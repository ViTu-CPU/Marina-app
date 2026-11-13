import { translate, type Language } from '../i18n';

export function App({ language = 'en' }: { language?: Language }) {
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-lg font-semibold">{translate(language, 'app.title')}</h1>
      </header>
      <main className="flex-1" />
      <footer
        role="note"
        className="border-t border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-900"
      >
        {translate(language, 'app.disclaimer')}
      </footer>
    </div>
  );
}
