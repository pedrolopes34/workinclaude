import { NextResponse } from "next/server";
import { buscarConsultaPorId } from "@/lib/consultaSobDemanda";

// GET /api/consultas/[id] — polling do resultado de uma consulta sob
// demanda (docs/DECISIONS.md seção 6.43). O cliente chama isso a cada
// poucos segundos enquanto status for 'pendente'/'processando'.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idNumerico = Number(id);
  if (!Number.isInteger(idNumerico)) {
    return NextResponse.json({ erro: "id inválido." }, { status: 400 });
  }

  const consulta = await buscarConsultaPorId(idNumerico);
  if (!consulta) {
    return NextResponse.json({ erro: "Consulta não encontrada." }, { status: 404 });
  }

  return NextResponse.json(consulta);
}
