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

## Próximos passos pendentes (conforme última conversa)

- [ ] Fechar Tarefa 3 (comparação MapBiomas Fogo) e escrever a conclusão final (seção 7 do prompt mestre: eficácia do método, onde falha, comparação com MapBiomas).
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
