"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Busca com sugestões próprias (docs/DECISIONS.md seção 6.55). Substitui o
// <datalist> nativo: o Chrome mostra no máximo ~512 sugestões, e a lista
// parava em "Santa Cruz das Palmeiras" (a 521ª em ordem alfabética) — o
// Pedro não conseguia chegar a Zacarias. Aqui a lista vai até o fim, filtra
// sem depender de acento e aceita o código IBGE; escolher uma sugestão abre
// o município direto. Enter sem sugestão escolhida faz a busca normal (?q=).
// Padrão de combobox do WAI-ARIA 1.2: setas pra navegar, Esc pra fechar.

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function BuscaMunicipio({
  municipios,
  valorInicial,
  id = "busca",
  acao = "/#lista",
  nomeCampo = "q",
  destino = "/municipio/{codigo}",
  camposOcultos = {},
  rotulo = "Buscar município pelo nome ou código IBGE",
  placeholder = "Nome ou código IBGE",
  textoBotao = "Buscar",
  desabilitado = false,
}: {
  municipios: { codigoIbge: string; nome: string }[];
  valorInicial?: string;
  id?: string;
  // Formulário sem sugestão escolhida: GET em `acao` com `nomeCampo`.
  acao?: string;
  nomeCampo?: string;
  // Sugestão escolhida: vai pra `destino`, com {codigo} trocado pelo código IBGE.
  destino?: string;
  camposOcultos?: Record<string, string>;
  rotulo?: string;
  placeholder?: string;
  textoBotao?: string;
  desabilitado?: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(valorInicial ?? "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const listaRef = useRef<HTMLUListElement>(null);

  const ordenados = useMemo(
    () =>
      [...municipios]
        .map((m) => ({ ...m, chave: normalizar(m.nome) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [municipios]
  );
  const termo = normalizar(texto);
  const sugestoes = useMemo(
    () => (termo ? ordenados.filter((m) => m.chave.includes(termo) || m.codigoIbge.startsWith(termo)) : ordenados),
    [termo, ordenados]
  );

  function abrirMunicipio(codigo: string) {
    setAberto(false);
    router.push(destino.replace("{codigo}", codigo));
  }

  function mover(delta: number) {
    if (!sugestoes.length) return;
    setAberto(true);
    const proximo = (ativo + delta + sugestoes.length) % sugestoes.length;
    setAtivo(proximo);
    listaRef.current?.children[proximo]?.scrollIntoView({ block: "nearest" });
  }

  return (
    <form
      id={id}
      method="get"
      action={acao}
      role="search"
      onSubmit={(e) => {
        if (aberto && ativo >= 0 && sugestoes[ativo]) {
          e.preventDefault();
          abrirMunicipio(sugestoes[ativo].codigoIbge);
        }
      }}
      className="relative z-10 flex scroll-mt-24 items-center gap-2 rounded-full border border-glass-border bg-glass p-2 pl-4 shadow-[inset_0_1px_0_var(--color-glass-hi)] backdrop-blur-xl"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="shrink-0 text-faint"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      {Object.entries(camposOcultos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <label htmlFor={`${id}-campo`} className="sr-only">
        {rotulo}
      </label>
      <input
        id={`${id}-campo`}
        type="search"
        name={nomeCampo}
        role="combobox"
        disabled={desabilitado}
        aria-expanded={aberto && sugestoes.length > 0}
        aria-controls={`${id}-sugestoes`}
        aria-autocomplete="list"
        aria-activedescendant={aberto && ativo >= 0 && sugestoes[ativo] ? `${id}-${sugestoes[ativo].codigoIbge}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAtivo(-1);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            mover(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            mover(-1);
          } else if (e.key === "Escape") {
            setAberto(false);
            setAtivo(-1);
          }
        }}
        className="w-full bg-transparent px-1 py-2 text-sm outline-none placeholder:text-faint disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={desabilitado}
        className="shrink-0 rounded-full bg-acento-botao px-4 py-2 text-[19px] font-bold text-white transition-colors hover:bg-acento-botao-hover disabled:opacity-50"
      >
        {textoBotao}
      </button>

      {aberto && !desabilitado && sugestoes.length > 0 && (
        <ul
          id={`${id}-sugestoes`}
          ref={listaRef}
          role="listbox"
          aria-label={`${sugestoes.length} município${sugestoes.length === 1 ? "" : "s"}`}
          className="absolute left-2 right-2 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-surface py-1.5 shadow-xl"
        >
          {sugestoes.map((m, i) => (
            <li
              key={m.codigoIbge}
              id={`${id}-${m.codigoIbge}`}
              role="option"
              aria-selected={i === ativo}
              // mousedown (não click): acontece antes do blur que fecha a lista
              onMouseDown={(e) => {
                e.preventDefault();
                abrirMunicipio(m.codigoIbge);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${
                i === ativo ? "bg-background text-foreground" : "text-foreground"
              }`}
            >
              <span className="truncate">{m.nome}</span>
              <span className="shrink-0 tabular-nums text-xs text-faint">{m.codigoIbge}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
