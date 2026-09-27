// "Public Development URL" do bucket, habilitada em 27/09/2026 (docs/DECISIONS.md seção 6.49).
export const R2_BASE_PUBLICA = "https://pub-59753fc04edb4e0c8cfbfed2449caf53.r2.dev";

// A base gravada no banco pode estar errada (a de 26-27/09 estava); a chave
// dnbr/<arquivo>.png é sempre a mesma, então a URL é remontada na leitura.
export function urlPublicaDnbr(urlGravada: string | null): string | null {
  if (!urlGravada) return null;
  const i = urlGravada.lastIndexOf("/dnbr/");
  return i === -1 ? urlGravada : `${R2_BASE_PUBLICA}${urlGravada.slice(i)}`;
}
