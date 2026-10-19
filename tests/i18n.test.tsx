import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Workspace from '../src/Workspace';

describe('dashboard language preference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('defaults to English and exposes an accessible language switch', () => {
    render(<Workspace />);
    const button = screen.getByRole('button', { name: 'Language' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Network overview/ })).toBeTruthy();
  });

  it('switches presentation labels to Hindi, rerenders, and persists the preference', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'Language' }));
    expect(screen.getByRole('button', { name: 'भाषा' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /नेटवर्क अवलोकन/ })).toBeTruthy();
    expect(screen.getByText('सिमुलेशन मोड')).toBeTruthy();
    expect(screen.getByText('सड़क पर जानवर')).toBeTruthy();
    expect(localStorage.getItem('roadguard.language')).toBe('hi');
  });

  it('restores Hindi on a fresh dashboard mount', () => {
    localStorage.setItem('roadguard.language', 'hi');
    render(<Workspace />);
    expect(screen.getByRole('button', { name: /नेटवर्क अवलोकन/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'भाषा' }).getAttribute('aria-pressed')).toBe('true');
  });
});
