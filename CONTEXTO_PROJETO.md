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
- 55% agrícola/colheita (falso positivo), 24% fogo real, 19% inconclusivo, 2% nuvem/sombra. **Esse número é agregado das 18 cidades juntas — não existe quebra por cidade** (ver armadilha #8: tentativa de gerar essa quebra via reclassificação de imagens não é viável nesta sessão).
- Pontos de atenção prioritária: **Pontal P1** (99,9 km², maior mancha, confiança média), **Amparo P2/P3** (contaminação por nuvem), **Rio Claro P2** (telhados/construções confundidos com fogo), **Altinópolis** (destoa: 4/6 pontos fogo real, ao contrário do padrão majoritário agrícola dos demais).

**IoU/Jaccard vs. dNBR (20 municípios válidos) — validação interna (cluster ST-DBSCAN × raster dNBR, SEM MapBiomas):**
- IoU médio ≈26% (variação 0,041–0,425).
- Só **30% (6/20) estatisticamente significativos** (p<0,05, teste de permutação): Olímpia, Lucélia, Andradina, Alumínio, Ibitinga, Rio Claro. Na borda (p≈0,051): Altinópolis, Morro Agudo.
- Correlação volume×IoU positiva mas não conclusiva (Pearson r=0,41 p=0,074; Spearman r=0,42 p=0,063).
- Fonte: `tarefa1_iou_pixels_por_municipio.csv` + `correlacao_nfocos_iou.csv`.
- 20% dos municípios (6/30) sem nenhum cluster em 2024 inteiro (Barra do Turvo, Apiaí, Registro, Guarulhos, Suzano, Viradouro) — falta de volume de dado, não falha do algoritmo. +4 municípios têm cluster, mas não em agosto especificamente (Terra Roxa, Tupã, Barra do Chapéu, Iporanga).

**Comparação direta com MapBiomas Fogo (Tarefa 3) — ✅ confirmado rodado e com resultado (verificado 11/ago via Drive, sessão web):**
- Fonte: `tarefa3_comparacao_mapbiomas_fogo.csv` (30 municípios), gerado em 07/ago pelo notebook `Validacao_Oficial_IoUJaccardPixels.ipynb` — **novo local**: `03_Codigos_Colab/08_Codigos_Ampliacao_Estudo_pSoftware/` (não está nas pastas `06_`/`07_` antigas).
- **IoU dNBR×MapBiomas**: médio 6,3% (0%–45%, topo Pontes Gestal).
- **IoU cluster(ST-DBSCAN)×MapBiomas**: médio 7,1% (0%–25,4%, topo também Pontes Gestal; só existe pros 20 municípios com cluster em agosto).
- **Padrão-chave pra seção 7**: o método captura ≈74% da área que o MapBiomas Fogo identifica (só 128,9 km² dos 491,6 km² do MapBiomas ficam fora dos clusters), mas os clusters têm área "extra" enorme não confirmada pelo MapBiomas (3.517,9 km² dos 3.870,5 km² totais de cluster) — **alto recall, baixa precisão bruta em área**. Bate com o achado do Eixo 3 (55% da área extra é falso positivo agrícola/colheita) — é exatamente por isso que o "estilo QGIS" nunca pinta o dNBR inteiro, só os buffers validados.
- Municípios onde o cluster já cobre quase toda a área do MapBiomas (recall ~100%): Santana de Parnaíba, Salmourão, Lucélia, Adamantina, Alumínio, Barrinha, Areiópolis.
- ⚠️ Cuidado ao reabrir essa pasta — ver Armadilhas técnicas #6 (pasta duplicada com resultado errado).

**Dois produtos MapBiomas diferentes no projeto (não confundir):**
- **MapBiomas Fogo Coleção 4** (cicatriz de queima) — usado na Tarefa 3 acima, comparação central da tese do projeto.
- **MapBiomas Coleção 10.1** (uso e cobertura do solo) — usado numa frente à parte (ETL de uso do solo, transição cana×soja, correlação de Pearson agronegócio×anomalias). Resultados em `02_Dados_Processados/02_Agroambiental_Sensoriamento_MapBiomas_Derivados_2026-07-07/`.

## Armadilhas técnicas já resolvidas (não repetir)

1. **GEE exige `ee.Initialize(project=...)`** — ID do projeto do Pedro: `concrete-bloom-374223`.
2. **Cobertura de nuvem (`CLOUDY_PIXEL_PERCENTAGE`) mede a cena inteira, não o recorte do município** — uma cena pode passar no filtro e mesmo assim cobrir quase nada da área real (aconteceu com Registro: 99,999% dos pixels eram NoData). Sempre checar % real de pixels válidos dentro do polígono, não só "a imagem existe".
3. **MapBiomas Fogo Coleção 4** — o produto "mensal" na verdade tem só 40 bandas (1 por ano, 1985–2024), e o **valor do pixel codifica o mês** (1–12), não uma banda por mês.
4. **Duplicatas de arquivo no Drive** (mesmo nome em pastas diferentes) — scripts devem sempre pegar o **mais recente**, não o primeiro encontrado (aconteceu com Registro).
5. Notebook `06_09`: células 8 e 9 têm código duplicado (pendente de limpeza). `06_10` Figura 1 usa dado simulado (`np.random.normal`) só para composição visual.
6. **Duplicata de pasta inteira com mesmo nome** — `12_validacao_iou_jaccard`, dentro de `04_Resultados_dos_Codigos/Resultados_Extras_STDBSCAN_Eventos_2026-06-30/tabelas_csv/`. Existem 2 pastas com esse nome exato: uma tem os CSVs reais e completos da Tarefa 3 (`tarefa1_iou_pixels_por_municipio.csv`, `tarefa3_comparacao_mapbiomas_fogo.csv`, `correlacao_nfocos_iou.csv` — Drive id da pasta correta: `1aICvnU47G37xn3hX4BHQurzXhlcHt0L6`); a outra tem um `tarefa3_comparacao_mapbiomas_fogo.csv` placeholder (só 2 colunas, "dado faltando", sem números). **A versão errada tem timestamp de modificação mais recente** — a regra "pega sempre o mais novo" (armadilha #4) não basta aqui; sempre confira também o número de colunas/conteúdo antes de usar.
7. **Dois produtos MapBiomas diferentes no projeto**: **MapBiomas Fogo Coleção 4** (cicatriz de queima, usado na Tarefa 3/comparação central) vs. **MapBiomas Coleção 10.1** (uso e cobertura do solo, usado numa frente à parte de correlação agronegócio×anomalias). Não confundir ao discutir "a comparação com MapBiomas".
8. **Classificação visual (Eixo 3) via download de imagem pela API do Drive não escala nesta sessão** — cada chip (~25KB) baixado em base64 pela ferramenta de Drive ocupa uma fatia enorme de contexto (dezenas de milhares de caracteres por imagem, ~98 chips existentes pras 17 cidades já exportadas); tentar reconstruir o arquivo copiando o base64 manualmente pode truncar/corromper sem aviso óbvio (aconteceu: um chip de 25.596 bytes virou 1.231 bytes ao ser copiado — só foi pego porque o tamanho foi conferido antes de "ler" o arquivo). **Não pedir pro Claude reclassificar chips em lote por esse caminho.** Alternativas reais: (a) classificar direto no Drive/Colab olhando as imagens (mais rápido, é literalmente o que um humano faria), ou (b) colar/anexar as imagens direto no chat pro Claude ver (anexo nativo não passa pelo mesmo gargalo de base64-via-ferramenta MCP).

## ⚠️ Segurança — nunca fazer (já causou incidente real)

Em 07/ago, um script fornecido pelo Claude continha `shutil.rmtree('/content/gdrive', ignore_errors=True)` **sem checagem**, antes de `drive.mount()`. Rodado depois que o Drive já estava montado de verdade, isso **apagou recursivamente o Google Drive pessoal inteiro** do Pedro (incluindo exame de saúde e título eleitoral). Foi recuperado 100% pela Lixeira do Drive, mas:

> **Nenhum script deve conter comando de deleção recursiva (`rmtree`, `rm -rf`, etc.) apontando para um ponto de montagem de Drive.** Para "limpar" antes de montar, usar só `drive.mount(..., force_remount=True)` (que recusa sobrescrever conteúdo real) ou pedir para o usuário apagar manualmente a pasta específica.

## Próximos passos pendentes (conforme última conversa + verificação 11/ago)

- [x] Tarefa 3 (comparação MapBiomas Fogo) — confirmado rodado, dado coerente com Eixo 3 (ver Resultados principais).
- [ ] Escrever a conclusão final (seção 7 do prompt mestre: eficácia do método — alto recall/baixa precisão bruta vs. MapBiomas —, onde falha, comparação formal com MapBiomas) usando os números da Tarefa 3.
- [x] Exportar RGB real das 3 cidades de repescagem (Andradina, Amparo, Alumínio) — confirmado em 11/ago: chips já existem em `04_Resultados_dos_Codigos/Resultados_Analise_Visual-Assistida_Comparativo_Metodo` (Andradina 6/6 pontos, Amparo ≥3, Alumínio ≥5).
- [ ] Classificar visualmente os chips das 3 cidades de repescagem (fogo real/agrícola/inconclusivo/nuvem-sombra) e somar ao resultado do Eixo 3 (hoje 18 cidades → passa a 21) — fazer direto no Drive/Colab ou anexando as imagens no chat (ver armadilha #8; pedir pro Claude baixar chip por chip via API não funciona bem).
- [ ] "Pente-fino" nos notebooks/scripts mais antigos (revisão geral) — inclui limpar duplicação de células no `06_09` (8 e 9) e decidir sobre o dado simulado (`np.random.normal`) na Figura 1 do `06_10`.
- [ ] Confirmar visualmente no mosaico geral (script `06_31`) o posicionamento de Barra do Turvo/Apiaí/Tupã — dado numérico de base já confirmado OK em 11/ago (Barra do Turvo e Apiaí: realmente sem cluster em 2024 inteiro, poucos focos no INPE; Tupã: 0 focos em agosto/2024 mas tem cluster fora de agosto, sinal fraco real, não bug); falta só validar a renderização no mapa.
- [ ] Etapa "chapa-branca": dashboard Power BI didático (aquecimento para a parte de Engenharia de Software do curso).
- [x] Notas didáticas ("+Texto" Colab) nos 12 notebooks principais — feito, organizado em ordem numérica 06_01–06_12.

## Sessões de origem

Resumo gerado a partir de 3 sessões do terminal (não migram automaticamente para o Claude Code web — por isso este arquivo existe):
- `ad9a2e61` (05/ago) — setup de acesso ao Drive, pipeline completo de ST-DBSCAN+dNBR, todas as rodadas, mapas, IoU/Jaccard.
- `a1f1f194` (07/ago) — Eixo 3 (validação visual), incidente do Drive e recuperação.
- `279cf0ae` (03/ago) — notas didáticas para os 12 notebooks.
