// "Public Development URL" do bucket, habilitada em 27/09/2026 (docs/DECISIONS.md seção 6.49).
export const R2_BASE_PUBLICA = "https://pub-59753fc04edb4e0c8cfbfed2449caf53.r2.dev";

// A base gravada no banco pode estar errada (a de 26-27/09 estava); a chave
// dnbr/<arquivo>.png é sempre a mesma, então a URL é remontada na leitura.
export function urlPublicaDnbr(urlGravada: string | null): string | null {
  if (!urlGravada) return null;
  const i = urlGravada.lastIndexOf("/dnbr/");
  return i === -1 ? urlGravada : `${R2_BASE_PUBLICA}${urlGravada.slice(i)}`;
}

// Mesma remontagem pros mosaicos estaduais (`dnbr-estado/AAAA-MM.webp`,
// seção 6.55).
export function urlPublicaR2(urlGravada: string | null): string | null {
  if (!urlGravada) return null;
  for (const pasta of ["/dnbr-estado/", "/dnbr/"]) {
    const i = urlGravada.lastIndexOf(pasta);
    if (i !== -1) return `${R2_BASE_PUBLICA}${urlGravada.slice(i)}`;
  }
  return urlGravada;
}
