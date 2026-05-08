import { useMemo } from "react";

interface Props {
  count?: number;
  /** CSS color, e.g. "var(--color-primary)" or "#7c8aff". */
  color?: string;
}

interface Particle {
  left: string;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  drift: number;
}

/**
 * Slow-rising specks for ambient depth. Position absolute; intended to be
 * placed inside a container with `position: relative; overflow: hidden`.
 */
export function AmbientParticles({ count = 12, color = "var(--color-primary)" }: Props) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, () => ({
      left: `${Math.random() * 100}%`,
      size: 2 + Math.random() * 3,
      duration: 4 + Math.random() * 4,
      delay: Math.random() * 6,
      opacity: 0.2 + Math.random() * 0.4,
      drift: -20 + Math.random() * 40,
    }));
  }, [count]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes ambientRise {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          15%  { opacity: var(--p-op, 0.4); }
          85%  { opacity: var(--p-op, 0.4); }
          100% { transform: translate3d(var(--p-drift, 0px), -120%, 0); opacity: 0; }
        }
      `}</style>
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            bottom: "-8px",
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: color,
            opacity: 0,
            animation: `ambientRise ${p.duration}s linear ${p.delay}s infinite`,
            ["--p-op" as string]: String(p.opacity),
            ["--p-drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
