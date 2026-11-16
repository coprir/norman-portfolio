import { ImageResponse } from "next/og";

export const alt = "Dear Future Me — Capture today. Meet yourself tomorrow.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(900px 500px at 78% 30%, #1b2550 0%, #080A12 62%)", color: "#F5F6FA" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="52" height="52" viewBox="0 0 32 32" fill="none">
            <path d="M26.4 9.5A12 12 0 1 0 28 16" stroke="#F5F6FA" strokeWidth="2" strokeLinecap="round" />
            <circle cx="26.4" cy="9.5" r="2.2" fill="#648BFF" />
            <rect x="12.5" y="9" width="7" height="14" rx="3.5" stroke="#F5F6FA" strokeWidth="2" />
            <path d="M12.5 16h7" stroke="#F5F6FA" strokeWidth="2" />
          </svg>
          <div style={{ fontSize: 24, letterSpacing: 6, fontWeight: 600 }}>DEAR FUTURE ME</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 96, lineHeight: 1.02, letterSpacing: -2, fontFamily: "serif" }}>To the person you&apos;ll become.</div>
          <div style={{ fontSize: 30, color: "#A8B0C4" }}>Capture today. Meet yourself tomorrow.</div>
        </div>
      </div>
    ),
    size,
  );
}
