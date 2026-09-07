/**
 * The real globe. Honours the frozen contract in `types.ts` exactly — Agents B
 * and C build the Country/Destination/Discover screens against this same
 * component. See PLAN.md §5 for the visual direction and §7 for the
 * performance guardrails this file is designed around (150 arcs / 300 points,
 * 2k textures, no post-processing, 60fps target).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { STATUS_COLOR } from '../lib/format.js';
import { cssVar, withAlpha } from './colorTokens.js';
import { loadCountryPolygons, type CountryFeature } from './countryGeo.js';
import { useElementSize } from './useElementSize.js';
import type {
  ArcDatum,
  CameraTarget,
  GlobeSceneHandle,
  GlobeSceneProps,
  PointDatum,
} from './types.js';

const MAX_ARCS = 150;
const MAX_POINTS = 300;

const DEFAULT_WORLD_CAMERA: CameraTarget = { lat: 12, lng: 15, altitude: 2.4 };

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/** Places emerging/new points "should pulse" per the design brief — everyone else stays calm. */
function isPulsingStatus(status: PointDatum['status']): boolean {
  return status === 'emerging' || status === 'new';
}

export const GlobeScene = forwardRef<GlobeSceneHandle, GlobeSceneProps>(function GlobeScene(
  {
    focus,
    arcs,
    points,
    highlightedCountryIso2 = null,
    coveredIso2,
    onCountryClick,
    onCountryHover,
    onPointClick,
    onPointHover,
    onReady,
    autoRotate = false,
  },
  ref,
) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [ready, setReady] = useState(false);
  const [rotating, setRotating] = useState(true);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    loadCountryPolygons()
      .then((features) => !cancelled && setCountries(features))
      .catch(() => {
        /* Rendered without borders is preferable to a broken screen. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopRotating = useCallback(() => setRotating(false), []);

  useEffect(() => {
    if (!ready) return;
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = autoRotate && !reducedMotion && rotating;
    controls.autoRotateSpeed = 0.35;
  }, [ready, autoRotate, reducedMotion, rotating]);

  const handleGlobeReady = useCallback(() => {
    setReady(true);
    globeRef.current?.pointOfView(focus ?? DEFAULT_WORLD_CAMERA, 0);
    onReady?.();
    // Deliberately only runs once: `focus` after mount is a job for ref.flyTo(),
    // not an implicit re-render effect, per the contract's ref-based API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (target, ms = 1400) => {
        globeRef.current?.pointOfView(
          { lat: target.lat, lng: target.lng, altitude: target.altitude },
          ms,
        );
      },
      getCamera: () => {
        const pov = globeRef.current?.pointOfView();
        return pov
          ? { lat: pov.lat, lng: pov.lng, altitude: pov.altitude }
          : (focus ?? DEFAULT_WORLD_CAMERA);
      },
    }),
    [focus],
  );

  const coveredSet = useMemo(() => new Set(coveredIso2 ?? []), [coveredIso2]);

  const boundedArcs = useMemo(() => arcs.slice(0, MAX_ARCS), [arcs]);
  const boundedPoints = useMemo(() => points.slice(0, MAX_POINTS), [points]);
  const pulsingPoints = useMemo(
    () => (reducedMotion ? [] : boundedPoints.filter((p) => isPulsingStatus(p.status))),
    [boundedPoints, reducedMotion],
  );

  // Resolved once against the live DOM — the palette itself still lives solely in
  // tokens.css, this just gives three.js materials colour values they can use.
  const palette = useMemo(
    () => ({
      surface2: cssVar('--color-surface-2'),
      hairline: cssVar('--color-hairline'),
      established: cssVar('--color-established'),
      ink: cssVar('--color-ink'),
      arcFrom: cssVar('--color-arc-from'),
      arcTo: cssVar('--color-arc-to'),
    }),
    [],
  );

  const arcColor = useCallback(
    (d: object) => {
      const arc = d as ArcDatum;
      const w = Math.min(1, Math.max(0, arc.weight));
      return [withAlpha(palette.arcFrom, 0.18 + w * 0.5), withAlpha(palette.arcTo, 0.3 + w * 0.6)];
    },
    [palette],
  );

  const arcStroke = useCallback((d: object) => {
    const arc = d as ArcDatum;
    return 0.25 + Math.min(1, Math.max(0, arc.weight)) * 0.9;
  }, []);

  const arcDashAnimateTime = useCallback(
    (d: object) => {
      if (reducedMotion) return 0;
      const arc = d as ArcDatum;
      const w = Math.min(1, Math.max(0, arc.weight));
      return 1200 + (1 - w) * 2600;
    },
    [reducedMotion],
  );

  const pointColor = useCallback(
    (d: object) => withAlpha(STATUS_COLOR[(d as PointDatum).status], 0.92),
    [],
  );

  const pointRadius = useCallback((d: object) => {
    const p = d as PointDatum;
    return 0.28 + Math.min(1, Math.max(0, p.size)) * 0.55;
  }, []);

  const pointLabel = useCallback((d: object) => (d as PointDatum).label, []);

  const handlePointClick = useCallback(
    (d: object) => onPointClick?.((d as PointDatum).id),
    [onPointClick],
  );
  const handlePointHover = useCallback(
    (d: object | null) => onPointHover?.(d ? (d as PointDatum).id : null),
    [onPointHover],
  );

  const ringColor = useCallback(
    (d: object) => {
      const status = (d as PointDatum).status;
      const color = STATUS_COLOR[status];
      return (t: number) => withAlpha(color, (1 - t) * 0.55);
    },
    [],
  );
  const ringMaxRadius = useCallback((d: object) => {
    const p = d as PointDatum;
    return 1.8 + Math.min(1, Math.max(0, p.size)) * 2.4;
  }, []);
  const ringRepeatPeriod = useCallback(
    (d: object) => ((d as PointDatum).status === 'new' ? 1500 : 2400),
    [],
  );

  // Uncovered countries are deliberately inert: no click, no pointer cursor, and
  // only a faint hover acknowledgement rather than the bright "you can select
  // this" highlight — clicking one used to dead-end on an empty country page,
  // so the globe itself must make "not selectable" obvious before that happens.
  const isInteractiveIso2 = useCallback(
    (iso2: string | null) => Boolean(iso2 && coveredSet.has(iso2)),
    [coveredSet],
  );

  const polygonCapColor = useCallback(
    (feature: object) => {
      const f = feature as CountryFeature;
      const iso2 = f.properties.iso2;
      if (!iso2) return withAlpha(palette.hairline, 0.12);
      const covered = coveredSet.has(iso2);
      if (iso2 === highlightedCountryIso2) {
        return covered ? withAlpha(palette.ink, 0.3) : withAlpha(palette.surface2, 0.34);
      }
      return covered ? withAlpha(palette.established, 0.16) : withAlpha(palette.surface2, 0.22);
    },
    [palette, coveredSet, highlightedCountryIso2],
  );
  const polygonSideColor = useCallback(() => withAlpha(palette.hairline, 0.25), [palette]);
  const polygonStrokeColor = useCallback(
    (feature: object) => {
      const f = feature as CountryFeature;
      const iso2 = f.properties.iso2;
      if (iso2 !== highlightedCountryIso2) return withAlpha(palette.hairline, 0.55);
      return isInteractiveIso2(iso2)
        ? withAlpha(palette.ink, 0.85)
        : withAlpha(palette.hairline, 0.75);
    },
    [palette, highlightedCountryIso2, isInteractiveIso2],
  );
  const polygonAltitude = useCallback(
    (feature: object) => {
      const iso2 = (feature as CountryFeature).properties.iso2;
      // Only lift the country that is both hovered and actually selectable —
      // an uncovered country stays flush with the globe even when highlighted.
      return iso2 === highlightedCountryIso2 && isInteractiveIso2(iso2) ? 0.014 : 0.006;
    },
    [highlightedCountryIso2, isInteractiveIso2],
  );
  const polygonLabel = useCallback(
    (feature: object) => {
      const f = feature as CountryFeature;
      if (!f.properties.iso2) return '';
      return isInteractiveIso2(f.properties.iso2)
        ? f.properties.name
        : `${f.properties.name} — coverage coming soon`;
    },
    [isInteractiveIso2],
  );
  const handlePolygonClick = useCallback(
    (feature: object) => {
      const iso2 = (feature as CountryFeature).properties.iso2;
      if (isInteractiveIso2(iso2)) onCountryClick?.(iso2 as string);
    },
    [onCountryClick, isInteractiveIso2],
  );
  const handlePolygonHover = useCallback(
    (feature: object | null) => {
      // Hover is still reported for uncovered countries — screens use it to
      // show an honest "coverage coming soon" note — only click is gated.
      onCountryHover?.(feature ? (feature as CountryFeature).properties.iso2 : null);
    },
    [onCountryHover],
  );
  const showPointerCursor = useCallback(
    (objType: string, objData: unknown) => {
      if (objType !== 'polygon') return true;
      const iso2 = (objData as CountryFeature | undefined)?.properties.iso2 ?? null;
      return isInteractiveIso2(iso2);
    },
    [isInteractiveIso2],
  );

  return (
    <div
      ref={containerRef}
      className="starfield absolute inset-0 bg-[var(--color-void)]"
      onPointerDown={stopRotating}
      onWheel={stopRotating}
      data-globe-ready={ready}
    >
      {size.width > 0 && size.height > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="/textures/earth-dark.jpg"
          showAtmosphere
          atmosphereColor={palette.arcFrom}
          atmosphereAltitude={0.2}
          polygonsData={countries}
          polygonCapColor={polygonCapColor}
          polygonSideColor={polygonSideColor}
          polygonStrokeColor={polygonStrokeColor}
          polygonAltitude={polygonAltitude}
          polygonLabel={polygonLabel}
          polygonsTransitionDuration={200}
          onPolygonClick={handlePolygonClick}
          onPolygonHover={handlePolygonHover}
          showPointerCursor={showPointerCursor}
          pointsData={boundedPoints}
          pointLat="lat"
          pointLng="lng"
          pointColor={pointColor}
          pointRadius={pointRadius}
          pointAltitude={0.012}
          pointLabel={pointLabel}
          pointsTransitionDuration={0}
          onPointClick={handlePointClick}
          onPointHover={handlePointHover}
          ringsData={pulsingPoints}
          ringLat="lat"
          ringLng="lng"
          ringColor={ringColor}
          ringMaxRadius={ringMaxRadius}
          ringPropagationSpeed={1.3}
          ringRepeatPeriod={ringRepeatPeriod}
          arcsData={boundedArcs}
          arcStartLat="fromLat"
          arcStartLng="fromLng"
          arcEndLat="toLat"
          arcEndLng="toLng"
          arcColor={arcColor}
          arcStroke={arcStroke}
          arcAltitudeAutoScale={0.15}
          arcDashLength={0.4}
          arcDashGap={reducedMotion ? 0 : 0.22}
          arcDashAnimateTime={arcDashAnimateTime}
          arcsTransitionDuration={0}
          onGlobeReady={handleGlobeReady}
          showGraticules={false}
        />
      )}
    </div>
  );
});
