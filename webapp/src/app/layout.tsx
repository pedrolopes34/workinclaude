import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import Script from "next/script";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Uma fonte só em toda a página, a pedido do Pedro (docs/DECISIONS.md seção
// 6.55): Inter, que também existe no Google Docs/Gemini, no lugar de Public
// Sans (texto), IBM Plex Mono (números) e Jost (títulos). Números usam
// `tabular-nums` pra continuarem alinhados em coluna.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const DESCRICAO =
  "Monitoramento de queimadas nos municípios de São Paulo — agrupamento de focos de calor + leitura de satélite, comparado ao MapBiomas Fogo.";

// metadataBase: sem ele, a imagem de compartilhamento (opengraph-image.tsx)
// sairia com URL relativa, que WhatsApp/redes sociais não resolvem.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Painel de Queimadas SP",
  description: DESCRICAO,
  openGraph: {
    title: "Painel de Queimadas SP",
    description: DESCRICAO,
    locale: "pt_BR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

const LINKS_NAVEGACAO = [
  { href: "/mapa", rotulo: "Mapa" },
  { href: "/comparar", rotulo: "Comparar" },
  { href: "/como-produzimos", rotulo: "Como produzimos" },
  { href: "/quem-somos", rotulo: "Quem somos" },
];

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
      <body className={`${inter.variable} antialiased flex min-h-screen flex-col`}>
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
                    "radial-gradient(circle at 30% 25%, rgba(255,255,255,.9), rgba(255,255,255,0) 45%), linear-gradient(135deg, var(--orb-a), var(--color-acento-botao))",
                }}
              >
                Q
              </span>
              <span className="truncate text-base font-semibold tracking-tight text-foreground">
                Painel de Queimadas SP
              </span>
            </Link>
            <nav aria-label="Principal" className="hidden items-center gap-4 text-sm font-medium text-muted md:flex">
              {LINKS_NAVEGACAO.map((l) => (
                <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-foreground">
                  {l.rotulo}
                </Link>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-3">
              <ThemeToggle />
            </div>
          </div>
          {/* No celular a navegação vira uma linha rolável logo abaixo do
              cabeçalho — antes ela simplesmente sumia (seção 6.52). */}
          <nav
            aria-label="Principal (celular)"
            className="mx-auto mt-2 flex max-w-3xl gap-2 overflow-x-auto pb-1 text-sm font-medium md:hidden"
          >
            {LINKS_NAVEGACAO.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="shrink-0 rounded-full border border-glass-border bg-glass px-3 py-1.5 text-muted backdrop-blur-xl hover:text-foreground"
              >
                {l.rotulo}
              </Link>
            ))}
          </nav>
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
