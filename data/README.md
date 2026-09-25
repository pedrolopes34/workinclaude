# /data

Dados brutos e intermediários usados pelo `/pipeline` — focos de calor do INPE
(`01_SP_Focos_Master.csv`), tabelas de apoio (classificação de bioma por
município) e a tabela de validação (`Tabela_Final_63_Municipios.xlsx`).

Arquivos de dado brutos (CSV/XLSX grandes) não são versionados aqui — só
amostras pequenas e os metadados necessários para reproduzir a ingestão. Os
originais vivem no Google Drive do Pedro (ver `CONTEXTO_PROJETO.md` na raiz do
repositório para os nomes/pastas exatos).

Os dados já processados e validados (os que alimentam o produto) ficam no
banco Postgres, não aqui — ver `/pipeline/db`.
