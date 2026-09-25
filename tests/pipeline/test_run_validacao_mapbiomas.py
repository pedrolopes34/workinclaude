from datetime import datetime

import pandas as pd

from pipeline.run_validacao_mapbiomas import _descrever_validacao_temporal


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
