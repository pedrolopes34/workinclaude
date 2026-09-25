import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
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
  return (
    <html lang="pt-BR">
      <body className={`${publicSans.variable} ${ibmPlexMono.variable} antialiased flex min-h-screen flex-col`}>
        <header>
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-acento text-sm font-semibold text-white">
                Q
              </span>
              <span className="text-base font-semibold tracking-tight text-foreground">
                Painel de Queimadas SP
              </span>
            </Link>
            <span className="hidden text-sm text-stone-500 sm:inline">
              pesquisa PIBIC/CNPq
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>

        <footer className="px-4 py-8 text-xs text-stone-500">
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
