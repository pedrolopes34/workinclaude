import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";

// SITE_URL ainda nao existe (nome do produto/dominio nao decidido —
// docs/DECISIONS.md secao 7); placeholder ate a publicacao real.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // So os municipios da amostra tem conteudo proprio de verdade (os outros
  // 582 mostram "nao comparado/validado", sem valor de indexacao ainda).
  const municipios = await sql<{ codigoIbge: string }[]>`
    SELECT codigo_ibge FROM municipios WHERE na_amostra ORDER BY codigo_ibge
  `;

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/como-produzimos`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/quem-somos`, changeFrequency: "monthly", priority: 0.5 },
    ...municipios.map((m) => ({
      url: `${SITE_URL}/municipio/${m.codigoIbge}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
