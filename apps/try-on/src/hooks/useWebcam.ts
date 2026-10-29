import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config';

export type WebcamStatus = 'idle' | 'requesting' | 'ready' | 'error';

export interface UseWebcam {
  status: WebcamStatus;
  error: string | null;
  /** Off-DOM <video> element streaming the camera; frame source for capture. */
  videoEl: HTMLVideoElement | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * getUserMedia wrapper. The video element is created once and kept off-DOM
 * (not rendered) — callers capture frames from it via
 * createImageBitmap(videoEl)/canvas rather than displaying it directly; the
 * live try-on canvas is the visible surface (see hooks/useLiveTryOn.ts).
 */
export function useWebcam(): UseWebcam {
  const [status, setStatus] = useState<WebcamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // React Strict Mode deliberately re-runs mount effects in development.
  // Keep the request single-flight so a second start never replaces the
  // source while the first `video.play()` is still pending.
  const startInFlightRef = useRef<Promise<void> | null>(null);
  const requestIdRef = useRef(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    // A cancelled getUserMedia()/video.play() request must not be reused by
    // the next start. This matters in React Strict Mode: its development
    // mount probe calls cleanup between two start attempts. Keeping the old
    // promise here made the second attempt await that cancelled request,
    // leaving the camera idle after its indicator briefly lit up.
    startInFlightRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
    setVideoEl(null);
  }, []);

  const start = useCallback((): Promise<void> => {
    if (startInFlightRef.current) return startInFlightRef.current;

    const requestId = ++requestIdRef.current;
    setStatus('requesting');
    setError(null);
    const work = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            // Cap capture size: every downstream per-pixel pass scales with
            // frame area, and an uncapped HD webcam makes live mode several
            // times slower for no visible benefit (see config.webcam).
            width: { ideal: config.webcam.idealWidth },
            height: { ideal: config.webcam.idealHeight },
          },
          audio: false,
        });
        if (requestId !== requestIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        let video = videoRef.current;
        if (!video) {
          video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          videoRef.current = video;
        }
        video.srcObject = stream;
        await video.play();
        if (requestId !== requestIdRef.current) return;
        setVideoEl(video);
        setStatus('ready');
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    const promise = work().finally(() => {
      if (startInFlightRef.current === promise) startInFlightRef.current = null;
    });
    startInFlightRef.current = promise;
    return promise;
  }, []);

  useEffect(() => stop, [stop]);

  return { status, error, videoEl, start, stop };
}
