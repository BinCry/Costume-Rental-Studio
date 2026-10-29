import { forwardRef, useEffect, useRef } from 'react';
import { config } from '../config';
import {
  renderFeatheredMask,
  renderLehengaCholiTryOn,
  renderOutfitTryOn,
  SKELETON_EDGES,
  type DepthMapSource,
  type GarmentAnchors,
  type HemFlare,
  type HemLength,
  type KeypointName,
  type PartialTryOnConfig,
  type PipelineResult,
  type SkirtAnchors,
  type SleeveFlare,
  type SleeveLength,
  tintMask,
  type TryOnStatus,
} from '@practics/tryon-core';

/** A close()d ImageBitmap is "detached" and reports width 0 — drawing it throws. */
function isDetached(source: { width: number } | null | undefined): boolean {
  return !!source && source.width === 0;
}

/**
 * A lightweight triangular face mesh derived from MoveNet's nose, eye, and
 * ear keypoints. It deliberately avoids a second face-landmark model in the
 * live loop, so enabling Skeleton does not add a download or reduce camera
 * FPS. This is a visual guide, not a biometric 468-point Face Mesh.
 */
function drawFaceGrid(
  ctx: CanvasRenderingContext2D,
  keypoints: readonly { name: KeypointName; x: number; y: number; score: number }[],
  minScore: number,
  lineWidth: number,
): void {
  const byName = new Map(keypoints.map((point) => [point.name, point] as const));
  const nose = byName.get('nose');
  const eyeL = byName.get('left_eye');
  const eyeR = byName.get('right_eye');
  const earL = byName.get('left_ear');
  const earR = byName.get('right_ear');
  if (!nose || nose.score < minScore) return;

  const horizontal = [eyeL, eyeR, earL, earR].filter(
    (point): point is NonNullable<typeof point> => !!point && point.score >= minScore,
  );
  if (horizontal.length < 2) return;
  const left = Math.min(...horizontal.map((point) => point.x));
  const right = Math.max(...horizontal.map((point) => point.x));
  const width = Math.max(16, right - left) * 1.22;
  const height = width * 1.28;
  const cx = nose.x;
  const cy = nose.y + height * 0.08;

  ctx.save();
  ctx.strokeStyle = 'rgba(198, 35, 94, 0.76)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.lineWidth = Math.max(1, lineWidth * 0.38);

  // A staggered set of rows makes diagonals/triangles rather than the
  // latitude-longitude grid that looks like a globe painted on the face.
  const rowDefs = [
    { y: -0.47, xs: [-0.2, 0, 0.2] },
    { y: -0.29, xs: [-0.43, -0.21, 0, 0.21, 0.43] },
    { y: -0.06, xs: [-0.51, -0.31, -0.1, 0.1, 0.31, 0.51] },
    { y: 0.18, xs: [-0.45, -0.24, 0, 0.24, 0.45] },
    { y: 0.39, xs: [-0.29, 0, 0.29] },
  ] as const;
  const rows = rowDefs.map(({ y, xs }) =>
    xs.map((x) => ({ x: cx + x * width, y: cy + y * height })),
  );
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < rows[row].length - 1; column += 1) {
      line(rows[row][column], rows[row][column + 1]);
    }
    if (row === rows.length - 1) continue;
    const current = rows[row];
    const next = rows[row + 1];
    for (let column = 0; column < current.length; column += 1) {
      const nextIndex = Math.round((column * (next.length - 1)) / (current.length - 1));
      line(current[column], next[nextIndex]);
      const diagonal = column % 2 === 0 ? nextIndex + 1 : nextIndex - 1;
      if (diagonal >= 0 && diagonal < next.length) line(current[column], next[diagonal]);
    }
  }

  ctx.fillStyle = 'rgba(198, 35, 94, 0.9)';
  for (const row of rows) {
    for (const point of row) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(1, lineWidth * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * This app's own anchor/relighting/depth-occlusion/warp tuning, in the
 * shape renderTryOn/renderLehengaCholiTryOn's `config` field expects —
 * without this, both calls would silently fall back to
 * @practics/tryon-core's own DEFAULT_CONFIG instead of this app's
 * src/config.ts, which happens to hold identical values today but would
 * silently stop tracking any future edit to src/config.ts's tuning.
 */
export const tryOnConfig: PartialTryOnConfig = {
  minKeypointScore: config.minKeypointScore,
  anchors: config.anchors,
  relighting: config.relighting,
  depthOcclusion: config.depthOcclusion,
  harmonize: config.harmonize,
  warpGrid: config.warpGrid,
  armOcclusionRadiusFactor: config.armOcclusionRadiusFactor,
};

export type GarmentOverlay =
  | {
      /** Top and/or bottom outfit slots — either may be absent (top-only, pants-only, or both). */
      kind: 'outfit';
      top?: {
        image: ImageBitmap;
        anchors: GarmentAnchors;
        hemLength: HemLength;
        /** Enables arm-following sleeves when `anchors` carries sleeve anchors (see tryon-core SLEEVE_ANCHOR_NAMES). */
        sleeves?: SleeveLength;
        /** 'bell' holds a flared sleeve's cuff open instead of collapsing it onto the arm (see tryon-core SleeveFlare). */
        sleeveFlare?: SleeveFlare;
        /** 'skirt' for a single-image lehenga-choli (see tryon-core HemFlare). */
        hemFlare?: HemFlare;
        /** Advanced-mode normal map (Phase A3), same pixel space/coverage as `image`. */
        normal?: OffscreenCanvas | null;
      } | null;
      pants?: {
        image: ImageBitmap;
        /** Waistband + per-leg outer hem corners (see schema.ts PantsGarment). */
        anchors: SkirtAnchors;
        hemLength: HemLength;
        normal?: OffscreenCanvas | null;
      } | null;
      /** Live-mode orientation-aware warp + view fade (Phase A5, see pipeline/orientation.ts). */
      foreshortenFactor?: number;
      viewAlpha?: number;
    }
  | {
      kind: 'lehenga-choli';
      choliImage: ImageBitmap;
      choliAnchors: GarmentAnchors;
      lehengaImage: ImageBitmap;
      lehengaAnchors: SkirtAnchors;
      skirtLength: HemLength;
      choliNormal?: OffscreenCanvas | null;
      lehengaNormal?: OffscreenCanvas | null;
      foreshortenFactor?: number;
      viewAlpha?: number;
    };

interface Props {
  image: ImageBitmap;
  result: PipelineResult | null;
  showMask: boolean;
  showSkeleton: boolean;
  garment?: GarmentOverlay | null;
  /** Advanced-mode depth map (Phase A1) — when present, replaces the frame/garment
   * render with the depth visualization so its quality can be inspected directly. */
  depthBitmap?: ImageBitmap | null;
  /** Advanced-mode person depth map (Phase A2) — fed to the compositor for
   * per-pixel depth-tested occlusion instead of the arm-capsule heuristic.
   * Independent of depthBitmap: this stays active even when the depth
   * debug view above isn't toggled on. An ImageBitmap in photo mode, an
   * OffscreenCanvas in live mode (see hooks/useLiveDepth.ts). */
  personDepthBitmap?: DepthMapSource | null;
  /** Color harmonization toggle (see tryon-core harmonize.ts). */
  harmonize?: boolean;
  onTryOnStatus?: (status: TryOnStatus | null) => void;
}

/**
 * Draws the photo, an optional try-on garment layer, and debug overlays
 * (mask tint, skeleton, depth). Forwards its canvas element so a caller can
 * capture the composited result directly (see App.tsx's photo-capture flow) —
 * merged with the internal ref this component also needs for its own draw
 * effect, via mergeRefs below.
 */
export const DebugCanvas = forwardRef<HTMLCanvasElement, Props>(function DebugCanvas(
  { image, result, showMask, showSkeleton, garment, depthBitmap, personDepthBitmap, harmonize, onTryOnStatus }: Props,
  forwardedRef,
) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const lastStatusRef = useRef<TryOnStatus | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Live mode interleaves several asynchronous producers (frames from the
    // inference loop, throttled depth, garment swaps) whose cleanup closes
    // the previous ImageBitmap before React commits the replacement state —
    // so a paint can momentarily hold a detached bitmap, and drawing one
    // throws InvalidStateError out of this effect, unmounting the whole
    // app. Skip that paint instead (keeping the previous canvas contents);
    // the producer's own setState lands immediately after with the live
    // replacement. Detached garment/depth inputs degrade to "without that
    // input" rather than skipping the frame entirely.
    if (isDetached(image) || (result && isDetached(result.maskBitmap))) return;
    const safeDepth = depthBitmap && !isDetached(depthBitmap) ? depthBitmap : null;
    const safePersonDepth = personDepthBitmap && !isDetached(personDepthBitmap) ? personDepthBitmap : null;
    let safeGarment = garment ?? null;
    if (safeGarment) {
      if (safeGarment.kind === 'lehenga-choli') {
        if (isDetached(safeGarment.choliImage) || isDetached(safeGarment.lehengaImage)) safeGarment = null;
      } else {
        // An outfit's pieces degrade individually: a detached top still
        // renders the pants (and vice versa); both gone drops the overlay.
        const top = safeGarment.top && !isDetached(safeGarment.top.image) ? safeGarment.top : null;
        const pants = safeGarment.pants && !isDetached(safeGarment.pants.image) ? safeGarment.pants : null;
        safeGarment = top || pants ? { ...safeGarment, top, pants } : null;
      }
    }

    const w = image.width;
    const h = image.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tryOnStatus: TryOnStatus | null = null;
    if (safeDepth) {
      // Depth is a standalone inspection view, not a tint over the try-on
      // render — drawing the garment underneath would just make the depth
      // map harder to read, not easier.
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(safeDepth, 0, 0, w, h);
    } else if (safeGarment && result) {
      if (safeGarment.kind === 'outfit') {
        tryOnStatus = renderOutfitTryOn(ctx, {
          frame: image,
          maskBitmap: result.maskBitmap,
          keypoints: result.keypoints,
          top: safeGarment.top,
          pants: safeGarment.pants,
          personDepth: safePersonDepth,
          foreshortenFactor: safeGarment.foreshortenFactor,
          viewAlpha: safeGarment.viewAlpha,
          harmonize,
          config: tryOnConfig,
        });
      } else {
        tryOnStatus = renderLehengaCholiTryOn(ctx, {
          frame: image,
          maskBitmap: result.maskBitmap,
          keypoints: result.keypoints,
          choliImage: safeGarment.choliImage,
          choliAnchors: safeGarment.choliAnchors,
          lehengaImage: safeGarment.lehengaImage,
          lehengaAnchors: safeGarment.lehengaAnchors,
          skirtLength: safeGarment.skirtLength,
          personDepth: safePersonDepth,
          choliNormal: safeGarment.choliNormal,
          lehengaNormal: safeGarment.lehengaNormal,
          foreshortenFactor: safeGarment.foreshortenFactor,
          viewAlpha: safeGarment.viewAlpha,
          harmonize,
          config: tryOnConfig,
        });
      }
    } else {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0);
    }
    // Report only on change: this effect re-runs on every live frame, and
    // an unconditional parent setState from here is the app's highest-
    // frequency effect→setState edge — harmless when React bails on
    // identical values, but it needlessly counts toward the nested-update
    // ceiling during load spikes (mode switches mid-inference).
    if (tryOnStatus !== lastStatusRef.current) {
      lastStatusRef.current = tryOnStatus;
      onTryOnStatus?.(tryOnStatus);
    }

    if (result && showMask && !safeDepth) {
      const tinted = tintMask(renderFeatheredMask(result.maskBitmap, w, h), '#2dd4bf');
      ctx.globalAlpha = config.maskOpacity;
      ctx.drawImage(tinted, 0, 0);
      ctx.globalAlpha = 1;
    }

    if (result && showSkeleton) {
      const byName = new Map<KeypointName, (typeof result.keypoints)[number]>();
      for (const kp of result.keypoints) byName.set(kp.name, kp);
      const lw = Math.max(2, Math.round(w / 320));

      ctx.lineWidth = lw;
      ctx.strokeStyle = '#f472b6';
      for (const [a, b] of SKELETON_EDGES) {
        const ka = byName.get(a);
        const kb = byName.get(b);
        if (!ka || !kb) continue;
        if (ka.score < config.minKeypointScore || kb.score < config.minKeypointScore) continue;
        ctx.beginPath();
        ctx.moveTo(ka.x, ka.y);
        ctx.lineTo(kb.x, kb.y);
        ctx.stroke();
      }

      for (const kp of result.keypoints) {
        const confident = kp.score >= config.minKeypointScore;
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, lw * 1.6, 0, Math.PI * 2);
        if (confident) {
          ctx.fillStyle = '#facc15';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = Math.max(1, lw / 2);
          ctx.stroke();
          ctx.lineWidth = lw;
          ctx.strokeStyle = '#f472b6';
        }
      }
      drawFaceGrid(ctx, result.keypoints, config.minKeypointScore, lw);
    }
  }, [image, result, showMask, showSkeleton, garment, depthBitmap, personDepthBitmap, harmonize, onTryOnStatus]);

  return (
    <canvas
      ref={(node) => {
        ref.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className="debug-canvas"
    />
  );
});
