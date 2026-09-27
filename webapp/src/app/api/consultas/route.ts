import { NextRequest, NextResponse } from "next/server";
import { municipioExiste } from "@/lib/queries";
import {
  MAX_CONSULTAS_POR_HORA,
  buscarConsultaConcluida,
  contarConsultasRecentes,
  criarConsultaPendente,
  dispararConsultaWorkflow,
  garantirTabelaConsultas,
  marcarConsultaComoErro,
  validarPeriodo,
} from "@/lib/consultaSobDemanda";

// GET /api/consultas?codigoIbge=&ano=&mes= — só procura um resultado já
// concluído pro recorte, sem disparar cálculo nenhum. É o que o link
// reproduzível (/municipio/X?ano=&mes=) usa ao abrir a página
// (docs/DECISIONS.md seção 6.52): abrir um link compartilhado, ou um robô
// visitando a URL, nunca gasta minutos do Actions nem cota do GEE.
export async function GET(request: NextRequest) {
  const busca = request.nextUrl.searchParams;
  const codigoIbge = busca.get("codigoIbge");
  const ano = Number(busca.get("ano"));
  const mes = Number(busca.get("mes"));

  if (!codigoIbge || !/^\d{7}$/.test(codigoIbge)) {
    return NextResponse.json({ erro: "Município é obrigatório." }, { status: 400 });
  }
  const periodo = validarPeriodo(ano, mes);
  if (!periodo.ok) {
    return NextResponse.json({ erro: periodo.motivo }, { status: 400 });
  }

  await garantirTabelaConsultas();
  const existente = await buscarConsultaConcluida(codigoIbge, ano, mes);
  if (!existente) {
    return NextResponse.json({ erro: "Ainda não calculado." }, { status: 404 });
  }
  return NextResponse.json({ ...existente, reaproveitado: true });
}

// POST /api/consultas — visitante escolhe município+ano+mês e pede o
// cálculo ao vivo (docs/DECISIONS.md seção 6.43). Cria a linha 'pendente'
// e dispara consulta-sob-demanda.yml; o resultado chega por polling em
// GET /api/consultas/[id]. Nunca cacheado (rota POST).
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const codigoIbge = typeof corpo?.codigoIbge === "string" ? corpo.codigoIbge : null;
  const ano = Number(corpo?.ano);
  const mes = Number(corpo?.mes);

  if (!codigoIbge) {
    return NextResponse.json({ erro: "Município é obrigatório." }, { status: 400 });
  }

  const periodo = validarPeriodo(ano, mes);
  if (!periodo.ok) {
    return NextResponse.json({ erro: periodo.motivo }, { status: 400 });
  }

  if (!(await municipioExiste(codigoIbge))) {
    return NextResponse.json({ erro: "Município não encontrado." }, { status: 404 });
  }

  await garantirTabelaConsultas();

  // Reaproveita um cálculo já concluído pro mesmo recorte em vez de gastar
  // cota do GEE/minutos do Actions de novo.
  const existente = await buscarConsultaConcluida(codigoIbge, ano, mes);
  if (existente) {
    return NextResponse.json({ ...existente, reaproveitado: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const consultasRecentes = await contarConsultasRecentes(ip);
  if (consultasRecentes >= MAX_CONSULTAS_POR_HORA) {
    return NextResponse.json(
      { erro: "Muitas consultas em pouco tempo — tente de novo daqui a uma hora." },
      { status: 429 }
    );
  }

  const id = await criarConsultaPendente(codigoIbge, ano, mes, ip);

  try {
    await dispararConsultaWorkflow({ consultaId: id, codigoIbge, ano, mes });
  } catch (erro) {
    console.error(`Falha ao disparar consulta-sob-demanda.yml (consulta ${id}):`, erro);
    await marcarConsultaComoErro(id, "Não foi possível iniciar o cálculo. Tente de novo em alguns minutos.");
    return NextResponse.json({ erro: "Não foi possível iniciar o cálculo." }, { status: 502 });
  }

  return NextResponse.json(
    {
      id,
      status: "pendente",
      numFocosCalor: null,
      numAgrupamentos: null,
      areaStDbscanKm2: null,
      areaDnbrKm2: null,
      dnbrImagemUrl: null,
      mensagemErro: null,
      reaproveitado: false,
    },
    { status: 201 }
  );
}
