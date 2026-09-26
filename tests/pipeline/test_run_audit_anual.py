from datetime import date
from decimal import Decimal

import pytest

from pipeline.run_audit_anual import (
    campos_faltando_para_correcao,
    coagir_tipo,
    serializavel,
    validar_campo,
)


def test_validar_campo_aceita_campo_corrigivel_conhecido():
    validar_campo("validacao_mapbiomas", "recall_pct")
    validar_campo("metricas_anuais", "num_agrupamentos")


def test_validar_campo_rejeita_tabela_desconhecida():
    with pytest.raises(SystemExit):
        validar_campo("municipios", "nome")


def test_validar_campo_rejeita_campo_fora_da_lista():
    with pytest.raises(SystemExit):
        validar_campo("metricas_anuais", "codigo_ibge")
    with pytest.raises(SystemExit):
        validar_campo("validacao_mapbiomas", "id")


def test_campos_faltando_para_correcao_nenhum_informado_e_auditoria_simples():
    assert campos_faltando_para_correcao(None, None, None, None) == []


def test_campos_faltando_para_correcao_completo_ok():
    assert campos_faltando_para_correcao("3552403", "validacao_mapbiomas", "recall_pct", "62.4") == []


def test_campos_faltando_para_correcao_parcial_acusa_os_que_faltam():
    faltando = campos_faltando_para_correcao("3552403", None, "recall_pct", None)
    assert faltando == ["--tabela", "--valor-novo"]


def test_coagir_tipo_sem_valor_atual_mantem_texto():
    assert coagir_tipo("qualquer coisa", None) == "qualquer coisa"


def test_coagir_tipo_bool():
    assert coagir_tipo("true", False) is True
    assert coagir_tipo("0", True) is False


def test_coagir_tipo_date():
    assert coagir_tipo("2025-08-15", date(2024, 1, 1)) == date(2025, 8, 15)


def test_coagir_tipo_int():
    assert coagir_tipo("7", 4) == 7
    assert isinstance(coagir_tipo("7", 4), int)


def test_coagir_tipo_decimal():
    assert coagir_tipo("62.4", Decimal("50.0")) == Decimal("62.4")


def test_coagir_tipo_texto_passa_direto():
    assert coagir_tipo("Média", "Alta") == "Média"


def test_serializavel():
    assert serializavel(None) is None
    assert serializavel(Decimal("62.4")) == "62.4"
    assert serializavel(date(2025, 8, 15)) == "2025-08-15"
    assert serializavel(4) == "4"
    assert serializavel("Alta") == "Alta"
