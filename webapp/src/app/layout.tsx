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
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
              Painel de Queimadas SP
            </Link>
            <span className="hidden text-sm text-zinc-500 sm:inline">
              [NOME_DO_PRODUTO] — pesquisa PIBIC/CNPq
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-zinc-200 px-4 py-6 text-xs text-zinc-500 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl space-y-1">
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
