"""Ingestao dos focos de calor do INPE — portado de 06_08_Focos_de_Calor.ipynb
(docs/DECISIONS.md secao 6.11).

ATENCAO — premissas da ingestao (docs/DECISIONS.md secao 6.12/6.18):
1. Satelite — RESOLVIDO (secoes 6.51/6.53): a pesquisa usou o arquivo
   `focos_br_sp_ref_AAAA.csv`, so com o satelite de referencia do INPE.
   `URL_FOCOS_MENSAL_BR` abaixo traz TODOS os satelites (em Pitangueiras,
   ago/2024: 1.588 focos contra 95 da pesquisa, 100 do AQUA_M-T), entao
   `carregar_focos_sp` filtra `SATELITE_REFERENCIA` por padrao — com o
   filtro, os agrupamentos batem com a pesquisa. Aprovado pelo Pedro em
   27/09/2026.
2. **Nao existe produto anual pronto no dataserver do INPE** — a primeira
   tentativa desta sessao usava uma URL "anual" que deu 404 real (rodando
   ingest-inpe.yml de verdade). Busca subsequente achou evidencia real
   (arquivos indexados publicamente, nao so suposicao) de que o dataserver
   só vai ate "mensal" (`csv/mensal/Brasil/focos_mensal_br_AAAAMM.csv`,
   9 arquivos de 2024/2025 confirmados existentes) — nunca "anual". Por
   isso `baixar_focos_ano` baixa os 12 meses e concatena localmente (ver
   docs/DECISIONS.md secao 6.18). Ainda nao executado de verdade contra o
   servidor real nesta sessao — a proxima rodada do workflow confirma.
3. **Nomes de coluna — confirmados por execucao real (26/09/2026, ver
   docs/DECISIONS.md secao 6.20).** A 1a suposicao (`data_pas`, copiada do
   codigo da pesquisa original, que partia de um arquivo ja pre-processado)
   estava errada: o CSV bruto do dataserver usa `data_hora_gmt`. Confirmado
   contra o schema real (`id, lat, lon, data_hora_gmt, satelite, municipio,
   estado, pais, municipio_id, estado_id, pais_id, numero_dias_sem_chuva,
   precipitacao, risco_fogo, bioma, frp`) por busca (2 fontes
   independentes) + o proprio erro real do workflow. `lat`/`lon`/
   `municipio`/`estado` ja estavam certos. O nome "_sp_" do arquivo
   original da pesquisa sugere que ele ja vinha pre-filtrado pra SP antes
   de chegar no notebook — aqui, como partimos do arquivo Brasil inteiro,
   filtramos por estado quando a coluna existir, com fallback pro
   cruzamento so por nome (igual ao notebook original) se nao existir.
"""

import unicodedata
import zipfile
from pathlib import Path

import pandas as pd
import requests

URL_FOCOS_MENSAL_BR = (
    "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/"
    "focos_mensal_br_{ano}{mes:02d}.csv"
)

MESES_PERIODO_SECO = {6, 7, 8, 9, 10}

# Satelite de referencia do INPE (Aqua/MODIS, passagem da tarde) — o mesmo
# do arquivo `_ref_` da pesquisa (docs/DECISIONS.md secao 6.53).
SATELITE_REFERENCIA = "AQUA_M-T"


def padronizar_nome(texto: str) -> str:
    """Remove acentos e normaliza maiusculas — mesma logica de 06_08, usada
    pra casar nomes de municipio entre INPE e IBGE sem depender de grafia
    identica."""
    if pd.isna(texto):
        return texto
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", str(texto)) if unicodedata.category(c) != "Mn"
    )
    return sem_acento.upper().strip()


def _concatenar_csvs_mensais(partes_brutas: list[bytes], destino: Path) -> None:
    """Cada mes vem com seu proprio cabecalho — mantem so o do primeiro,
    descarta o dos demais, pra virar um unico CSV valido."""
    with destino.open("wb") as saida:
        for i, bruto in enumerate(partes_brutas):
            quebra = bruto.find(b"\n")
            trecho = bruto if (i == 0 or quebra == -1) else bruto[quebra + 1 :]
            saida.write(trecho)
            if not trecho.endswith(b"\n"):
                saida.write(b"\n")


def baixar_focos_ano(ano: int, destino_dir: Path, forcar: bool = False, timeout_s: int = 120) -> Path:
    """Baixa os 12 CSVs mensais do INPE pro ano e concatena num unico
    arquivo de cache (mesmo nome de sempre, `focos_anual_br_{ano}.csv`) — o
    dataserver do INPE nao publica um produto anual pronto, so ate "mensal"
    (ver aviso no topo do modulo). Mes ainda nao publicado (404 — tipico do
    mes corrente de um ano em andamento) e pulado, nao e erro; erro so se
    NENHUM mes do ano estiver disponivel.

    `forcar=True` baixa tudo de novo mesmo se o arquivo ja existir —
    necessario pro ano corrente (mes corrente ganha focos novos/e
    republicado todo dia); anos passados sao imutaveis e usam o cache
    (destino.exists()) sem problema, inclusive entre execucoes do GitHub
    Actions (docs/DECISIONS.md secao 6.14 — cache de anos anteriores,
    download fresco so do ano corrente)."""
    destino_dir.mkdir(parents=True, exist_ok=True)
    destino = destino_dir / f"focos_anual_br_{ano}.csv"
    if destino.exists() and not forcar:
        return destino

    partes_brutas = []
    for mes in range(1, 13):
        resposta = requests.get(URL_FOCOS_MENSAL_BR.format(ano=ano, mes=mes), timeout=timeout_s)
        if resposta.status_code == 404:
            continue  # mes ainda nao publicado (comum no mes corrente de um ano em andamento)
        resposta.raise_for_status()
        partes_brutas.append(resposta.content)

    if not partes_brutas:
        raise RuntimeError(f"Nenhum mes de {ano} disponivel no INPE (dataserver-coids.inpe.br) ainda.")

    _concatenar_csvs_mensais(partes_brutas, destino)
    return destino


def baixar_anos_necessarios(anos: range, ano_alvo: int, destino_dir: Path, forcar_alvo: bool = True) -> None:
    """Baixa cada ano de uma janela de histórico (usada tanto pro ingest
    diário quanto pra validação MapBiomas — ambos calculam teto histórico
    sobre uma janela de anos anteriores ao ano alvo).

    Ano histórico que falhar (ex.: fora da janela que o INPE mantém no
    dataserver — só confirmamos retenção até 2024, 2020 deu 404 pra todos
    os 12 meses numa rodada real, ver docs/DECISIONS.md seção 6.19) é só um
    aviso, não derruba a chamada inteira: `calcular_teto_historico` já
    tolera menos anos de histórico disponível, inclusive zero. O ano ALVO
    falhar é fatal — sem ele não há o que processar (escrever métrica com
    focos=0 seria dado falso, não "insuficiente").

    `forcar_alvo` decide se o ano alvo é baixado de novo mesmo se já
    estiver em cache — `True` pro ingest diário (ano corrente, sempre
    mutável); `False` pra validação MapBiomas (ano alvo já fechado/
    imutável, mesmo tratamento dos anos de histórico)."""
    for ano in anos:
        try:
            baixar_focos_ano(ano, destino_dir, forcar=(forcar_alvo and ano == ano_alvo))
        except Exception as e:
            if ano == ano_alvo:
                raise
            print(f"[AVISO] {ano} indisponível no INPE, seguindo só com os anos que baixaram: {type(e).__name__}: {e}")


def _ler_csv_focos(caminho: Path) -> pd.DataFrame:
    if caminho.suffix == ".zip":
        with zipfile.ZipFile(caminho) as z:
            with z.open(z.namelist()[0]) as f:
                return pd.read_csv(f)
    return pd.read_csv(caminho)


def carregar_focos_sp(
    caminho_csv: Path, municipios_ibge: pd.DataFrame, satelite: str | None = SATELITE_REFERENCIA
) -> pd.DataFrame:
    """Le o CSV bruto do INPE (Brasil inteiro ou ja filtrado) e devolve so os
    focos de SP, com codigo_ibge/municipio_oficial casados por nome
    normalizado. `municipios_ibge` precisa ter as colunas codigo_ibge e nome
    (consultar da tabela `municipios` do banco, nao a API do IBGE — ver
    docs/DECISIONS.md secao 6.2 sobre o bloqueio de rede da API do IBGE).

    `satelite`: so os focos desse satelite (padrao: o de referencia, como na
    pesquisa — secao 6.53). `None` mantem todos, so pra diagnostico. Sem a
    coluna `satelite` no CSV, levanta erro em vez de seguir com todos os
    satelites calado — foi exatamente esse o problema da secao 6.51."""
    focos = _ler_csv_focos(caminho_csv)
    if satelite is not None:
        if "satelite" not in focos.columns:
            raise ValueError(
                f"CSV do INPE sem a coluna 'satelite' ({caminho_csv}) — nao da pra filtrar o "
                f"satelite de referencia {satelite}."
            )
        focos = focos[focos["satelite"] == satelite]

    coluna_estado = next((c for c in ("estado", "uf", "state") if c in focos.columns), None)
    if coluna_estado is not None:
        focos = focos[focos[coluna_estado].apply(padronizar_nome).isin({"SAO PAULO", "SP"})].copy()
    else:
        focos = focos.copy()

    focos["data_hora"] = pd.to_datetime(focos["data_hora_gmt"])
    focos["ano"] = focos["data_hora"].dt.year
    focos["mes"] = focos["data_hora"].dt.month
    focos["periodo_seco"] = focos["mes"].isin(MESES_PERIODO_SECO)
    focos["municipio_padrao"] = focos["municipio"].apply(padronizar_nome)

    ibge = municipios_ibge.copy()
    ibge["municipio_padrao"] = ibge["nome"].apply(padronizar_nome)

    focos_sp = focos.merge(ibge[["codigo_ibge", "nome", "municipio_padrao"]], on="municipio_padrao", how="inner")
    return focos_sp.rename(columns={"nome": "municipio_oficial", "lat": "latitude", "lon": "longitude"})[
        ["codigo_ibge", "municipio_oficial", "latitude", "longitude", "data_hora", "ano", "mes", "periodo_seco"]
    ]
