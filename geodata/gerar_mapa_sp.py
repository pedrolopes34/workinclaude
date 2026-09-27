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
- geodata/sp_contorno.geojson      — contorno do estado (união dos 645) e o
  retângulo envolvente, pro mosaico estadual de dNBR
  (pipeline/run_dnbr_estado.py, docs/DECISIONS.md seção 6.55): o mosaico é
  gerado exatamente nesse retângulo, que é o mesmo do viewBox do mapa, então
  a imagem encaixa no desenho sem reprojetar nada.

Simplificação com `shapely.coverage_simplify`, que preserva as divisas
compartilhadas (sem buraco nem sobreposição entre vizinhos). Projeção
equiretangular com correção pelo cosseno da latitude média — suficiente
pra um mapa estadual de tela; nenhuma medida de área sai daqui.
"""

import json
import math
import sys
from pathlib import Path

from pyproj import Geod
from shapely import coverage_simplify, make_valid, union_all
from shapely.geometry import MultiPolygon, Polygon, mapping, shape

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "webapp" / "public" / "mapa"
CONTORNO = RAIZ / "geodata" / "sp_contorno.geojson"
# Contorno do estado pra recortar o mosaico no Earth Engine: ~0,5 km de
# tolerância some na imagem de ~300 m por pixel.
TOLERANCIA_CONTORNO_GRAUS = 0.005
LARGURA = 1000
FONTE = "Malha municipal: IBGE, via geodata-br (CC0)"

# Tolerâncias escolhidas medindo o tamanho da saída (seção 6.52): ~150 KB
# e ~55 KB antes do gzip. Com viewBox de 1000 de largura, 1 unidade ≈ 0,9 km
# no terreno, então coordenada inteira basta pra tela.
VERSOES = {
    "sp.json": {"tolerancia_graus": 0.01, "casas": 0, "com_areas": True},
    "sp-leve.json": {"tolerancia_graus": 0.03, "casas": 0, "com_areas": False},
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


def area_km2(geometria) -> float:
    """Área geodésica (elipsoide GRS80, o do SIRGAS 2000) da malha ORIGINAL,
    antes de simplificar — usada no /mapa pra camada de leitura de satélite
    em % do município (seção 6.54)."""
    area_m2, _ = Geod(ellps="GRS80").geometry_area_perimeter(geometria)
    return round(abs(area_m2) / 1e6, 1)


def gerar(caminho_geojson: Path) -> None:
    dados = json.loads(caminho_geojson.read_text(encoding="utf-8"))
    codigos = [f["properties"]["id"] for f in dados["features"]]
    # make_valid: 7 municípios do litoral (Bertioga, Cananéia, Caraguatatuba,
    # Ilhabela, Peruíbe, São Sebastião, Ubatuba) vêm com o anel de uma ilhota
    # como exterior e o contorno real como "buraco" — o retângulo envolvente
    # saía minúsculo e a ponta sul de Cananéia ficava fora do viewBox
    # (seção 6.55).
    geometrias = [make_valid(shape(f["geometry"])) for f in dados["features"]]
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

    areas = {codigo: area_km2(geom) for codigo, geom in zip(codigos, geometrias)}

    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome_arquivo, cfg in VERSOES.items():
        simplificadas = coverage_simplify(geometrias, cfg["tolerancia_graus"])
        saida = {
            "largura": LARGURA,
            "altura": altura,
            # [oeste, sul, leste, norte] em graus: o retângulo que o viewBox
            # desenha (projeção linear em lon e lat, ver projetar).
            "limites": [lon_min, lat_min, lon_max, lat_max],
            "fonte": FONTE,
            "municipios": {
                codigo: caminho_svg(geom, projetar, cfg["casas"])
                for codigo, geom in zip(codigos, simplificadas)
            },
        }
        if cfg["com_areas"]:
            saida["areas_km2"] = areas
        destino = DESTINO / nome_arquivo
        destino.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{destino.relative_to(RAIZ)}: {destino.stat().st_size / 1024:.0f} KB, viewBox 0 0 {LARGURA} {altura}")

    # Grade de 1e-6° (~0,1 m): sem ela o GEOS recusa unir algumas divisas.
    contorno = union_all(geometrias, grid_size=1e-6).simplify(
        TOLERANCIA_CONTORNO_GRAUS, preserve_topology=True
    )
    CONTORNO.write_text(
        json.dumps(
            {
                "type": "Feature",
                "properties": {"limites": [lon_min, lat_min, lon_max, lat_max], "fonte": FONTE},
                "geometry": mapping(contorno),
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"{CONTORNO.relative_to(RAIZ)}: {CONTORNO.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    gerar(Path(sys.argv[1]))
