import type { Accelerator } from '@practics/tryon-core';

interface Timings {
  segmentMs: number;
  poseMs: number;
}

interface Props {
  accelerator: Accelerator;
  onAcceleratorChange: (a: Accelerator) => void;
  /** Backend actually in use once the pipeline is ready (may differ from `accelerator` after a fallback). */
  backend: Accelerator | null;
  fps: number | null;
  timings: Timings | null;
}

function StatTile({ label, value, status }: { label: string; value: string; status?: 'good' | 'warn' }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {status && <span className={`status-dot ${status}`} />}
        {value}
      </span>
    </div>
  );
}

/**
 * The WebGPU/CPU toggle + live perf readout — CLAUDE.md Phase 4 calls this
 * out explicitly as a demo talking point (show the on-device GPU speedup).
 */
export function PerfStats({ accelerator, onAcceleratorChange, backend }: Props) {
  const backendIsGpu = backend === 'webgpu';
  const backendLabel = backend ? (backendIsGpu ? 'WebGPU' : 'CPU/Wasm') : 'Đang tải…';
  return (
    <div className="perf-stats">
      <div className="segmented" role="group" aria-label="accelerator">
        <button
          className={accelerator === 'webgpu' ? 'selected' : ''}
          onClick={() => onAcceleratorChange('webgpu')}
          title="Tăng tốc WebGPU"
        >
          <span className="accel-label-full">Tăng tốc WebGPU</span>
          <span className="accel-label-short">WebGPU</span>
        </button>
        <button
          className={accelerator === 'wasm' ? 'selected' : ''}
          onClick={() => onAcceleratorChange('wasm')}
          title="CPU dự phòng"
        >
          <span className="accel-label-full">CPU dự phòng</span>
          <span className="accel-label-short">CPU</span>
        </button>
      </div>

      <>
        <StatTile
          label="Đang dùng"
          value={backendLabel}
          status={backend ? (backendIsGpu ? 'good' : 'warn') : undefined}
        />
      </>
    </div>
  );
}
