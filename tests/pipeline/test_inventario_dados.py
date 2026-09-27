from pipeline.inventario_dados import SEED_METRICAS_2024, valores_seed_2024


def test_le_valores_do_seed_2024_inclusive_null():
    texto = (
        "VALUES\n"
        "    ('3500105', 2024, 17, 2, 86.43, 21.58),\n"
        "    ('3502705', 2024, 2, 0, NULL, 194.35),\n"
        "    ('3500000', 2024, NULL, NULL, NULL, NULL);\n"
    )
    assert valores_seed_2024(texto) == {
        "3500105": (17, 2),
        "3502705": (2, 0),
        "3500000": (None, None),
    }


def test_seed_real_tem_os_63_municipios_da_amostra():
    valores = valores_seed_2024(SEED_METRICAS_2024.read_text(encoding="utf-8"))
    assert len(valores) == 63
    assert valores["3539509"] == (95, 7)  # Pitangueiras, ago/2024
