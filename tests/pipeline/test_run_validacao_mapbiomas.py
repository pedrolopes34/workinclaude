from datetime import datetime
from unittest.mock import MagicMock

import pandas as pd
import pytest
from shapely.geometry import MultiPolygon, Polygon

from pipeline.run_validacao_mapbiomas import (
    _buscar_municipio_unico,
    _buscar_municipios,
    _contar_vertices,
    _descrever_validacao_temporal,
    _garantir_coluna_fonte,
    restaurar_amostra_validada,
    _remover_validacao_automatica,
)


def test_descrever_validacao_temporal_com_eventos():
    eventos = pd.DataFrame(
        [
            {"data_inicio": datetime(2024, 8, 7), "data_fim": datetime(2024, 8, 10)},
            {"data_inicio": datetime(2024, 8, 20), "data_fim": datetime(2024, 8, 23)},
        ]
    )
    descricao = _descrever_validacao_temporal(eventos)
    assert descricao == "2 evento(s) entre 07/08/2024 e 23/08/2024"


def test_descrever_validacao_temporal_sem_eventos_e_none():
    assert _descrever_validacao_temporal(pd.DataFrame(columns=["data_inicio", "data_fim"])) is None


def _cursor_mock(conn: MagicMock):
    return conn.cursor.return_value.__enter__.return_value


def test_garantir_coluna_fonte_executa_add_column_idempotente():
    conn = MagicMock()
    _garantir_coluna_fonte(conn)
    sql_executado = _cursor_mock(conn).execute.call_args[0][0]
    assert "ADD COLUMN IF NOT EXISTS fonte" in sql_executado
    assert "CHECK (fonte IN ('manual', 'automatico'))" in sql_executado


def test_buscar_municipios_exclui_fonte_manual_do_ano_pedido():
    conn = MagicMock()
    _cursor_mock(conn).fetchall.return_value = []
    _buscar_municipios(conn, 2024)
    query, params = _cursor_mock(conn).execute.call_args[0]
    assert "fonte = 'manual'" in query
    assert params == {"ano": 2024}


def test_contar_vertices_poligono_simples():
    quadrado = Polygon([(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)])
    assert _contar_vertices(quadrado) == 5  # shapely fecha o anel repetindo o 1º ponto


def test_contar_vertices_multipoligono_soma_as_partes():
    quadrado = Polygon([(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)])
    triangulo = Polygon([(2, 2), (2, 3), (3, 2), (2, 2)])
    assert _contar_vertices(MultiPolygon([quadrado, triangulo])) == 5 + 4


def test_contar_vertices_conta_aneis_internos():
    com_buraco = Polygon(
        [(0, 0), (0, 10), (10, 10), (10, 0), (0, 0)],
        holes=[[(2, 2), (2, 4), (4, 4), (4, 2), (2, 2)]],
    )
    assert _contar_vertices(com_buraco) == 5 + 5


def test_buscar_municipio_unico_encontrado():
    conn = MagicMock()
    _cursor_mock(conn).fetchone.return_value = ("3519600", "Ibitinga")
    df = _buscar_municipio_unico(conn, "3519600")
    assert list(df.itertuples(index=False)) == [("3519600", "Ibitinga")]


def test_buscar_municipio_unico_nao_encontrado_levanta_erro():
    conn = MagicMock()
    _cursor_mock(conn).fetchone.return_value = None
    with pytest.raises(SystemExit):
        _buscar_municipio_unico(conn, "0000000")


def test_restaurar_amostra_validada_reaplica_seed_sem_comentarios():
    """Incidente real (docs/DECISIONS.md seção 6.29): o pipeline automático
    sobrescreveu a amostra validada manualmente. Esta função reaplica o seed
    oficial pra restaurar — o teste garante que o SQL executado é o INSERT
    de verdade (comentários `--` removidos), não o arquivo cru."""
    conn = MagicMock()
    restaurar_amostra_validada(conn)
    sql_executado = _cursor_mock(conn).execute.call_args[0][0]
    assert "Gerado por generate_seed_sql.py" not in sql_executado
    assert "INSERT INTO validacao_mapbiomas" in sql_executado
    assert sql_executado.count("'manual')") == 63


def test_remover_validacao_automatica_nunca_apaga_a_amostra_manual():
    conn = MagicMock()
    _remover_validacao_automatica(conn, "3500204", 2024)
    query, params = conn.cursor.return_value.__enter__.return_value.execute.call_args[0]
    assert query.startswith("DELETE FROM validacao_mapbiomas")
    assert "fonte = 'automatico'" in query
    assert params == {"codigo_ibge": "3500204", "ano": 2024}
