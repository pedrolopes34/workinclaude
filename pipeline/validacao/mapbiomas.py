"""Comparação contra o MapBiomas Fogo: IoU/Jaccard, recall, significância
por teste de permutação, e a classificação de confiabilidade (4 níveis).

O notebook oficial dessa etapa (`Comparativo_Oficial_IoUJaccardPixels_
CORRIGIDO_v3.ipynb`) é grande demais pro limite de download da ferramenta
de Drive desta sessão (>10 MB) — não foi possível ler o código exato do
teste de permutação. Pedro descreveu o conceito geral (mecânica padrão de
teste de permutação: quebrar a associação real, recalcular a métrica em
cada embaralhamento, p-valor = fração de permutações tão ou mais extremas
que o observado), mas não a mecânica espacial específica (o que exatamente
é reamostrado — pixels, ou a geometria do agrupamento).

`permutacao_iou` abaixo implementa a versão padrão da literatura de
sensoriamento remoto/ecologia de paisagem para esse caso — reposicionar
aleatoriamente a geometria do agrupamento (mesma área e forma, posição e
rotação aleatórias) dentro do domínio do município, e comparar a
sobreposição real com a distribuição de sobreposições ao acaso. É uma
RECONSTRUÇÃO A PARTIR DO PADRÃO CIENTÍFICO, não um port do código original
— ver docs/DECISIONS.md seção 6.15. Precisa ser confirmada contra o
notebook oficial (ou uma nova descrição mais específica do Pedro) antes de
qualquer p-valor daqui virar confiabilidade pública de verdade.
"""

import random
from dataclasses import dataclass

from shapely import affinity
from shapely.geometry.base import BaseGeometry

MAX_TENTATIVAS_REPOSICIONAMENTO = 200


@dataclass(frozen=True)
class ResultadoIou:
    iou: float
    intersecao_km2: float
    uniao_km2: float
    recall_pct: float  # intersecao / area_mapbiomas — sensibilidade do metodo proprio


def calcular_iou_recall(cluster_geom: BaseGeometry, mapbiomas_geom: BaseGeometry) -> ResultadoIou:
    """Ambas as geometrias precisam estar na mesma projeção métrica (UTM —
    ver pipeline/common/geo.py). Geometria vazia em qualquer um dos lados
    (sem agrupamento formado, ou MapBiomas sem queima registrada naquele
    município/ano) devolve IoU e recall zero, sem lançar erro."""
    if cluster_geom.is_empty or mapbiomas_geom.is_empty:
        area_mapbiomas = mapbiomas_geom.area if not mapbiomas_geom.is_empty else 0.0
        return ResultadoIou(0.0, 0.0, (cluster_geom.area + area_mapbiomas) / 1_000_000, 0.0)

    intersecao = cluster_geom.intersection(mapbiomas_geom)
    uniao = cluster_geom.union(mapbiomas_geom)

    intersecao_km2 = intersecao.area / 1_000_000
    uniao_km2 = uniao.area / 1_000_000
    iou = intersecao_km2 / uniao_km2 if uniao_km2 > 0 else 0.0
    recall_pct = 100 * intersecao.area / mapbiomas_geom.area if mapbiomas_geom.area > 0 else 0.0

    return ResultadoIou(iou, intersecao_km2, uniao_km2, recall_pct)


def _reposicionar_aleatoriamente(geom: BaseGeometry, dominio: BaseGeometry, rng: random.Random) -> BaseGeometry | None:
    """Roda a geometria por um ângulo aleatório em torno do próprio
    centroide, depois translada pra um ponto aleatório do domínio —
    preserva área e forma, randomiza posição e orientação. `None` se não
    coube inteira dentro do domínio em MAX_TENTATIVAS_REPOSICIONAMENTO
    tentativas (caso raro: geometria grande perto do tamanho do domínio)."""
    minx, miny, maxx, maxy = dominio.bounds
    for _ in range(MAX_TENTATIVAS_REPOSICIONAMENTO):
        rotacionada = affinity.rotate(geom, rng.uniform(0, 360), origin="centroid")
        centroide = rotacionada.centroid
        alvo_x = rng.uniform(minx, maxx)
        alvo_y = rng.uniform(miny, maxy)
        candidata = affinity.translate(rotacionada, xoff=alvo_x - centroide.x, yoff=alvo_y - centroide.y)
        if dominio.contains(candidata):
            return candidata
    return None


def permutacao_iou(
    cluster_geom: BaseGeometry,
    mapbiomas_geom: BaseGeometry,
    dominio_geom: BaseGeometry,
    n_permutacoes: int = 999,
    seed: int | None = None,
) -> tuple[float, float]:
    """(iou_observado, p_valor). p_valor = proporcao das permutacoes com IoU
    >= ao observado (+1 no numerador e denominador, correcao padrao pra
    nunca dar p=0 — Davison & Hinkley 1997). Geometria vazia de qualquer
    lado -> (0.0, 1.0), sem gastar permutacao à toa (nao ha sobreposicao
    possivel de verificar)."""
    observado = calcular_iou_recall(cluster_geom, mapbiomas_geom)
    if cluster_geom.is_empty or mapbiomas_geom.is_empty:
        return observado.iou, 1.0

    rng = random.Random(seed)
    tao_extremas_ou_mais = 0
    permutacoes_validas = 0

    for _ in range(n_permutacoes):
        candidata = _reposicionar_aleatoriamente(cluster_geom, dominio_geom, rng)
        if candidata is None:
            continue
        permutacoes_validas += 1
        iou_aleatorio = calcular_iou_recall(candidata, mapbiomas_geom).iou
        if iou_aleatorio >= observado.iou:
            tao_extremas_ou_mais += 1

    if permutacoes_validas == 0:
        return observado.iou, 1.0

    p_valor = (tao_extremas_ou_mais + 1) / (permutacoes_validas + 1)
    return observado.iou, p_valor


def classificar_confiabilidade(n_agrupamentos: int, recall_pct: float | None, p_valor: float | None) -> str:
    """Regra fixa — docs/DECISIONS.md seção 1.3. Mesma lógica de
    pipeline/db/seeds/generate_seed_sql.py::confiabilidade (mantidas
    separadas de propósito: aquele script já gerou e validou o seed atual,
    não deve mudar de comportamento por uma refatoração)."""
    if n_agrupamentos == 0:
        return "Insuficiente"
    recall_ok = recall_pct is not None and recall_pct >= 50
    p_ok = p_valor is not None and p_valor < 0.05
    if recall_ok and p_ok:
        return "Alta"
    if recall_ok or p_ok:
        return "Média"
    return "Baixa"
