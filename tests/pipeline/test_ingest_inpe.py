import io
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from pipeline.ingest.inpe import (
    SATELITE_REFERENCIA,
    URLS_FOCOS_ANUAL_REF,
    _concatenar_csvs_mensais,
    baixar_anos_necessarios,
    baixar_focos_ano,
    carregar_focos_sp,
    padronizar_nome,
)


class _RespostaFalsa:
    def __init__(self, status_code: int = 200, content: bytes = b"lat,lon,data_hora_gmt,municipio,estado\n"):
        self.status_code = status_code
        self.content = content

    def raise_for_status(self):
        pass


def _zip(nome: str, texto: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        z.writestr(nome, texto)
    return buffer.getvalue()


ANUAL_SP = (
    "id_bdq,foco_id,lat,lon,data_pas,pais,estado,municipio,bioma\n"
    "1,a,-21.0,-48.2,2019-08-05 16:30:00,Brasil,SÃO PAULO,PITANGUEIRAS,Mata Atlântica\n"
)
HOJE = date(2026, 9, 27)


def test_ano_fechado_usa_o_anual_de_referencia_e_o_cache(tmp_path: Path, monkeypatch):
    chamadas = []

    def get_fake(url, timeout):
        chamadas.append(url)
        return _RespostaFalsa(content=_zip("focos_br_sp_ref_2019.csv", ANUAL_SP))

    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", get_fake)

    destino = baixar_focos_ano(2019, tmp_path, hoje=HOJE)
    baixar_focos_ano(2019, tmp_path, hoje=HOJE)  # segunda chamada usa o cache

    assert chamadas == [URLS_FOCOS_ANUAL_REF[0].format(ano=2019)]
    focos = pd.read_csv(destino)
    assert list(focos.columns) == ["lat", "lon", "data_hora_gmt", "satelite", "municipio", "estado"]
    assert focos["satelite"].tolist() == [SATELITE_REFERENCIA]
    assert focos["data_hora_gmt"].tolist() == ["2019-08-05 16:30:00"]


def test_anual_do_brasil_quando_o_de_sp_ainda_nao_saiu_fica_so_com_sp(tmp_path: Path, monkeypatch):
    anual_br = ANUAL_SP + "2,b,-15.0,-47.0,2025-08-05 16:30:00,Brasil,GOIÁS,FORMOSA,Cerrado\n"

    def get_fake(url, timeout):
        if "EstadosBr_sat_ref" in url:
            return _RespostaFalsa(status_code=404)
        return _RespostaFalsa(content=_zip("focos_br_ref_2025.csv", anual_br))

    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", get_fake)

    focos = pd.read_csv(baixar_focos_ano(2025, tmp_path, hoje=HOJE))
    assert focos["municipio"].tolist() == ["PITANGUEIRAS"]


def test_forcar_ignora_cache(tmp_path: Path, monkeypatch):
    chamadas = []

    def get_fake(url, timeout):
        chamadas.append(url)
        return _RespostaFalsa(content=_zip("x.csv", ANUAL_SP))

    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", get_fake)

    baixar_focos_ano(2024, tmp_path, hoje=HOJE)
    baixar_focos_ano(2024, tmp_path, forcar=True, hoje=HOJE)

    assert len(chamadas) == 2


def test_ano_corrente_usa_o_mensal_e_pula_mes_ainda_nao_publicado(tmp_path: Path, monkeypatch):
    """Ano em andamento: nem tenta o anual; meses futuros dão 404 no INPE
    (em .csv e em .zip) — esperado, não derruba os meses que já existem."""
    chamadas = []

    def get_fake(url, timeout):
        chamadas.append(url)
        mes = int(url[-6:-4])
        return _RespostaFalsa(status_code=404) if mes > 9 else _RespostaFalsa()

    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", get_fake)

    destino = baixar_focos_ano(2026, tmp_path, hoje=HOJE)

    assert not any("anual" in url for url in chamadas)
    conteudo = destino.read_text()
    assert conteudo.count("lat,lon,data_hora_gmt,municipio,estado") == 1  # 1 só cabeçalho pros 9 meses


def test_mes_antigo_em_zip(tmp_path: Path, monkeypatch):
    """Sem anual publicado, cai no mensal; 2023 está em .zip no dataserver."""
    mensal = "lat,lon,data_hora_gmt,satelite,municipio,estado\n-21.0,-48.2,2023-08-05 16:30:00,AQUA_M-T,PITANGUEIRAS,SÃO PAULO\n"

    def get_fake(url, timeout):
        if "anual" in url or url.endswith(".csv"):
            return _RespostaFalsa(status_code=404)
        return _RespostaFalsa(content=_zip("focos_mensal_br_202308.csv", mensal))

    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", get_fake)

    focos = pd.read_csv(baixar_focos_ano(2023, tmp_path, hoje=HOJE))
    assert len(focos) == 12  # o mesmo mês falso serve pros 12
    assert set(focos["municipio"]) == {"PITANGUEIRAS"}


def test_baixar_focos_ano_lanca_erro_se_nada_disponivel(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", lambda *a, **k: _RespostaFalsa(status_code=404))

    with pytest.raises(RuntimeError):
        baixar_focos_ano(2099, tmp_path, hoje=HOJE)


def test_baixar_anos_necessarios_tolera_falha_em_ano_historico(tmp_path: Path, monkeypatch, capsys):
    chamados = []

    def fake(ano, destino_dir, forcar=False):
        chamados.append(ano)
        if ano == 2020:
            raise RuntimeError("ano fora da janela retida no INPE")

    monkeypatch.setattr("pipeline.ingest.inpe.baixar_focos_ano", fake)

    baixar_anos_necessarios(range(2020, 2025), ano_alvo=2024, destino_dir=tmp_path)

    assert chamados == [2020, 2021, 2022, 2023, 2024]  # nao para no ano que falhou
    assert "AVISO" in capsys.readouterr().out


def test_baixar_anos_necessarios_propaga_falha_do_ano_alvo(tmp_path: Path, monkeypatch):
    def fake(ano, destino_dir, forcar=False):
        if ano == 2024:
            raise RuntimeError("sem dado nenhum do ano alvo")

    monkeypatch.setattr("pipeline.ingest.inpe.baixar_focos_ano", fake)

    with pytest.raises(RuntimeError):
        baixar_anos_necessarios(range(2020, 2025), ano_alvo=2024, destino_dir=tmp_path)


def test_baixar_anos_necessarios_forcar_alvo_falso_nunca_forca(tmp_path: Path, monkeypatch):
    forcados = []
    monkeypatch.setattr(
        "pipeline.ingest.inpe.baixar_focos_ano",
        lambda ano, destino_dir, forcar=False: forcados.append((ano, forcar)),
    )

    baixar_anos_necessarios(range(2023, 2025), ano_alvo=2024, destino_dir=tmp_path, forcar_alvo=False)

    assert forcados == [(2023, False), (2024, False)]


def test_concatenar_csvs_mensais_mantem_so_o_primeiro_cabecalho(tmp_path: Path):
    partes = [
        b"lat,lon\n1,2\n",
        b"lat,lon\n3,4\n",
        b"lat,lon\n5,6",  # sem quebra de linha final
    ]
    destino = tmp_path / "saida.csv"

    _concatenar_csvs_mensais(partes, destino)

    assert destino.read_text().splitlines() == ["lat,lon", "1,2", "3,4", "5,6"]


def test_padronizar_nome_remove_acento_e_normaliza_caixa():
    assert padronizar_nome("Pitangueiras") == "PITANGUEIRAS"
    assert padronizar_nome("São José do Rio Preto") == "SAO JOSE DO RIO PRETO"


def test_carregar_focos_sp_cruza_por_nome_e_filtra_estado(tmp_path: Path):
    csv_bruto = tmp_path / "focos_anual_br_2024.csv"
    csv_bruto.write_text(
        "lat,lon,data_hora_gmt,municipio,estado,satelite\n"
        "-21.00,-48.22,2024-08-05,Pitangueiras,São Paulo,AQUA_M-T\n"
        "-23.10,-46.60,2024-08-06,Santana de Parnaíba,São Paulo,AQUA_M-T\n"
        "-15.00,-47.00,2024-08-05,Pitangueiras,Distrito Federal,AQUA_M-T\n"  # nome duplicado em outro estado
    )
    municipios_ibge = pd.DataFrame(
        {
            "codigo_ibge": ["3538709", "3547304"],
            "nome": ["Pitangueiras", "Santana de Parnaíba"],
        }
    )

    focos = carregar_focos_sp(csv_bruto, municipios_ibge)

    assert len(focos) == 2
    assert set(focos["codigo_ibge"]) == {"3538709", "3547304"}
    assert focos["latitude"].tolist() == [-21.00, -23.10]
    assert focos["periodo_seco"].all()


def _csv_com_satelites(tmp_path: Path) -> Path:
    csv_bruto = tmp_path / "focos_anual_br_2024.csv"
    csv_bruto.write_text(
        "lat,lon,data_hora_gmt,municipio,estado,satelite\n"
        "-21.00,-48.22,2024-08-05 16:00:00,Pitangueiras,São Paulo,AQUA_M-T\n"
        "-21.01,-48.21,2024-08-05 16:10:00,Pitangueiras,São Paulo,GOES-16\n"
        "-21.02,-48.20,2024-08-05 04:00:00,Pitangueiras,São Paulo,NOAA-20\n"
    )
    return csv_bruto


def test_carregar_focos_sp_fica_so_com_o_satelite_de_referencia_por_padrao(tmp_path: Path):
    # A pesquisa usou só o satélite de referência (arquivo _ref_); o produto
    # mensal traz todos — docs/DECISIONS.md seção 6.51/6.53.
    municipios_ibge = pd.DataFrame({"codigo_ibge": ["3539509"], "nome": ["Pitangueiras"]})
    assert SATELITE_REFERENCIA == "AQUA_M-T"
    assert len(carregar_focos_sp(_csv_com_satelites(tmp_path), municipios_ibge)) == 1
    assert len(carregar_focos_sp(_csv_com_satelites(tmp_path), municipios_ibge, satelite=None)) == 3


def test_carregar_focos_sp_sem_coluna_satelite_nao_segue_calado(tmp_path: Path):
    csv_bruto = tmp_path / "focos_anual_br_2024.csv"
    csv_bruto.write_text("lat,lon,data_hora_gmt,municipio,estado\n-21.00,-48.22,2024-08-05,Pitangueiras,São Paulo\n")
    municipios_ibge = pd.DataFrame({"codigo_ibge": ["3539509"], "nome": ["Pitangueiras"]})
    with pytest.raises(ValueError, match="satelite"):
        carregar_focos_sp(csv_bruto, municipios_ibge)
