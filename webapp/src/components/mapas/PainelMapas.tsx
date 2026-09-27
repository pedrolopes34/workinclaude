"use client";

import { useSearchParams } from "next/navigation";
import type { MosaicoDnbr } from "@/lib/types";
import { MapaConfiabilidade, type ConfiabilidadePorAno } from "./MapaConfiabilidade";
import { MapaDnbrEstado } from "./MapaDnbrEstado";
import { chaveMes } from "@/lib/meses";

// Os dois mapas do estado lado a lado (docs/DECISIONS.md seção 6.55, pedido
// do Pedro: "espelhar dNBR × confiabilidade"): a leitura de satélite de um
// mês à esquerda e a confiabilidade de um ano à direita. Mês e ano ficam na
// URL (?mes=AAAA-MM&ano=AAAA), pra um link abrir a mesma visão; trocar o mês
// leva a confiabilidade pro mesmo ano quando ele existe. Precisa de
// <Suspense> em volta (useSearchParams numa página pré-renderizada).
export function PainelMapas({
  mosaicos,
  porAno,
  nomes,
  mesPadrao,
}: {
  mosaicos: MosaicoDnbr[];
  porAno: ConfiabilidadePorAno;
  nomes: Record<string, string>;
  mesPadrao: string | null;
}) {
  const params = useSearchParams();
  const anos = Object.keys(porAno)
    .map(Number)
    .sort((a, b) => b - a);

  const mesUrl = params.get("mes");
  const chave = mosaicos.some((m) => chaveMes(m) === mesUrl) ? (mesUrl as string) : (mesPadrao ?? "");
  const anoUrl = Number(params.get("ano"));
  const anoDoMes = Number(chave.slice(0, 4));
  const ano = anos.includes(anoUrl) ? anoUrl : anos.includes(anoDoMes) ? anoDoMes : (anos[0] ?? new Date().getFullYear());

  function atualizar(mudancas: Record<string, string>) {
    const busca = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) busca.set(k, v);
    window.history.replaceState(null, "", `?${busca.toString()}`);
  }

  function escolherMes(nova: string) {
    const anoNovo = Number(nova.slice(0, 4));
    atualizar(anos.includes(anoNovo) ? { mes: nova, ano: String(anoNovo) } : { mes: nova });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <MapaDnbrEstado
          arquivo="/mapa/sp.json"
          mosaicos={mosaicos}
          chave={chave}
          nomes={nomes}
          aoEscolherMes={escolherMes}
        />
      </section>
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <MapaConfiabilidade
          arquivo="/mapa/sp.json"
          porAno={porAno}
          ano={ano}
          nomes={nomes}
          aoEscolherAno={(novo) => atualizar({ ano: String(novo) })}
        />
      </section>
    </div>
  );
}
