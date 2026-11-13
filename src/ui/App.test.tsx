// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

describe('App shell', () => {
  it('shows the mandatory disclaimer (SPEC §1)', () => {
    render(<App />);
    expect(screen.getByRole('note').textContent).toBe(
      'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.',
    );
  });

  it('renders Finnish strings when the language is fi', () => {
    render(<App language="fi" />);
    expect(screen.getByRole('heading').textContent).toBe('Venesataman asettelusuunnittelu');
  });
});
