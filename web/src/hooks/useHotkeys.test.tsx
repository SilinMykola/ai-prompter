import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useHotkeys } from './useHotkeys';

function Harness({ onShort, onDetailed }: { onShort(): void; onDetailed(): void }) {
  useHotkeys({ onShort, onDetailed });
  return (
    <div>
      <input aria-label="field" />
      <textarea aria-label="notes" />
      <select aria-label="list">
        <option>a</option>
      </select>
      <div aria-label="editable" contentEditable suppressContentEditableWarning />
      <button>plain button</button>
    </div>
  );
}

function setup() {
  const onShort = vi.fn();
  const onDetailed = vi.fn();
  const view = render(<Harness onShort={onShort} onDetailed={onDetailed} />);
  return { onShort, onDetailed, ...view };
}

describe('useHotkeys', () => {
  it('"1" asks for a short hint and "2" for a detailed one', () => {
    const { onShort, onDetailed } = setup();

    fireEvent.keyDown(document.body, { key: '1' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(onShort).toHaveBeenCalledTimes(1);
    expect(onDetailed).toHaveBeenCalledTimes(1);
  });

  it('works when a button has the focus', () => {
    const { onShort, getByText } = setup();

    fireEvent.keyDown(getByText('plain button'), { key: '1' });

    expect(onShort).toHaveBeenCalledTimes(1);
  });

  it.each(['field', 'notes', 'list', 'editable'])('is ignored while typing in "%s"', (label) => {
    const { onShort, onDetailed, getByLabelText } = setup();

    fireEvent.keyDown(getByLabelText(label), { key: '1' });
    fireEvent.keyDown(getByLabelText(label), { key: '2' });

    expect(onShort).not.toHaveBeenCalled();
    expect(onDetailed).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }])('is ignored with a modifier key %j', (modifier) => {
    const { onShort } = setup();

    fireEvent.keyDown(document.body, { key: '1', ...modifier });

    expect(onShort).not.toHaveBeenCalled();
  });

  it('ignores a held-down key (auto repeat)', () => {
    const { onShort } = setup();

    fireEvent.keyDown(document.body, { key: '1', repeat: true });

    expect(onShort).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const { onShort, onDetailed } = setup();

    fireEvent.keyDown(document.body, { key: '3' });
    fireEvent.keyDown(document.body, { key: 'a' });

    expect(onShort).not.toHaveBeenCalled();
    expect(onDetailed).not.toHaveBeenCalled();
  });

  it('uses the newest handlers after a re-render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Harness onShort={first} onDetailed={() => {}} />);

    view.rerender(<Harness onShort={second} onDetailed={() => {}} />);
    fireEvent.keyDown(document.body, { key: '1' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the component goes away', () => {
    const { onShort, unmount } = setup();

    unmount();
    fireEvent.keyDown(document.body, { key: '1' });

    expect(onShort).not.toHaveBeenCalled();
  });
});

describe('useHotkeys in another window', () => {
  // The floating window is another window with its own document (here: an iframe's).
  function otherWindow() {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    return iframe.contentWindow!;
  }

  function HarnessFor({ target, onShort, onDetailed }: { target: Window; onShort(): void; onDetailed(): void }) {
    useHotkeys({ onShort, onDetailed }, target);
    return null;
  }

  it('listens in that window only', () => {
    const win = otherWindow();
    const onShort = vi.fn();
    render(<HarnessFor target={win} onShort={onShort} onDetailed={() => {}} />);

    fireEvent.keyDown(document.body, { key: '1' }); // main window: not listened to
    expect(onShort).not.toHaveBeenCalled();
    fireEvent.keyDown(win.document.body, { key: '1' }); // the other window

    expect(onShort).toHaveBeenCalledTimes(1);
  });

  it('still ignores keys typed into a field of that window', () => {
    const win = otherWindow();
    const onShort = vi.fn();
    render(<HarnessFor target={win} onShort={onShort} onDetailed={() => {}} />);
    const field = win.document.createElement('textarea'); // an element of the *other* window's classes
    win.document.body.append(field);

    fireEvent.keyDown(field, { key: '1' });

    expect(onShort).not.toHaveBeenCalled();
  });

  it('moves its listener when the target window changes', () => {
    const first = otherWindow();
    const second = otherWindow();
    const onShort = vi.fn();
    const view = render(<HarnessFor target={first} onShort={onShort} onDetailed={() => {}} />);

    view.rerender(<HarnessFor target={second} onShort={onShort} onDetailed={() => {}} />);
    fireEvent.keyDown(first.document.body, { key: '1' });
    expect(onShort).not.toHaveBeenCalled();
    fireEvent.keyDown(second.document.body, { key: '1' });

    expect(onShort).toHaveBeenCalledTimes(1);
  });
});
