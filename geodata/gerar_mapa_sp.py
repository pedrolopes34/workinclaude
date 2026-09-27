"""Gera os caminhos SVG do mapa de São Paulo usados pelo /webapp (/mapa e a
prévia da página inicial) — docs/DECISIONS.md seção 6.52.

    python geodata/gerar_mapa_sp.py caminho/para/geojs-35-mun.json

Entrada: malha municipal do IBGE em GeoJSON. Usamos a cópia do projeto
geodata-br (https://github.com/tbrugz/geodata-br, arquivo
geojson/geojs-35-mun.json: 645 municípios, propriedade `id` = código IBGE
de 7 dígitos, dados do IBGE, licença CC0). O shapefile oficial
SP_Municipios_2024 (README desta pasta) continua sendo a referência pra
recorte de dado; isto aqui é só desenho de tela.

Saída (commitada, servida como arquivo estático pelo /webapp e desenhada no
navegador por components/MapaSP.tsx — assim a geometria fica em cache e não
vai duplicada no HTML e no payload de hidratação):
- webapp/public/mapa/sp.json       — detalhado, pra página /mapa
- webapp/public/mapa/sp-leve.json  — mais simplificado, pra prévia da home

Simplificação com `shapely.coverage_simplify`, que preserva as divisas
compartilhadas (sem buraco nem sobreposição entre vizinhos). Projeção
equiretangular com correção pelo cosseno da latitude média — suficiente
pra um mapa estadual de tela; nenhuma medida de área sai daqui.
"""

import json
import math
import sys
from pathlib import Path

from shapely import coverage_simplify
from shapely.geometry import MultiPolygon, Polygon, shape

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "webapp" / "public" / "mapa"
LARGURA = 1000
FONTE = "Malha municipal: IBGE, via geodata-br (CC0)"

# Tolerâncias escolhidas medindo o tamanho da saída (seção 6.52): ~150 KB
# e ~55 KB antes do gzip. Com viewBox de 1000 de largura, 1 unidade ≈ 0,9 km
# no terreno, então coordenada inteira basta pra tela.
VERSOES = {
    "sp.json": {"tolerancia_graus": 0.01, "casas": 0},
    "sp-leve.json": {"tolerancia_graus": 0.03, "casas": 0},
}


def _poligonos(geometria) -> list[Polygon]:
    if isinstance(geometria, Polygon):
        return [geometria]
    if isinstance(geometria, MultiPolygon):
        return list(geometria.geoms)
    return []


def _numero(valor: float, casas: int) -> str:
    texto = f"{valor:.{casas}f}"
    if "." in texto:
        texto = texto.rstrip("0").rstrip(".")
    return "0" if texto in ("-0", "") else texto


def caminho_svg(geometria, projetar, casas: int) -> str:
    """`M x y x y ... Z` por anel (pares depois do M são lineto implícito)."""
    partes = []
    for poligono in _poligonos(geometria):
        for anel in [poligono.exterior, *poligono.interiors]:
            pontos = [projetar(lon, lat) for lon, lat in anel.coords[:-1]]
            coords = " ".join(f"{_numero(x, casas)} {_numero(y, casas)}" for x, y in pontos)
            partes.append(f"M{coords}Z")
    return "".join(partes)


def gerar(caminho_geojson: Path) -> None:
    dados = json.loads(caminho_geojson.read_text(encoding="utf-8"))
    codigos = [f["properties"]["id"] for f in dados["features"]]
    geometrias = [shape(f["geometry"]) for f in dados["features"]]
    if len(set(codigos)) != 645:
        raise SystemExit(f"Esperava 645 municípios, veio {len(set(codigos))}.")

    lon_min = min(g.bounds[0] for g in geometrias)
    lat_min = min(g.bounds[1] for g in geometrias)
    lon_max = max(g.bounds[2] for g in geometrias)
    lat_max = max(g.bounds[3] for g in geometrias)
    fator_lon = math.cos(math.radians((lat_min + lat_max) / 2))
    escala = LARGURA / ((lon_max - lon_min) * fator_lon)
    altura = round((lat_max - lat_min) * escala)

    def projetar(lon: float, lat: float) -> tuple[float, float]:
        return (lon - lon_min) * fator_lon * escala, (lat_max - lat) * escala

    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome_arquivo, cfg in VERSOES.items():
        simplificadas = coverage_simplify(geometrias, cfg["tolerancia_graus"])
        saida = {
            "largura": LARGURA,
            "altura": altura,
            "fonte": FONTE,
            "municipios": {
                codigo: caminho_svg(geom, projetar, cfg["casas"])
                for codigo, geom in zip(codigos, simplificadas)
            },
        }
        destino = DESTINO / nome_arquivo
        destino.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{destino.relative_to(RAIZ)}: {destino.stat().st_size / 1024:.0f} KB, viewBox 0 0 {LARGURA} {altura}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    gerar(Path(sys.argv[1]))
