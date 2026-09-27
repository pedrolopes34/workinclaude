import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { sql } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // So os municipios da amostra tem conteudo proprio de verdade (os outros
  // 582 mostram "nao comparado/validado", sem valor de indexacao ainda).
  const municipios = await sql<{ codigoIbge: string }[]>`
    SELECT codigo_ibge FROM municipios WHERE na_amostra ORDER BY codigo_ibge
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
