import { useEffect, useRef, type RefObject } from 'react';

// Keeps a scrolling list pinned to its newest content, like a chat or a terminal,
// but lets the user read the history: following pauses while they are scrolled up.

const NEAR_BOTTOM_PX = 40;

/** True if the element is scrolled to the bottom, or very close to it. */
export function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
}

/**
 * @param ref the scrolling element
 * @param trigger any value that changes when the content changes (for example the cards)
 */
export function useAutoScroll(ref: RefObject<HTMLElement | null>, trigger: unknown): void {
  // "Following" is remembered in a ref, not in state: changing it must not re-render anything.
  const following = useRef(true);

  // Every time the user scrolls, remember whether they are at the bottom.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      following.current = isNearBottom(element);
    };
    element.addEventListener('scroll', onScroll);
    return () => element.removeEventListener('scroll', onScroll);
  }, [ref]);

  // After the content changed, jump to the bottom (only if the user was following).
  useEffect(() => {
    const element = ref.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [ref, trigger]);
}
