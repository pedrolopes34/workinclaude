import type { MetadataRoute } from "next";

// SITE_URL ainda nao existe (nome do produto/dominio nao decidido —
// docs/DECISIONS.md secao 7); placeholder ate a publicacao real.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
