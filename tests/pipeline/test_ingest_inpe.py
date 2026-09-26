from pathlib import Path

import pandas as pd
import pytest

from pipeline.ingest.inpe import (
    _concatenar_csvs_mensais,
    baixar_anos_necessarios,
    baixar_focos_ano,
    carregar_focos_sp,
    padronizar_nome,
)


class _RespostaFalsa:
    def __init__(self, status_code: int = 200, content: bytes = b"lat,lon,data_pas,municipio,estado\n"):
        self.status_code = status_code
        self.content = content

    def raise_for_status(self):
        pass


def test_baixar_focos_ano_usa_cache_por_padrao(tmp_path: Path, monkeypatch):
    chamadas = []
    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", lambda *a, **k: chamadas.append(1) or _RespostaFalsa())

    baixar_focos_ano(2019, tmp_path)
    baixar_focos_ano(2019, tmp_path)  # segunda chamada nao deveria baixar de novo (cache)

    assert len(chamadas) == 12  # 1 requisicao por mes, uma unica vez


def test_baixar_focos_ano_forcar_ignora_cache(tmp_path: Path, monkeypatch):
    chamadas = []
    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", lambda *a, **k: chamadas.append(1) or _RespostaFalsa())

    baixar_focos_ano(2024, tmp_path)
    baixar_focos_ano(2024, tmp_path, forcar=True)

    assert len(chamadas) == 24  # 12 meses x 2 rodadas (cache ignorado na 2a)


def test_baixar_focos_ano_pula_mes_ainda_nao_publicado(tmp_path: Path, monkeypatch):
    """Ano em andamento: meses futuros/ainda nao fechados dao 404 no INPE —
    esperado, nao pode derrubar o download dos meses que ja existem."""

    def get_fake(url, timeout):
        mes = int(url[-6:-4])
        return _RespostaFalsa(status_code=404) if mes > 9 else _RespostaFalsa()

    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", get_fake)

    destino = baixar_focos_ano(2026, tmp_path)

    conteudo = destino.read_text()
    assert conteudo.count("lat,lon,data_pas,municipio,estado") == 1  # 1 so cabecalho, mesmo com 9 meses concatenados


def test_baixar_focos_ano_lanca_erro_se_nenhum_mes_disponivel(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("pipeline.ingest.inpe.requests.get", lambda *a, **k: _RespostaFalsa(status_code=404))

    with pytest.raises(RuntimeError):
        baixar_focos_ano(2099, tmp_path)


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
        "lat,lon,data_pas,municipio,estado\n"
        "-21.00,-48.22,2024-08-05,Pitangueiras,São Paulo\n"
        "-23.10,-46.60,2024-08-06,Santana de Parnaíba,São Paulo\n"
        "-15.00,-47.00,2024-08-05,Pitangueiras,Distrito Federal\n"  # nome duplicado em outro estado
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
