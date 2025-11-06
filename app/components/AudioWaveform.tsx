import * as React from "react";
import { useTheme } from "styled-components";

interface AudioWaveformProps {
  data: Uint8Array;
  width?: number;
  height?: number;
  isPaused?: boolean;
}

/**
 * Real-time audio waveform visualization component.
 * Renders a fixed number of vertical bars that react to the current audio data.
 * Bars stay in place so the user can read the audio level at a glance.
 */
const AudioWaveform: React.FC<AudioWaveformProps> = React.memo(
  ({ data, width = 300, height = 60, isPaused = false }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const theme = useTheme();

    const MAX_BARS = 32;
    const MIN_BAR_HEIGHT = 2;
    const BAR_GAP = 2;
    const AMPLIFY = 1.6; // slight gain to make bars visually larger

    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const parent = canvas.parentElement;
      const rect = canvas.getBoundingClientRect();
      const parentWidth = parent ? parent.clientWidth : 0;
      const parentHeight = parent ? parent.clientHeight : 0;
      const targetWidth = Math.max(
        1,
        Math.floor(parentWidth || rect.width || width)
      );
      const targetHeight = Math.max(
        1,
        Math.floor(parentHeight || rect.height || height)
      );

      const dpr = window.devicePixelRatio || 1;
      canvas.width = targetWidth * dpr;
      canvas.height = targetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, targetWidth, targetHeight);

      const barCount = Math.min(MAX_BARS, data.length);

      if (barCount === 0) {
        ctx.strokeStyle = theme.textTertiary;
        ctx.lineWidth = 1;
        const mid = targetHeight / 2;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(targetWidth, mid);
        ctx.stroke();
        return;
      }

      const bucketSize = Math.max(1, Math.floor(data.length / barCount));
      const totalGapWidth = (barCount - 1) * BAR_GAP;
      const barWidth = Math.max(2, (targetWidth - totalGapWidth) / barCount);
      const baseline = targetHeight / 2;

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          const value = data[i * bucketSize + j];
          if (typeof value === "number") {
            sum += value;
          }
        }

        const normalized = bucketSize > 0 ? sum / (bucketSize * 255) : 0;
        const clamped = Math.min(1, Math.max(0, normalized));
        const scaled = Math.min(1, clamped * AMPLIFY);
        const barHeight = Math.max(MIN_BAR_HEIGHT, scaled * (targetHeight - 2));

        const x = i * (barWidth + BAR_GAP);
        const y = baseline - barHeight / 2;

        ctx.fillStyle = isPaused ? theme.textTertiary : theme.accent;
        ctx.fillRect(
          Math.round(x),
          Math.round(y),
          Math.floor(barWidth),
          Math.floor(barHeight)
        );
      }

      // draw mid-line for reference
      ctx.strokeStyle = theme.textTertiary + "55";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      ctx.lineTo(targetWidth, baseline);
      ctx.stroke();
    }, [data, height, isPaused, theme, width]);

    return (
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          display: "block",
        }}
      />
    );
  }
);

AudioWaveform.displayName = "AudioWaveform";

export default AudioWaveform;
