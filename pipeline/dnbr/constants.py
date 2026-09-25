"""Constantes compartilhadas entre sentinel2.py (depende de earthengine-api)
e validacao.py (nao depende) — separadas pra validacao.py continuar
testavel sem a lib `ee` instalada."""

NO_DATA = -9999
LIMIARES_SEVERIDADE = (0.10, 0.27, 0.44)
BUFFER_VALIDACAO_M = 500
