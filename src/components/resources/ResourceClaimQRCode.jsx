import React from "react";

/**
 * Procedural QR Matrix Pattern Generator for claim verification tokens
 */
function hashStringToGrid(text, size = 21) {
  const grid = Array(size)
    .fill(0)
    .map(() => Array(size).fill(false));

  // Draw 3 standard QR position markers (top-left, top-right, bottom-left 7x7)
  const drawCorner = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          grid[r0 + r][c0 + c] = true;
        } else {
          grid[r0 + r][c0 + c] = false;
        }
      }
    }
  };

  drawCorner(0, 0); // Top-left
  drawCorner(0, size - 7); // Top-right
  drawCorner(size - 7, 0); // Bottom-left

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Generate deterministic pattern from token string
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Don't overwrite standard corner markers
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      if (inTopLeft || inTopRight || inBottomLeft) continue;

      const val = (Math.abs(h ^ ((r * 37 + c * 59) * 104729)) % 100);
      grid[r][c] = val > 42;
    }
  }

  return grid;
}

export default function ResourceClaimQRCode({
  token = "CLAIM-RESQ-001",
  size = 140,
  darkColor = "#0f172a",
  lightColor = "#ffffff",
}) {
  const gridSize = 21;
  const matrix = hashStringToGrid(token, gridSize);
  const cellSize = size / gridSize;

  return (
    <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl shadow-inner border border-slate-200">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rounded"
        style={{ shapeRendering: "crispEdges" }}
      >
        <rect width={size} height={size} fill={lightColor} rx="6" />
        {matrix.map((row, r) =>
          row.map((isDark, c) =>
            isDark ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                fill={darkColor}
              />
            ) : null
          )
        )}
      </svg>
      <span className="mt-1 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase">
        {token}
      </span>
    </div>
  );
}
