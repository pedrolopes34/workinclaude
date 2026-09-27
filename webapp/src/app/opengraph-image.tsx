import { ImageResponse } from "next/og";

// Imagem que aparece quando alguém compartilha o link (WhatsApp, redes) —
// item "Imagem Open Graph" do CHECKLIST (docs/DECISIONS.md seção 6.52).
// Nome do produto ainda não decidido (CLAUDE.md): usa o título provisório.
export const alt = "Painel de Queimadas SP — onde o fogo passou e o quanto dá pra confiar nesse número";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f7f3ec",
          color: "#26221d",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "#3c7da6",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            Q
          </div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>Painel de Queimadas SP</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>
            Onde o fogo passou e o quanto dá pra confiar nesse número.
          </div>
          <div style={{ fontSize: 30, color: "#57534e", lineHeight: 1.35 }}>
            Focos de calor, leitura de satélite e MapBiomas Fogo nos 645 municípios de São Paulo.
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#736d67" }}>Pesquisa de Iniciação Científica · PIBIC/CNPq</div>
      </div>
    ),
    { ...size }
  );
}
