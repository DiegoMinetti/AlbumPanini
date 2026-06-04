import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Owned" value={42} accent="success" />);
    expect(screen.getByText('Owned')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
