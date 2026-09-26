from datetime import date

import pytest

from pipeline.run_dnbr import _endpoint_r2, _r2_configurado, janela_mes_anterior


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


ACCOUNT_ID_VALIDO = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"  # 32 hex — formato real da Cloudflare


@pytest.mark.parametrize(
    "valor_colado,esperado",
    [
        (ACCOUNT_ID_VALIDO, f"https://{ACCOUNT_ID_VALIDO}.r2.cloudflarestorage.com"),
        (ACCOUNT_ID_VALIDO.upper(), f"https://{ACCOUNT_ID_VALIDO}.r2.cloudflarestorage.com"),
        # Colar a URL do endpoint inteira em vez de so' o ID (1a hipotese
        # desta sessao, docs/DECISIONS.md secao 6.41).
        (f"https://{ACCOUNT_ID_VALIDO}.r2.cloudflarestorage.com", f"https://{ACCOUNT_ID_VALIDO}.r2.cloudflarestorage.com"),
        # Erro real confirmado por diagnostico em produção (53 caracteres,
        # sem espaço, não começava com "http" nem terminava em ".com" —
        # provavelmente o ID colado junto com texto extra da UI da
        # Cloudflare, tipo um rotulo ou espaço de outra fonte antes/depois).
        (f"conta: {ACCOUNT_ID_VALIDO} (produção)", f"https://{ACCOUNT_ID_VALIDO}.r2.cloudflarestorage.com"),
    ],
)
def test_endpoint_r2_normaliza_account_id(valor_colado, esperado):
    assert _endpoint_r2(valor_colado) == esperado


def test_endpoint_r2_sem_id_valido_da_erro_claro():
    with pytest.raises(ValueError, match="não parece conter um account id válido"):
        _endpoint_r2("isso não é um account id")
