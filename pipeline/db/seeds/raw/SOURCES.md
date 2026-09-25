# Fontes dos dados brutos de seed

## `municipios_sp.csv`

645 municípios de SP (código IBGE de 7 dígitos + nome), filtrados de
[kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros)
(dataset público, derivado dos dados oficiais do IBGE) em 25/09/2026.

A API oficial do IBGE (`servicodados.ibge.gov.br/api/v1/localidades/...`)
está bloqueada pela política de rede do ambiente onde este seed foi gerado
— ver `docs/DECISIONS.md` seção 6.2. Os códigos dos municípios citados
nominalmente na pesquisa (Araraquara, Guarulhos, Ibitinga, Pitangueiras)
foram conferidos manualmente e batem. Vale uma conferência pontual contra a
fonte oficial do IBGE antes de tratar como definitivo para publicação.

## `validacao_mapbiomas_63.csv`

Transcrição de `Tabela_Final_63_Municipios.xlsx` (Google Drive do Pedro,
pasta `19_tabela_final_holistica`), lida via ferramenta de Google Drive em
25/09/2026. Planilha "Tabela Final Holística — 63 Municípios (30 originais
+ 33 novos)", comparação do método próprio (ST-DBSCAN + dNBR) contra o
MapBiomas Fogo Coleção 4, agosto/2024.

A própria planilha documenta duas correções já aplicadas por Pedro antes
desta leitura: (1) Pitangueiras — ValidTemp corrigido manualmente (7
eventos, dias 8–23); (2) Viradouro — mesorregião corrigida de um valor
truncado para "Ribeirão Preto". Essas correções foram preservadas aqui.

A coluna `resultado_positivo`/`motivo` deste CSV reproduz a coluna
"Resultado Positivo?" da planilha original (critério: Recall≥50% OU
p<0,05) — a própria planilha marca esse critério como "decisão de
conveniência para fechar esta tabela, não confirmada com o pesquisador".
**Não é** o campo `confiabilidade` do banco: esse é recalculado pela regra
de 4 níveis já fechada (`docs/DECISIONS.md` seção 1.3) a partir de
`recall_pct`/`p_valor`, não copiado desta coluna. Mantida no CSV só como
referência/auditoria da fonte original.
