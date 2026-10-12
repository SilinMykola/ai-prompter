import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LivePhrase } from './LivePhrase';

describe('LivePhrase', () => {
  it('shows the confirmed part normally and the guessed part separately', () => {
    render(<LivePhrase finalText="Wie geht" interimText="es Ihnen" speaking={false} />);

    expect(screen.getByText('Wie geht')).not.toHaveClass('live__guess');
    expect(screen.getByText('es Ihnen')).toHaveClass('live__guess');
  });

  it('shows only the confirmed part when nothing is guessed', () => {
    render(<LivePhrase finalText="Wie geht" interimText="" speaking={false} />);

    expect(screen.getByText('Wie geht')).toBeInTheDocument();
  });

  it('is hidden when both parts are empty', () => {
    const { container } = render(<LivePhrase finalText="" interimText="" speaking />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a pulsing marker only while the other person speaks', () => {
    const { rerender } = render(<LivePhrase finalText="Wie" interimText="" speaking />);
    expect(screen.getByTestId('live-dot')).toHaveAttribute('data-speaking', 'true');

    rerender(<LivePhrase finalText="Wie" interimText="" speaking={false} />);
    expect(screen.getByTestId('live-dot')).toHaveAttribute('data-speaking', 'false');
  });
});
