import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Placeholder ate o nome/logo do produto ser decidido (docs/DECISIONS.md
// secao 7) — mesmo tratamento visual do "Q" no header (layout.tsx).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c17a4e",
          borderRadius: "50%",
          color: "white",
          fontSize: 20,
          fontWeight: 600,
          fontFamily: "sans-serif",
        }}
      >
        Q
      </div>
    ),
    { ...size }
  );
}
