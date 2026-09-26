"use client";

// Alternância manual clara/escura (docs/DECISIONS.md seção 6.38) — além
// do escuro automático via prefers-color-scheme que já existia. Qual dos
// 2 ícones aparece é decidido só por CSS (classes icon-sol/icon-lua em
// globals.css, conforme [data-theme]) — nada de estado em React aqui,
// pra não ter mismatch entre o HTML gerado no servidor e o que o
// visitante realmente vê (o servidor não sabe a preferência salva).
export function ThemeToggle() {
  function alternar() {
    const atual = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const proximo = atual === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", proximo);
    try {
      localStorage.setItem("tema", proximo);
    } catch {
      // localStorage indisponível (modo privado etc.) — só não persiste entre visitas.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-glass-border bg-glass-hi text-foreground"
    >
      <svg
        className="icon-sol"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg
        className="icon-lua"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}
