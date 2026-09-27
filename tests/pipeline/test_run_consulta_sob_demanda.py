from unittest.mock import MagicMock

import pandas as pd
import pytest

from pipeline.run_consulta_sob_demanda import (
    MIN_SAMPLES_CONSULTA,
    _buscar_municipio,
    _garantir_tabela,
    _gravar_resultado,
    _marcar_erro,
    _marcar_status,
    filtrar_focos_mes,
)


def _cursor_mock(conn: MagicMock):
    return conn.cursor.return_value.__enter__.return_value


def test_min_samples_consulta_e_o_valor_padrao_do_metodo():
    # Recorte de 1 mes nao tem "teto historico anual" pra decidir 2 vs 4
    # (docs/DECISIONS.md secao 6.11/6.43) — fixo no valor usado em 51 dos 63
    # municipios da amostra, nunca o reduzido (2) de sinal fraco/teste de limite.
    assert MIN_SAMPLES_CONSULTA == 4


def test_filtrar_focos_mes_mantem_so_o_mes_pedido():
    focos = pd.DataFrame({"mes": [5, 6, 6, 7], "valor": ["a", "b", "c", "d"]})
    filtrado = filtrar_focos_mes(focos, 6)
    assert list(filtrado["valor"]) == ["b", "c"]


def test_filtrar_focos_mes_sem_correspondencia_fica_vazio():
    focos = pd.DataFrame({"mes": [1, 2, 3], "valor": ["a", "b", "c"]})
    assert filtrar_focos_mes(focos, 12).empty


def test_garantir_tabela_cria_com_status_e_fk_esperados():
    conn = MagicMock()
    _garantir_tabela(conn)
    chamadas = [c.args[0] for c in _cursor_mock(conn).execute.call_args_list]
    ddl = chamadas[0]
    assert "CREATE TABLE IF NOT EXISTS consultas_sob_demanda" in ddl
    assert "REFERENCES municipios (codigo_ibge)" in ddl
    assert "CHECK (status IN ('pendente', 'processando', 'concluido', 'erro'))" in ddl
    assert any("CREATE INDEX IF NOT EXISTS idx_consultas_sob_demanda_ip_criado" in c for c in chamadas)
    assert any("CREATE INDEX IF NOT EXISTS idx_consultas_sob_demanda_municipio_periodo" in c for c in chamadas)


def test_buscar_municipio_encontrado():
    conn = MagicMock()
    _cursor_mock(conn).fetchone.return_value = ("3539509", "Pitangueiras")
    df = _buscar_municipio(conn, "3539509")
    assert list(df.itertuples(index=False)) == [("3539509", "Pitangueiras")]


def test_buscar_municipio_nao_encontrado_levanta_value_error():
    conn = MagicMock()
    _cursor_mock(conn).fetchone.return_value = None
    with pytest.raises(ValueError, match="não encontrado"):
        _buscar_municipio(conn, "0000000")


def test_marcar_status_atualiza_a_linha_certa():
    conn = MagicMock()
    _marcar_status(conn, 42, "processando")
    query, params = _cursor_mock(conn).execute.call_args[0]
    assert "SET status = %(status)s" in query
    assert params == {"status": "processando", "id": 42}


def test_marcar_erro_trunca_mensagem_longa():
    conn = MagicMock()
    _marcar_erro(conn, 42, "x" * 5000)
    _, params = _cursor_mock(conn).execute.call_args[0]
    assert len(params["mensagem"]) == 2000
    assert params["id"] == 42


def test_gravar_resultado_inclui_todos_os_campos():
    conn = MagicMock()
    resultado = {
        "num_focos_calor": 10,
        "num_agrupamentos": 2,
        "area_st_dbscan_km2": 3.5,
        "area_dnbr_km2": None,
        "dnbr_imagem_url": None,
    }
    _gravar_resultado(conn, 42, resultado)
    query, params = _cursor_mock(conn).execute.call_args[0]
    assert "status = 'concluido'" in query
    assert params == {"id": 42, **resultado}
