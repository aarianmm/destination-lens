/**
 * STUB IMPLEMENTATION — replaced by Agent A with the real globe.gl scene.
 *
 * It renders an equirectangular 2D projection of the same arcs and points, with
 * working click/hover callbacks, so screens built against it are genuinely
 * exercisable before the 3D scene exists. Keep the props and ref API identical.
 */
import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { STATUS_COLOR } from '../lib/format.js';
import type { CameraTarget, GlobeSceneHandle, GlobeSceneProps } from './types.js';

const project = (lat: number, lng: number) => ({
  x: ((lng + 180) / 360) * 100,
  y: ((90 - lat) / 180) * 100,
});

export const GlobeScene = forwardRef<GlobeSceneHandle, GlobeSceneProps>(function GlobeScene(
  { arcs, points, focus, onPointClick, onPointHover, onReady },
  ref,
) {
  const camera = useRef<CameraTarget>(focus ?? { lat: 15, lng: 20, altitude: 2.5 });
  const [hovered, setHovered] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (target) => {
      camera.current = target;
    },
    getCamera: () => camera.current,
  }));

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div className="absolute inset-0 starfield bg-[var(--color-void)]" data-globe-stub="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full opacity-90">
        {arcs.slice(0, 150).map((a) => {
          const from = project(a.fromLat, a.fromLng);
          const to = project(a.toLat, a.toLng);
          return (
            <line
              key={a.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--color-arc-from)"
              strokeWidth={0.08 + a.weight * 0.22}
              opacity={0.15 + a.weight * 0.35}
            />
          );
        })}
        {points.slice(0, 300).map((p) => {
          const { x, y } = project(p.lat, p.lng);
          return (
            <circle
              key={p.id}
              cx={x}
              cy={y}
              r={0.4 + p.size * 1.1}
              fill={STATUS_COLOR[p.status]}
              opacity={hovered === p.id ? 1 : 0.85}
              style={{ cursor: 'pointer' }}
              onClick={() => onPointClick?.(p.id)}
              onMouseEnter={() => {
                setHovered(p.id);
                onPointHover?.(p.id);
              }}
              onMouseLeave={() => {
                setHovered(null);
                onPointHover?.(null);
              }}
            />
          );
        })}
      </svg>
      <p className="pointer-events-none absolute bottom-4 left-4 text-xs tracking-wide text-[var(--color-ink-faint)]">
        globe stub — 3D scene lands in Wave 1
      </p>
    </div>
  );
});
