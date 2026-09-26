from datetime import date

import pytest

from pipeline.run_dnbr import _r2_configurado, janela_mes_anterior


@pytest.mark.parametrize(
    "hoje,esperado_antes,esperado_depois",
    [
        (date(2024, 9, 15), ("2024-08-01", "2024-09-01"), ("2024-09-01", "2024-09-15")),
        (date(2024, 1, 10), ("2023-12-01", "2024-01-01"), ("2024-01-01", "2024-01-10")),  # virada de ano
        (date(2024, 3, 1), ("2024-02-01", "2024-03-01"), ("2024-03-01", "2024-03-01")),  # fevereiro bissexto
    ],
)
def test_janela_mes_anterior(hoje, esperado_antes, esperado_depois):
    antes, depois = janela_mes_anterior(hoje)
    assert antes == esperado_antes
    assert depois == esperado_depois


def test_r2_configurado_falso_sem_env(monkeypatch):
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    assert _r2_configurado() is False


def test_r2_configurado_falso_com_secret_vazio(monkeypatch):
    # Secret do GitHub Actions nao configurado ainda vira env var = "" (nao
    # remove a variavel) — precisa contar como "nao configurado" tambem.
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "")
    assert _r2_configurado() is False


def test_r2_configurado_verdadeiro_com_valor(monkeypatch):
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "chave-de-teste")
    assert _r2_configurado() is True
