# /geodata

Malha municipal do IBGE (shapefile `SP_Municipios_2024`) e outros dados
geoespaciais de referência usados para recortar o dNBR pelo polígono real do
município (não pelo buffer circular usado só no piloto de Pitangueiras — ver
`docs/DECISIONS.md`).

Ainda não importado. A coluna `geom` da tabela `municipios` fica vazia até
essa malha ser carregada no banco (decisão registrada em
`docs/DECISIONS.md`, seção 3).
