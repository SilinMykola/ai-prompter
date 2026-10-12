import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { isNearBottom, useAutoScroll } from './useAutoScroll';

// jsdom does no layout, so a test says how big the scroll area is.
function sizeIt(element: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => clientHeight });
}

describe('isNearBottom', () => {
  const box = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 }) as HTMLElement;

  it('is true at the bottom and within 40 px of it', () => {
    expect(isNearBottom(box(600))).toBe(true);
    expect(isNearBottom(box(560))).toBe(true);
  });

  it('is false when further away', () => {
    expect(isNearBottom(box(559))).toBe(false);
    expect(isNearBottom(box(0))).toBe(false);
  });
});

function Feed({ version }: { version: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useAutoScroll(ref, version);
  return <div ref={ref} data-testid="feed" />;
}

describe('useAutoScroll', () => {
  it('follows new content while the user is at the bottom', () => {
    const view = render(<Feed version={1} />);
    const feed = screen.getByTestId('feed');
    sizeIt(feed, { scrollHeight: 1000, clientHeight: 400 });
    feed.scrollTop = 600; // at the bottom

    sizeIt(feed, { scrollHeight: 1200, clientHeight: 400 }); // new content made it taller
    view.rerender(<Feed version={2} />);

    expect(feed.scrollTop).toBe(1200);
  });

  it('stays where it is once the user scrolled up', () => {
    const view = render(<Feed version={1} />);
    const feed = screen.getByTestId('feed');
    sizeIt(feed, { scrollHeight: 1000, clientHeight: 400 });
    feed.scrollTop = 100;
    fireEvent.scroll(feed);

    sizeIt(feed, { scrollHeight: 1200, clientHeight: 400 });
    view.rerender(<Feed version={2} />);

    expect(feed.scrollTop).toBe(100);
  });

  it('follows again after the user returns to the bottom', () => {
    const view = render(<Feed version={1} />);
    const feed = screen.getByTestId('feed');
    sizeIt(feed, { scrollHeight: 1000, clientHeight: 400 });
    feed.scrollTop = 100;
    fireEvent.scroll(feed);
    feed.scrollTop = 600;
    fireEvent.scroll(feed);

    sizeIt(feed, { scrollHeight: 1200, clientHeight: 400 });
    view.rerender(<Feed version={2} />);

    expect(feed.scrollTop).toBe(1200);
  });

  it('starts out following', () => {
    const view = render(<Feed version={1} />);
    const feed = screen.getByTestId('feed');
    sizeIt(feed, { scrollHeight: 800, clientHeight: 400 });

    view.rerender(<Feed version={2} />);

    expect(feed.scrollTop).toBe(800);
  });
});
