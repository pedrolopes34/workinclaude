"""Constantes compartilhadas entre sentinel2.py (depende de earthengine-api)
e validacao.py / run_dnbr_estado.py (nao dependem) — separadas pra continuarem
testaveis sem a lib `ee` instalada."""

NO_DATA = -9999
LIMIARES_SEVERIDADE = (0.10, 0.27, 0.44)
BUFFER_VALIDACAO_M = 500

# Colecoes Sentinel-2 no Earth Engine: com correcao atmosferica (SR) e sem
# (L1C, reserva dos meses sem SR no Brasil — docs/DECISIONS.md secao 6.55).
COLECAO_SR = "COPERNICUS/S2_SR_HARMONIZED"
COLECAO_L1C = "COPERNICUS/S2_HARMONIZED"
