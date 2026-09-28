import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { sql } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Os 645: desde 28/09/2026 todo município tem conteúdo próprio (focos e
  // confiabilidade ano a ano desde 2018, leitura de satélite) — antes só os
  // 63 da amostra entravam (docs/DECISIONS.md seção 6.55).
  const municipios = await sql<{ codigoIbge: string }[]>`
    SELECT codigo_ibge FROM municipios ORDER BY codigo_ibge
  `;

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/mapa`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/comparar`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/como-produzimos`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/quem-somos`, changeFrequency: "monthly", priority: 0.5 },
    ...municipios.map((m) => ({
      url: `${SITE_URL}/municipio/${m.codigoIbge}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
