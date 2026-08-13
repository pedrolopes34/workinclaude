# Contexto do Projeto — Pesquisa PIBIC/CNPq (Incêndios Florestais)

> Este arquivo resume conversas importantes do Claude Code que aconteceram **antes** deste repositório existir (terminal local, 03–07/ago/2026). Serve para qualquer sessão nova (terminal ou web) já começar com o contexto certo, sem repetir descobertas ou erros já resolvidos.

## Quem é o pesquisador

Pedro (Pedrão), estudante de Engenharia de Biossistemas na UNESP (Tupã-SP), bolsista PIBIC/CNPq. Contas Google usadas no projeto: **`oliveiralopespedro@gmail.com`** (pessoal, principal — onde estão os dados) e `pedro-lopes.oliveira@unesp.br` (institucional, dona de ao menos uma pasta relacionada ao MapBiomas). **Confundir as duas já causou perda de tempo real — sempre confirmar qual conta está montada/logada antes de assumir que um arquivo "não existe".**

## Objetivo da pesquisa

Método próprio de detecção de incêndios florestais: **ST-DBSCAN** (clusterização espaço-temporal dos focos de calor do INPE) + **dNBR** (severidade de queima via Sentinel-2/Google Earth Engine), comparado formalmente contra o produto independente **MapBiomas Fogo** (Coleção 4) para demonstrar que o método é mais sensível/vantajoso — especialmente em **resolução temporal** (o método opera por evento/dias; MapBiomas consolida mensal/anual). Objetivo de longo prazo: transformar em software, possivelmente com proteção de propriedade intelectual (nota: no Brasil software "em si" não é patenteável pelo INPI — Lei 9.279/96 art. 10 — é protegido por direito autoral/Lei 9.609/98; uma solução técnica maior pode ser patenteável, mas isso é decisão para consultar depois com alguém de PI).

## Pipeline metodológico (ordem real)

1. **Pitangueiras** foi o município piloto original — todo o método foi validado nele primeiro. É a referência visual/metodológica ("tem que ficar parecido com Pitangueiras").
2. **Seleção de regiões/cidades**: 5 regiões (Local/Ribeirão Preto, SJRP, Vale do Ribeira, RMSP, Mista/Alta Paulista) × top-3 municípios por anomalia de focos de calor em agosto/2024 (vs. teto histórico 2018–2023) = 15 cidades (Rodadas 1 e 2).
3. **ST-DBSCAN**: `eps_space_km=3.0`, `eps_time_days=1.0`, `min_samples=4` (reduzido para 2 em cidades de sinal fraco usadas como teste de limite do método).
4. **dNBR**: gerado via Sentinel-2/GEE, recortado pelo **polígono municipal real** (shapefile `SP_Municipios_2024`) — não pelo buffer circular de 25km usado só no piloto original de Pitangueiras (por isso o raster dela é visualmente maior/"quadrado" no mosaico estadual).
5. **Rodada 5 (repescagem)**: +3 cidades fora das 5 regiões originais, escolhidas por perfil geográfico distinto — **Andradina** (extremo-oeste, pecuária), **Amparo** (Circuito das Águas/Campinas), **Alumínio** (transição metro-interior).
6. **grupo_complemento**: +12 cidades — 6 de sinal real (Ibitinga, Jaú, Rio Claro, Pontal, Barrinha, Areiópolis) + 6 de sinal fraco/nulo mantidas de propósito como teste de limite (Viradouro, Morro Agudo, Terra Roxa, Tupã, Barra do Chapéu, Iporanga).
7. **Total**: ~29-30 municípios de 645 no estado (**4,5%**), capturando **≈24,7% de todos os focos de calor do estado** em agosto/2024 (891 de 3.612) — métrica de eficiência forte para o projeto.
8. **Eixo 3 — validação visual** (piloto + expansão): para municípios com recall alto/precisão baixa, classificar visualmente (chips RGB via GEE) se a "área extra" detectada é fogo real ou falso positivo.
9. **Validação quantitativa IoU/Jaccard vs. MapBiomas Fogo** + teste de significância por permutação (999x).

## Estilo visual padrão (importante — não reinventar)

Extraído do projeto QGIS de referência de Pitangueiras (`Pitangueiras_STDBSCAN_dNBR_periodos_essenciais.qgz`):
- **Sem imagem de satélite por baixo** — só o raster dNBR com paleta específica e opaco.
- **Paleta exata** (6 pontos): `-0,25 azul (#0069ff)` → `-0,10 verde escuro (#1c8401)` → `0,10 verde claro (#3ae93c)` → `0,27 amarelo (#ffed00)` → `0,44 laranja (#ff7e00)` → `0,75 vermelho escuro (#ad0000)`.
- **A cor de evidência espectral (forte/moderada/fraca) NUNCA pinta o raster inteiro** — só os **buffers de 500m ao redor dos eventos ST-DBSCAN validados**, com transparência (40-50%). Pintar o raster inteiro cria "borrões" (qualquer variação de vegetação, inclusive colheita de cana, acende o mapa inteiro).
- Chamado de "estilo QGIS" nos scripts (não "estilo Pitangueiras").
- Produto final: mosaico do estado de SP inteiro (todas as cidades na posição geográfica real, sem nomes, alta resolução `dpi=500`) + 6 recortes regionais nomeados (+ 1 experimental SJRP+RP fundidos).

## Resultados principais já obtidos

**Eixo 3 (validação visual, 18 cidades do piloto+expansão, 80-98 pontos classificados):**
- 55% agrícola/colheita (falso positivo), 24% fogo real, 19% inconclusivo, 2% nuvem/sombra.
- Pontos de atenção prioritária: **Pontal P1** (99,9 km², maior mancha, confiança média), **Amparo P2/P3** (contaminação por nuvem), **Rio Claro P2** (telhados/construções confundidos com fogo), **Altinópolis** (destoa: 4/6 pontos fogo real, ao contrário do padrão majoritário agrícola dos demais).

**IoU/Jaccard vs. dNBR (20 municípios válidos):**
- IoU médio ≈26% (variação 0,041–0,425).
- Só **30% (6/20) estatisticamente significativos** (p<0,05, teste de permutação): Olímpia, Lucélia, Andradina, Alumínio, Ibitinga, Rio Claro. Na borda (p≈0,051): Altinópolis, Morro Agudo.
- Correlação volume×IoU positiva mas não conclusiva (Pearson r=0,41 p=0,074; Spearman r=0,42 p=0,063).
- 20% dos municípios (6/30) sem nenhum cluster em 2024 (Barra do Turvo, Apiaí, Registro, Guarulhos, Suzano, Viradouro) — falta de volume de dado, não falha do algoritmo.
- Comparação direta com MapBiomas Fogo (Tarefa 3): script corrigido pela última vez para tratar o produto "mensal" como 1 banda/ano com valor de pixel = mês (1-12) — **resultado final dessa etapa específica não estava fechado na última conversa registrada**; conferir se já rodou.

## Armadilhas técnicas já resolvidas (não repetir)

1. **GEE exige `ee.Initialize(project=...)`** — ID do projeto do Pedro: `concrete-bloom-374223`.
2. **Cobertura de nuvem (`CLOUDY_PIXEL_PERCENTAGE`) mede a cena inteira, não o recorte do município** — uma cena pode passar no filtro e mesmo assim cobrir quase nada da área real (aconteceu com Registro: 99,999% dos pixels eram NoData). Sempre checar % real de pixels válidos dentro do polígono, não só "a imagem existe".
3. **MapBiomas Fogo Coleção 4** — o produto "mensal" na verdade tem só 40 bandas (1 por ano, 1985–2024), e o **valor do pixel codifica o mês** (1–12), não uma banda por mês.
4. **Duplicatas de arquivo no Drive** (mesmo nome em pastas diferentes) — scripts devem sempre pegar o **mais recente**, não o primeiro encontrado (aconteceu com Registro).
5. Notebook `06_09`: células 8 e 9 têm código duplicado (pendente de limpeza). `06_10` Figura 1 usa dado simulado (`np.random.normal`) só para composição visual.

## ⚠️ Segurança — nunca fazer (já causou incidente real)

Em 07/ago, um script fornecido pelo Claude continha `shutil.rmtree('/content/gdrive', ignore_errors=True)` **sem checagem**, antes de `drive.mount()`. Rodado depois que o Drive já estava montado de verdade, isso **apagou recursivamente o Google Drive pessoal inteiro** do Pedro (incluindo exame de saúde e título eleitoral). Foi recuperado 100% pela Lixeira do Drive, mas:

> **Nenhum script deve conter comando de deleção recursiva (`rmtree`, `rm -rf`, etc.) apontando para um ponto de montagem de Drive.** Para "limpar" antes de montar, usar só `drive.mount(..., force_remount=True)` (que recusa sobrescrever conteúdo real) ou pedir para o usuário apagar manualmente a pasta específica.

**⚠️ Pendência de segurança ainda não corrigida (achada 12/ago):** a célula 0 de `Analise_Imagens_IdPadroes.ipynb` (pasta com `Validacao_Oficial_IoUJaccardPixels.ipynb`) ainda tem exatamente esse padrão perigoso — `shutil.rmtree('/content/gdrive', ignore_errors=True)` antes de `drive.mount()`. A célula 1 do mesmo notebook já foi corrigida (só monta, sem apagar). Não rodar a célula 0 desse notebook até tirar a linha do `rmtree` manualmente — não temos ferramenta de edição direta de arquivo do Drive nesta sessão, só criação de arquivo novo.

## Fase 3 — ajustes pendentes da validação (progresso, sessão 12/ago/2026 web)

Dados-fonte usados: pasta Drive `12_validacao_iou_jaccard` (gerada 07/ago pelo notebook `Validacao_Oficial_IoUJaccardPixels.ipynb`), especificamente `tarefa1_iou_pixels_por_municipio.csv`, `tarefa2_significancia_permutacao.csv`, `tarefa3_comparacao_mapbiomas_fogo.csv`.

- [x] **Correção FDR (Benjamini-Hochberg) nos 20 p-valores** — feito. Resultado real: em `q<0,05` (rigor padrão) **zero** municípios sobrevivem; em `q<0,10` sobrevivem 5/20 (Andradina, Ibitinga, Olímpia, Rio Claro, Alumínio — Lucélia cai fora). **Decisão do Pedro (12/ago): reportar os dois como análise de sensibilidade** — q<0,10 = "sugestivo", q<0,05 = "robusto" — em vez de adotar um corte único. Resultado completo salvo em `tarefa2b_fdr_correcao_multipla.csv`, mesma pasta do Drive.
- [x] **Ajuste de precisão (novo limiar de dNBR)** — **fechado, rodado oficialmente no Colab (13/ago)**. `LIMIAR_DNBR` trocado de 0,10 → 0,27 em `Validacao_Oficial_IoUJaccardPixels.ipynb` (Tarefas 1/2 e 3), saídas em arquivos `_limiar027.csv` separados dos originais (não sobrescreve o baseline 0,10). No caminho, 2 bugs reais do notebook precisaram ser corrigidos antes de rodar:
  1. Detecção da pasta base falhava (`FileNotFoundError`) — candidatos de caminho usavam `"Vida academica"` sem acento / possível mismatch de normalização Unicode (NFC×NFD) com o nome real da pasta no Drive (`"Vida acadêmica"`). Corrigido com fallback em 3 camadas (caminho direto → comparação de nome normalizada → busca recursiva por `Pesquisa_Cientifica_Fev26Out27`).
  2. `NameError` na Tarefa 1/2: linha morta duplicada usando `shape_ref`/`transform_ref` (nunca definidos nessa célula, só existem na Tarefa 3) sobrando em cima da linha correta (`shape`/`transform`). Bug vizinho no bloco especial Areiópolis/Ibitinga usava `crs_ref` (idem, indefinido) e caminho fixo incompatível com `OUT` — trocado por `crs_raster`/`OUT`.

  **Resultado (comparação oficial, todos os 30 municípios, `tarefa3_comparacao_mapbiomas_fogo_limiar027.csv` vs. original 0,10):**
  - Área dNBR média cai **60,1%** (280,1 km² → 111,7 km²) — corta bastante área, como esperado ao subir o limiar.
  - IoU dNBR×MapBiomas **melhora em 22/30 municípios**, piora em só 5 (2 ficam ~iguais/zero nos dois). Entre os 20 "válido_com_cluster": IoU médio **0,090 → 0,115 (+28% relativo)**. Destaques: Amparo (0,021→0,168), Alumínio (0,040→0,155), Ibitinga (0,165→0,238), Terra Roxa (0,064→0,136). Pioras notáveis: Altair (0,402→0,364), Altinópolis (0,003→0,001).
  - **Conclusão: limiar 0,27 é uma melhoria real de precisão**, não só teórica — valida a decisão do Pedro (12/ago) de ir por aí em vez do filtro cruzado com MapBiomas LULC.
  - FDR (BH) nos novos p-valores (`tarefa2b_fdr_correcao_multipla_limiar027.csv`): p bruto<0,05 sobe de 6→9 municípios; em q<0,05 continua **zero** (mesmo padrão de antes); em q<0,10 ficam 4 (Adamantina, Andradina, Ibitinga, Morro Agudo — conjunto parcialmente diferente do da rodada 0,10, que tinha Andradina/Ibitinga/Olímpia/Rio Claro/Alumínio). Mantém a mesma leitura de sensibilidade decidida antes (q<0,10 sugestivo, q<0,05 robusto).
  - Todos os CSVs (`tarefa1/2/3_..._limiar027.csv`, `tarefa2b_fdr_correcao_multipla_limiar027.csv`) salvos na pasta Drive `12_validacao_iou_jaccard`, ao lado dos originais 0,10.
- [x] **Teste de precisão do MapBiomas Fogo** (validação visual manual) — **fechado 13/ago**. O notebook `Analise_Imagens_IdPadroes.ipynb` (com o `shutil.rmtree` perigoso da célula 0 corrigido, e caminho de saída ajustado para `03_resultados/13_validacao_visual_piloto_eixo3`, ver seção de Segurança) foi rodado pelo Pedro e gerou 92 chips RGB (Sentinel-2, ~512px, ~40 dias em torno de 15/ago/2024) amostrados dentro da "área extra" (área que o método detectou e o MapBiomas Fogo NÃO capturou) em 16 municípios. Classificação visual feita ponto a ponto (eu mesmo, olhando cada chip): **65,2% agrícola** (falso positivo — solo exposto/colheita/pasto/rio, sem carbonização), **19,6% inconclusivo**, **12,0% fogo real** (textura granulada escura/cinza de queima, contorno orgânico), **3,3% nuvem**. Resultado completo em `eixo3_classificacao_visual_92pontos.csv`, pasta Drive `13_validacao_visual_piloto_eixo3`. **Nota de precisão sobre o próprio processo**: essa classificação foi feita por IA (Claude), não pelo Pedro manualmente — não é metodologicamente equivalente a validação humana para fins de publicação, mas serve como estimativa de trabalho por ora (decisão explícita do Pedro, 13/ago: "isso não é relevante pra metodologia por enquanto").
  - **Divergência vs. o resumo herdado de sessão anterior** ("55% agrícola/24% fogo real/19% inconclusivo/2% nuvem", 18 cidades, 80-98 pontos) — **investigada a fundo em 13/ago (mesmo dia)**, ver item de comparação abaixo. Conclusão: a diferença **não é sampling nem conjunto de municípios** — é diferença de critério de classificação entre a rodada antiga e esta.
  - **Achado interessante**: Alumínio (5/5 pontos) e boa parte de Areiópolis/Ibitinga (municípios com geometria de cluster reconstruída por aproximação, não pelo método oficial) ficaram majoritariamente `inconclusivo` — mata densa/clareira sem assinatura clara de queima nem de agricultura. Vale não superinterpretar a significância estatística desses municípios sem essa ressalva.
  - **Confirmação de nota antiga**: Amparo (3/3 pontos) deu `nuvem` — bate exatamente com a nota já registrada ("Amparo P2/P3, contaminação por nuvem"), inclusive estendendo pro P1.
- [x] **Comparação direta rodada antiga (07/ago) × rodada nova (13/ago), mesmos municípios** — **fechado 13/ago**. A pasta com os chips originais de 07/ago foi localizada no Drive (`04_Resultados_dos_Codigos/Resultados_Analise_Visual-Assistida_Comparativo_Metodo`) — 17 municípios, 98 chips (mesma lista dos 16 da rodada nova + Pontes Gestal, que tinha ficado de fora da lista `MUNICIPIOS` da célula 1 do `Analise_Imagens_IdPadroes.ipynb` por engano). Reclassifiquei os 98 chips antigos eu mesmo (mesmo critério da rodada nova) e comparei isolando só os 16 municípios em comum:
  - **Rodada antiga (chips de 07/ago, reclassificados agora), n=92**: 62,0% agrícola, 23,9% inconclusivo, 10,9% fogo real, 3,3% nuvem.
  - **Rodada nova (chips de 13/ago), n=92**: 65,2% agrícola, 19,6% inconclusivo, 12,0% fogo real, 3,3% nuvem.
  - **As duas rodadas são estatisticamente muito próximas** (diferença de 1-4 pontos percentuais por categoria) — a aleatoriedade da amostragem (o script não fixa seed) explica só uma pequena oscilação, não uma mudança grande. Por município, o padrão majoritário se repete quase sempre (Alumínio 5/5 inconclusivo nas duas rodadas, Amparo 3/3 nuvem nas duas, Morro Agudo 6/6 agrícola nas duas, Olímpia mesma distribuição exata nas duas).
  - **Pontes Gestal isolado**: 6/6 (100%) agrícola nos chips antigos de 07/ago, 5/5 (100%) agrícola nos chips novos gerados hoje — **contradiz a hipótese de que Pontes Gestal tenha puxado o "24% fogo real" antigo pra cima**.
  - **Conclusão sobre a divergência 24% × ~11-12%**: não é efeito de amostragem nem de conjunto de municípios (ambos controlados nesta comparação). É diferença de critério entre quem/o que classificou a rodada original e a reclassificação feita agora. **Achei uma pista concreta**: o chip antigo `chip_Rio_Claro_P2.png` mostra claramente telhados/construções rurais (retângulos brancos brilhantes, geometria artificial nítida) — e bate exatamente com uma nota já registrada no contexto herdado ("Rio Claro P2, telhados/construções confundidas com fogo"). Isso é evidência direta de que a rodada original pode ter contado como "fogo real" pelo menos alguns pontos que eram, na verdade, construções — o que infla artificialmente a fração de fogo_real. Não dá pra confirmar isso pra todos os pontos antigos (nunca achamos o rótulo original ponto a ponto), mas é consistente com a rodada atual (mais conservadora sobre nuvem/construção/água/sombra) estar mais correta que a antiga.
  - CSV completo da reclassificação dos 98 chips antigos: `eixo3_classificacao_visual_ANTIGA_98pontos_reclassificada.csv`, pasta Drive `13_validacao_visual_piloto_eixo3`.
- [~] **Teste de recall** (quantos dos pontos "fogo real" confirmados o MapBiomas também captou) — **não é computável com os dados atuais, e o motivo é estrutural, não falta de tempo**: os 92 pontos foram amostrados especificamente dentro da "área extra" (fora do polígono do MapBiomas, por construção do próprio script de amostragem) — então checar se o MapBiomas capturou esses pontos dá 0% por definição, não é uma métrica de recall de verdade. Pra medir recall de verdade precisaria de uma amostragem nova, com pontos dentro da área de sobreposição método×MapBiomas (não só na área extra). Não construí esse sampler ainda — é trabalho novo, não uma pendência de dados perdidos.
- [ ] **Regra de classificação de bioma para os 136 municípios ambíguos** — **pulado por decisão do Pedro (12/ago)**, sem dados/critério localizados ainda. Não fica claro no contexto herdado qual lista é essa nem o critério de "ambiguidade" — perguntar ao Pedro origem exata (shapefile de biomas do IBGE? município na fronteira Cerrado/Mata Atlântica?) antes de tentar resolver.

**Bloqueio para a Fase 4** ("decisão de escala — Cerrado paulista"): o roadmap deixa explícito que a decisão de expandir depende do resultado desta etapa. Dos 5 itens, 3 estão fechados (correção FDR, ajuste de limiar dNBR, teste de precisão visual) e 2 seguem pendentes: recall verdadeiro (precisa de amostragem nova, ver nota acima) e regra de bioma (falta critério do Pedro). A Fase 3 está **majoritariamente fechada**; falta resolver essas 2 pendências ou o Pedro decidir explicitamente descartá-las antes de iniciar a Fase 4.

## Próximos passos pendentes (conforme última conversa)

- [x] Re-rodar `Validacao_Oficial_IoUJaccardPixels.ipynb` com limiar de dNBR 0,27 (novo) e comparar IoU/precisão com o limiar 0,10 (antigo) — feito 13/ago, ver seção Fase 3 acima.
- [x] Corrigir o `shutil.rmtree` da célula 0 de `Analise_Imagens_IdPadroes.ipynb` — feito 13/ago (versão corrigida rodada com sucesso pelo Pedro, gerou os 92 chips do Eixo 3).
- [x] Classificação visual dos 92 chips do Eixo 3 — feito 13/ago, ver seção Fase 3 acima (`eixo3_classificacao_visual_92pontos.csv`).
- [ ] Construir um sampler novo de pontos DENTRO da área de sobreposição método×MapBiomas (não só na área extra) para computar recall de verdade — trabalho novo, ver nota na seção Fase 3.
- [ ] Esclarecer com o Pedro a origem/critério dos "136 municípios ambíguos" de bioma.
- [ ] Fechar Tarefa 3 (comparação MapBiomas Fogo) e escrever a conclusão final (seção 7 do prompt mestre: eficácia do método, onde falha, comparação com MapBiomas) — agora informada pela decisão de reportar significância como sensibilidade (q<0,05 vs q<0,10).
- [ ] Exportar RGB real das 3 cidades de repescagem (Andradina, Amparo, Alumínio).
- [ ] "Pente-fino" nos notebooks/scripts mais antigos (revisão geral).
- [ ] Confirmar status final de Barra do Turvo/Apiaí/Tupã no mapa geral após script de correção (`06_31`).
- [ ] Etapa "chapa-branca": dashboard Power BI didático (aquecimento para a parte de Engenharia de Software do curso).
- [x] Notas didáticas ("+Texto" Colab) nos 12 notebooks principais — feito, organizado em ordem numérica 06_01–06_12.

## Sessões de origem

Resumo gerado a partir de 3 sessões do terminal (não migram automaticamente para o Claude Code web — por isso este arquivo existe):
- `ad9a2e61` (05/ago) — setup de acesso ao Drive, pipeline completo de ST-DBSCAN+dNBR, todas as rodadas, mapas, IoU/Jaccard.
- `a1f1f194` (07/ago) — Eixo 3 (validação visual), incidente do Drive e recuperação.
- `279cf0ae` (03/ago) — notas didáticas para os 12 notebooks.
