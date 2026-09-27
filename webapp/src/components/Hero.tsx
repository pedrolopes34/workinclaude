// Hero com vidro + orbs, reaproveitado nas 3 páginas com cabeçalho de
// destaque (home, Como produzimos, Quem somos) — a página de município
// não usa (o mockup também não usa lá, vai direto pro painel de dados,
// docs/DECISIONS.md seção 6.38).
export function Hero({
  eyebrow,
  titulo,
  descricao,
}: {
  eyebrow: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="relative isolate overflow-hidden rounded-[28px] border border-glass-border bg-surface px-5 py-10 sm:px-8 sm:py-12">
      <div className="orb -left-16 -top-20 h-64 w-64" style={{ background: "radial-gradient(circle at 35% 30%, var(--orb-a), transparent 70%)" }} />
      <div className="orb -bottom-32 -right-20 h-72 w-72" style={{ background: "radial-gradient(circle at 60% 40%, var(--orb-b), transparent 70%)" }} />
      <svg
        className="pointer-events-none absolute -right-10 top-6 hidden h-48 w-48 opacity-40 sm:block"
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-acento)" strokeWidth="1" opacity="0.35" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="var(--orb-a)" strokeWidth="1" opacity="0.5" />
        <circle cx="100" cy="100" r="34" fill="none" stroke="var(--orb-b)" strokeWidth="1" opacity="0.5" />
      </svg>
      <div className="relative max-w-xl rounded-3xl border border-glass-border bg-glass p-6 shadow-[inset_0_1px_0_var(--color-glass-hi)] backdrop-blur-xl sm:p-7">
        <span className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-acento-texto">
          <span className="h-1.5 w-1.5 rounded-full bg-acento" />
          {eyebrow}
        </span>
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
          {titulo}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted">
          {descricao}
        </p>
      </div>
    </div>
  );
}
