import { useEffect, useState } from "react";

interface Props {
  text: string;
  /** Delay between each letter, ms. */
  delayPerChar?: number;
  /** Delay before the first letter starts revealing, ms. */
  startDelay?: number;
  className?: string;
  onComplete?: () => void;
}

/**
 * Renders text one character at a time with a fade-in.
 * Each char is a span with `transition: opacity` controlled by an index counter.
 */
export function LetterReveal({
  text,
  delayPerChar = 40,
  startDelay = 0,
  className,
  onComplete,
}: Props) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    let cancelled = false;
    const start = setTimeout(() => {
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setRevealed(i);
        if (i < text.length) {
          setTimeout(tick, delayPerChar);
        } else {
          onComplete?.();
        }
      };
      tick();
    }, startDelay);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [text, delayPerChar, startDelay, onComplete]);

  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((char, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            opacity: i < revealed ? 1 : 0,
            transition: "opacity 220ms ease-out",
            display: "inline-block",
            whiteSpace: "pre",
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
