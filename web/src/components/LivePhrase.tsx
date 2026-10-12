// The phrase the other person is saying right now. It has no translation yet: it is shown
// so the reader can follow along. The part Deepgram is sure about is normal; the part that
// may still change is grey.

interface LivePhraseProps {
  finalText: string;
  interimText: string;
  /** The other person is speaking at this moment. */
  speaking: boolean;
}

export function LivePhrase({ finalText, interimText, speaking }: LivePhraseProps) {
  if (!finalText && !interimText) return null; // nothing being said: show nothing

  return (
    <p className="live" aria-live="off">
      <span className="live__dot" data-testid="live-dot" data-speaking={speaking} aria-hidden="true" />
      {finalText && <span>{finalText}</span>}
      {finalText && interimText && ' '}
      {interimText && <span className="live__guess">{interimText}</span>}
    </p>
  );
}
