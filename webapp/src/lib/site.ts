// Endereço público do site. O domínio próprio ainda não foi decidido
// (nome do produto em aberto, CLAUDE.md), então o padrão é o endereço que
// já está no ar na Vercel (docs/DECISIONS.md seção 6.37) — antes era
// example.com, e o sitemap/robots saíam com URL que não existe.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://workinclaude.vercel.app";
