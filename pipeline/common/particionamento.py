"""Particionamento de municípios em grupos pra jobs paralelos do GitHub
Actions (dNBR e validação MapBiomas — docs/DECISIONS.md seção 2.1/6.14)."""

import pandas as pd


def dividir_em_grupo(municipios: pd.DataFrame, grupo: int, de_grupos: int) -> pd.DataFrame:
    """Fatia `grupo`-ésima (1-indexado) de `de_grupos` fatias intercaladas —
    ordenação por codigo_ibge (já vem assim de _buscar_municipios) garante
    resultado determinístico e sem sobreposição entre jobs."""
    if not 1 <= grupo <= de_grupos:
        raise ValueError(f"grupo deve estar entre 1 e {de_grupos}, recebi {grupo}")
    return municipios.iloc[grupo - 1 :: de_grupos].reset_index(drop=True)
