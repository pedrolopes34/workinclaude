import type { Metadata } from "next";
import { IBM_Plex_Mono, Jost, Public_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import Script from "next/script";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Fonte de título (h1) — substituta livre (Google Fonts, OFL) pro
// AvantGarde Std Bold que o Pedro queria: arquivo corrompido, sem
// conserto viável (docs/DECISIONS.md seção 6.34/6.36). Jost é geométrica,
// mesma linhagem estética de Futura/Avant Garde (inspirada na Kabel,
// década de 1920) — mais próxima disso do que Poppins, a outra opção
// cogitada. Só peso Bold, mesma regra de antes: nunca em texto corrido.
const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Painel de Queimadas SP",
  description:
    "Monitoramento de queimadas nos municípios de São Paulo — agrupamento de focos de calor + leitura de satélite, comparado ao MapBiomas Fogo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: o Script abaixo seta data-theme no <html>
  // antes da hidratação (evita flash de tema errado) — sem essa prop, o
  // React sempre acusa mismatch nesse atributo específico, mesmo
  // funcionando certo (mesmo padrão recomendado pela next-themes).
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${publicSans.variable} ${ibmPlexMono.variable} ${jost.variable} antialiased flex min-h-screen flex-col`}>
        {/* Aplica o tema salvo antes da hidratação — sem isso, a página
            sempre nasce clara e "pisca" pro escuro um instante depois
            quando o visitante tinha escolhido escuro (docs/DECISIONS.md
            seção 6.38). */}
        <Script id="tema-inicial" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("tema");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`}
        </Script>

        <header className="sticky top-0 z-20 px-4 pt-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-full border border-glass-border bg-glass px-4 py-2.5 shadow-[inset_0_1px_0_var(--color-glass-hi)] backdrop-blur-xl">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
                style={{
                  background:
                    "radial-gradient(circle at 30% 25%, rgba(255,255,255,.9), rgba(255,255,255,0) 45%), linear-gradient(135deg, var(--color-verde), var(--color-acento-botao))",
                }}
              >
                Q
              </span>
              <span className="truncate text-base font-semibold tracking-tight text-foreground">
                Painel de Queimadas SP
              </span>
            </Link>
            <nav className="hidden items-center gap-5 text-sm font-medium text-muted sm:flex">
              <Link href="/como-produzimos" className="hover:text-foreground">
                Como produzimos
              </Link>
              <Link href="/quem-somos" className="hover:text-foreground">
                Quem somos
              </Link>
            </nav>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-muted lg:inline">
                pesquisa PIBIC/CNPq
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>

        <footer className="px-4 py-8 text-xs text-muted">
          <div className="mx-auto max-w-3xl space-y-1 border-t border-border pt-6">
            <p>
              Fontes de dados: INPE (focos de calor), Sentinel-2/Copernicus/ESA
              (imagens de satélite), MapBiomas Fogo (comparação independente).
            </p>
            <p>
              Iniciação Científica (PIBIC/CNPq) — UNESP, Faculdade de Ciências e
              Engenharia (Tupã-SP).
            </p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
