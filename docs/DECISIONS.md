# Log de decisões técnicas

Registro único de tudo que já foi decidido para o Painel de Queimadas SP,
para não se perder nada antes de passar o projeto para implementação
(Claude Code) ou para quem for revisar depois. Cada entrada tem contexto,
decisão e status. Pendências em aberto ficam na última seção.

---

## 1. Metodologia e confiabilidade

### 1.1 Cadência de cada operação ("tempo real" não é uniforme)
**Contexto:** as três operações do método (ST-DBSCAN, dNBR, IoU/Jaccard)
dependem de fontes com ritmos diferentes, independente da capacidade
computacional do sistema.
**Decisão:**
- Focos de calor (ST-DBSCAN sobre INPE) — atualização diária, cobrindo os
  645 municípios; é a camada mais próxima de "tempo real".
- Leitura de satélite (dNBR) — mensal, mas sempre **completa** para os 645
  municípios a cada rodada (ver seção 2.1). Cadência mensal é do próprio
  dado de satélite (revisita + composição livre de nuvens), não uma
  limitação imposta pelo sistema.
- Comparação/confiabilidade (IoU, Recall, p-valor vs. MapBiomas Fogo) —
  **não pode ser tempo real nem mensal**: depende do calendário de
  publicação de coleções do MapBiomas Fogo, que é anual e com defasagem.
**Status:** Fechado. "Tempo real" no produto se refere à camada
operacional (focos + dNBR); a confiabilidade é comunicada como
retrospectiva por design, nunca prometida como corrente.

### 1.2 Confiabilidade padrão por município, antes do pipeline rodar ao vivo
**Contexto:** para o público-alvo (produtor, brigadista, curioso), a
defasagem da confiabilidade (ver 1.1) não é relevante — mas a interface
precisa mostrar algo.
**Decisão:** município já dentro da amostra validada mostra a
confiabilidade já apurada (Alta/Média/Baixa/Insuficiente) como valor
padrão corrente, "congelado" até a próxima auditoria anual ou expansão de
amostra. Município fora da amostra mostra "não comparado/validado".
**Fonte oficial para casos de indecisão ou falta de dado:**
`Tabela_Final_63_Municipios.xlsx` (Google Drive, pasta
`19_tabela_final_holistica`) — comparação de agosto/2024 contra o
MapBiomas Fogo, 63 municípios (30 originais + 33 novos).
**Status:** Fechado.

### 1.3 Regra de cálculo da confiabilidade (4 níveis)
**Decisão:** com base em Recall (%) e significância (teste de permutação,
999x, p<0,05):
- **Alta** — os dois critérios passam (Recall≥50% **e** p<0,05).
- **Média** — só um dos dois passa.
- **Baixa** — nenhum passa, mas houve agrupamento formado.
- **Insuficiente** — nenhum agrupamento formado no ano (ausência
  estrutural, não falta de confiança).
**Exemplos corretos (conferidos na Tabela Final, para não propagar erro):**
Alta = Ibitinga (recall 83,2%, p=0,003). Média = Pitangueiras (recall
93,8%, p=0,223) e Altinópolis (recall 12,3%, p=0,045). Baixa = Araraquara
(recall 8,5%, p=0,086, com cluster formado). Insuficiente = Guarulhos
(nenhum cluster em todo o histórico 2018–2024).
**Status:** Fechado.

---

## 2. Infraestrutura e automação

### 2.1 Processamento mensal do dNBR — todos os 645 municípios, 2 jobs
**Contexto:** presunção inicial (não verificada) de que a cota do Google
Earth Engine exigiria lotes pequenos (~20 municípios/mês), levando 30+
meses para cobrir o estado. Dado empírico revisado: 63 municípios
processados em ~30–40 min reais.
**Cálculo (regra de três):** 35 min / 63 municípios ≈ 0,556 min/município
→ 645 municípios ≈ 358 min ≈ **~6 horas**.
**Gargalo real identificado:** não é a cota do GEE (nunca verificada com
precisão, mas de sobra face ao uso real) — é o **limite de 6h por job do
GitHub Actions**, que ~6h de execução total encosta perigosamente.
**Decisão:** `process-sentinel-dnbr.yml` processa todos os 645 municípios
todo mês, dividido em **2 jobs paralelos** (~320–323 municípios cada,
~3h por job), com margem de segurança sob o teto de 6h.
**Status:** Fechado, aceito sem ressalvas por Pedro em 25/09/2026.
**Pendência secundária:** a origem exata da cifra "~30 mil minutos" de
cota do GEE citada por Pedro não foi confirmada — mas não afeta a decisão,
pois o uso projetado (~360 min/mês) está muito abaixo de qualquer cota
plausível.

### 2.2 Analytics — Vercel Analytics
**Contexto:** o produto já será hospedado na Vercel; precisava de uma
ferramenta de métricas de uso simples, alinhada ao foco de pesquisa/TCC
(não precisa de rastreamento de marketing) e que não exigisse mais um
fornecedor externo nem banner de consentimento de cookies.
**Decisão:** usar **Vercel Analytics** — nativo da hospedagem já escolhida,
sem cookies, sem coleta de dado pessoal identificável, não exige banner de
consentimento sob a LGPD. Cobre o suficiente para a narrativa de
pesquisa/TCC (visitas, páginas mais vistas, municípios mais consultados).
**Status:** Fechado, 25/09/2026. Reavaliar só se o produto crescer a ponto
de precisar de métricas mais detalhadas (nesse caso, considerar Plausible
ou Umami antes de Google Analytics, para manter o mesmo princípio de
privacidade).

### 2.3 Stack de infraestrutura
**Decisão:** GitHub Actions como orquestrador (repositório público por
ora); Neon para Postgres + PostGIS (preferido a Supabase por suspender só
o compute em inatividade); Cloudflare R2 para rasters; Vercel ou Netlify
para o webapp.

### 2.4 Quatro workflows do GitHub Actions
`ingest-inpe.yml` (diário) · `process-sentinel-dnbr.yml` (mensal, ver 2.1)
· `check-mapbiomas.yml` (mensal, verifica nova coleção) ·
`audit-anual.yml` (manual, 1×/ano, executado por Pedro).

### 2.5 Pipeline automático, controle manual vira auditoria anual
**Decisão:** todo o pipeline roda de forma automática, avançando ano a ano
conforme novos dados ficam disponíveis (janela aberta a partir de 2018,
não mais fixa em 2024). O controle manual antigo (gate de aprovação) virou
uma auditoria anual que pode corrigir dado histórico, registrada
internamente e oculta da interface do usuário final.

---

## 3. Banco de dados

**Decisão:** 5 tabelas em Postgres + PostGIS — `municipios` (dimensão),
`metricas_anuais` (município×ano), `validacao_mapbiomas` (só onde já
comparado ao MapBiomas), `status_processamento` (log automático, não é
mais gate), `auditorias_anuais` (log interno, oculto). Schema completo em
`/pipeline/db/schema.sql`.

**Pontos assumidos por mim e já revisados/aprovados por Pedro (25/09/2026):**
1. Chave primária por **código IBGE** (7 dígitos), não por nome.
2. Coluna `geom` (PostGIS) na tabela `municipios`, pensando no mapa
   interativo — fica vazia até a malha municipal do IBGE ser importada.
3. Status extra `'erro'` em `status_processamento` (além dos 4 já usados
   na interface), para monitoramento técnico de falhas — nunca aparece ao
   usuário final.
4. "Ano ativo" (janela de evolução) implementado como **view derivada**
   (`ano_ativo`, calculada a partir de `auditorias_anuais`), não como uma
   6ª tabela — para manter as 5 tabelas combinadas.
**Status:** Fechado.

---

## 4. Estrutura do repositório

**Decisão:** 8 componentes — `/data`, `/geodata`, `/pipeline`, `/webapp`,
`/api`, `/tests`, `/security`, `/docs`. `/webapp` lê direto da saída do
`/pipeline` (banco + storage), sem passar pela `/api`; a `/api` é separada,
voltada a acesso externo futuro.
**Ponto assumido por mim:** `schema.sql` mora em `/pipeline/db/`, não em
um componente `/db` isolado (os 8 componentes originais não previam essa
pasta, e é o `/pipeline` quem escreve no banco). Revisar se preferir
separar.
**Status:** Fechado (esqueleto de pastas + READMEs entregue em 25/09/2026).

---

## 5. Produto / identidade visual

Decisões de estética, paleta, terminologia e navegação estão registradas
no mockup de identidade visual (artifact HTML separado, fora deste
repositório) — não duplicadas aqui para não haver duas fontes de verdade.
Resumo do que já está fechado: paleta verde/azul (primárias) +
mostarda/terracota (alertas); terminologia em português para o método
("agrupamento de focos de calor + leitura de satélite" no lugar de
"ST-DBSCAN + dNBR" em texto voltado ao público); "Interseção" como
percentual no lugar de "IoU"; páginas institucionais "Como produzimos" e
"Quem somos" já com conteúdo real.

---

## 6. Implementação — bootstrap do software (25/09/2026)

Primeira sessão de código de verdade (Claude Code web). Registro do que foi
implementado e das suposições feitas onde o planejamento não descia ao
nível de coluna/valor exato — sinalizadas para revisão do Pedro, não
decisões fechadas por conta própria.

### 6.1 Fonte dos dados de validação — planilha real, não só os 5 exemplos
**Contexto:** o prompt mestre previa popular o banco com os 63 municípios
só quando Pedro passasse `Tabela_Final_63_Municipios.xlsx` manualmente.
**Decisão:** esta sessão tinha acesso à ferramenta de Google Drive; a
planilha foi localizada e lida diretamente (pasta `19_tabela_final_holistica`,
arquivo `Tabela_Final_63_Municipios.xlsx`). Os 63 municípios foram
carregados com os números reais da planilha (não só os 5 citados como
exemplo em `docs/DECISIONS.md` secao 1.3), incluindo colunas que a planilha
tem e o schema original não previa explicitamente: Área do Município,
Mesorregião, Bioma, Grupo da Amostra (30 originais/33 novos), Área
MapBiomas/dNBR/ST-DBSCAN, CompMB e a validação temporal textual (eventos
diários dentro do mês comparado).
**Status:** Feito. `confiabilidade` foi **calculada** a partir de
Recall/p-valor da própria planilha, aplicando a regra já fechada (seção
1.3) — não foi copiada de nenhuma coluna da planilha (a coluna "Resultado
Positivo?" dela usa um critério mais simples e a própria planilha marca
esse critério como "decisão de conveniência, não confirmada com o
pesquisador"). Os 5 exemplos de conferência da seção 1.3 batem exatamente
com o valor calculado, o que valida a fórmula.
**Caso especial:** Lucélia tem cluster formado mas Área MapBiomas ≈ 0 (a
planilha marca Recall como "N/A"); tratado como recall indisponível (não
como 0%) → confiabilidade Baixa (nenhum critério passa, mas há
agrupamento). Motuca e outros com "recall 100%" arredondado na planilha
foram gravados com a casa decimal real (ex.: 99,5%), não o arredondamento.

### 6.2 Fonte dos códigos IBGE
**Contexto:** `municipios.codigo_ibge` precisa dos 645 códigos oficiais de
7 dígitos. A API oficial do IBGE (`servicodados.ibge.gov.br`) está
bloqueada pela política de rede deste ambiente (egress proxy).
**Decisão:** usado o dataset comunitário
`kelvins/municipios-brasileiros` (GitHub, dados públicos derivados do
IBGE) como fonte dos 645 códigos+nomes de município de SP.
**Status:** Feito, mas **não é a fonte primária oficial** — os códigos dos
municípios citados nominalmente em `docs/DECISIONS.md`/`CONTEXTO_PROJETO.md`
foram conferidos manualmente (Araraquara 3503208, Guarulhos 3518800,
Ibitinga 3519600, Pitangueiras 3539509) e batem com o conhecimento prévio.
Vale uma conferência pontual do Pedro antes de tratar como definitivo para
publicação.

### 6.3 Colunas novas em `municipios` (além de codigo_ibge/geom já decididos)
**Decisão de implementação:** adicionadas `mesorregiao`, `area_km2`,
`bioma` e `grupo_amostra` — todas nullable, preenchidas só para os 63 municípios
da amostra (vêm da própria planilha de validação). Não fazem parte das
"convenções fechadas" do CLAUDE.md; são metadados descritivos, não
critério de confiabilidade.
**Status:** Assumido por mim, pendente de revisão.

### 6.4 Enum de `status_processamento.status`
**Contexto:** `docs/DECISIONS.md` (versão anterior a esta seção, ver ponto
3 da seção 3) já citava "status extra 'erro', além dos 4 já usados na
interface" sem nomear os 4.
**Decisão de implementação:** `pendente`, `processando`, `concluido`,
`desatualizado`, `erro` (o último nunca aparece na interface).
**Status:** Assumido por mim, pendente de confirmação — os nomes exatos
dos 4 primeiros valores não estavam documentados.

### 6.5 View `ano_ativo` — fórmula de fallback
**Contexto:** a view precisa devolver algum ano mesmo antes de qualquer
auditoria anual ter rodado (banco recém-criado).
**Decisão de implementação:** `COALESCE` em cascata — usa o ano da
auditoria mais recente; se não houver nenhuma, usa o ano mais recente com
`validacao_mapbiomas`; se não houver, o mais recente com `metricas_anuais`;
por último, 2018 (início da janela, ver seção 2.5).
**Status:** Assumido por mim, pendente de confirmação — a semântica
operacional exata de "ano ativo" (global vs. por município) não estava
fechada; implementado como global, alinhado ao diagrama de arquitetura
(uma seta única de `audit-anual.yml` para o Neon).

### 6.6 Banco local para desenvolvimento; Neon já existe, aplicado manualmente
**Contexto:** Postgres 16 + PostGIS local no ambiente do Claude Code é
usado pra desenvolvimento/testes desta sessão, controlado por
`DATABASE_URL` (variável de ambiente) — trocar para a connection string do
Neon é o único passo necessário pra migrar, sem mudar código.
**Atualização (25/09/2026):** Pedro criou o projeto Neon (`queimadas_sp`,
região São Paulo/sa-east-1) e aplicou schema+seeds nele manualmente pelo
SQL Editor do Neon (via upload de arquivo, não colar texto — colar
grandes blocos de texto no editor do Neon corta o conteúdo em alguns
casos), porque esta sessão do Claude Code não consegue alcançar o Neon
direto (ver seção 6.9). **Confirmado por contagem:** 645 municípios, 63 na
amostra, confiabilidade Alta=10/Média=25/Baixa=17/Insuficiente=11 — bate
exatamente com o banco local desta sessão.
**Status:** Neon existe, schema aplicado, populado e conferido. Falta
ainda: conectar uma `DATABASE_URL` de produção a uma sessão do Claude Code
(bloqueio de rede, não falta de acesso — ver seção 6.9) e, quando o webapp
for publicado na Vercel, confirmar que ele lê do Neon corretamente.

### 6.7 Acesso ao banco no webapp — biblioteca `postgres`, sem ORM
**Contexto:** `/webapp` precisa ler direto do banco (convenção já fechada),
com PostGIS envolvido.
**Decisão:** usada a biblioteca `postgres` (porsager/postgres) para SQL
direto/parametrizado a partir dos Server Components do Next.js, em vez de
um ORM (Prisma/Drizzle). Mais simples para este estágio e evita gerar
camada extra sobre um schema que ainda pode mudar.
**Status:** Assumido por mim, pendente de revisão — reavaliar se a
complexidade das queries (ex.: agregações espaciais) justificar um ORM
depois.

### 6.8 Restyle visual — implementado (25/09/2026)
**Contexto:** Pedro decidiu migrar a estética pro visual dos diálogos do
Claude, escopo fechado como só restyle (seção 7).
**Decisão:** fundo creme mais quente (`#f7f3ec` claro / `#211d19` escuro),
superfícies (`--surface`) num tom acima do fundo pra dar profundidade tipo
bolha de mensagem, cantos bem arredondados (`rounded-2xl`) nos cards e na
barra de busca, paleta neutra trocada de `zinc` (cinza frio) pra `stone`
(cinza quente) em todo o webapp. Tipografia mono (IBM Plex Mono) deixou de
ser a voz principal da interface — usada agora só em valores numéricos
(código IBGE, ano, recall/interseção/p-valor, células da tabela), não mais
em rótulos/cabeçalhos.
**Cor de ação nova:** criado o token `--color-acento` (argila quente,
`#c17a4e` claro / `#d98f63` escuro) pra botões/links/foco, no lugar do
azul. Deliberadamente diferente do `--color-terracota` (`#c1442d`) já
existente, pra não confundir "ação da interface" com "confiabilidade
baixa" — o terracota continua só no selo de Baixa confiabilidade, sem
mudança de significado.
**O que NÃO mudou:** navegação (busca → lista → detalhe), e as cores
funcionais dos 4 selos de confiabilidade (verde/mostarda/terracota/
neutro) — critério e paleta de significado intactos.
**Status:** Implementado, aguardando o Pedro ver e aprovar/pedir ajuste. O
token `--color-azul` do palette original não é mais usado na interface
(fica só documentado como decisão histórica em `CLAUDE.md`/seção 5, não
removido do código de propósito).

### 6.9 Limitação de rede do sandbox: não alcança o Neon direto
**Contexto:** ao tentar aplicar schema+seeds no Neon direto desta sessão do
Claude Code, a conexão Postgres crua (`psql`) travou (timeout sem erro) e a
alternativa via driver HTTP do Neon (`@neondatabase/serverless`) retornou
403 "Host not in allowlist". A política de rede deste ambiente usa lista de
permissões, e o host do Neon não está nela — nem TCP cru nem a API HTTP.
**Decisão:** em vez de insistir em desbloquear a rede (exigiria achar o
menu de configuração de ambiente, que não foi localizado nesta sessão),
Pedro aplicou schema+seeds manualmente pelo **SQL Editor do próprio
console do Neon** (roda no navegador dele, fora da rede restrita deste
sandbox).
**Importante — isso não afeta a arquitetura real:** GitHub Actions
(runners próprios, rede irrestrita) e o webapp publicado na Vercel vão
alcançar o Neon normalmente. A restrição é só desta sessão interativa do
Claude Code tentando escrever direto no banco de produção — até é uma
fronteira de segurança razoável (agente de código não ter acesso de
escrita direto e automático a um banco de produção).
**Status:** Contornado para esta rodada. Se uma sessão futura do Claude
Code precisar aplicar migração direto no Neon de novo, tentar achar
"Network access" nas configurações do ambiente antes de gastar tempo
depurando timeout de `psql` — ou simplesmente pedir pro Pedro rodar via
SQL Editor do Neon, como desta vez.

### 6.10 Armadilha: `loading.tsx` na raiz quebra o 404 real da rota de município
**Contexto:** ao implementar estados de carregamento (item do
`docs/CHECKLIST.md`), um `app/loading.tsx` na raiz do App Router foi
adicionado pensando em cobrir só a página inicial.
**Problema encontrado:** `loading.tsx` cria um boundary de Suspense que
envolve **toda a sub-árvore de rotas**, não só a rota onde o arquivo está
— isso incluiu `/municipio/[codigoIbge]`. Resultado: a resposta começa a
ser transmitida (streaming) como `200` antes do `notFound()` daquela rota
rodar, e o Next.js **não consegue mais trocar o status para 404** depois
que o streaming já começou (comportamento documentado do próprio Next.js
16, não é bug do projeto). `curl` confirmava `200 OK` numa página que
devia dar 404.
**Decisão:** removido `app/loading.tsx` da raiz. O estado de carregamento
da página inicial agora é um `<Suspense>` local dentro do próprio
`page.tsx`, envolvendo só o componente que consulta o banco (lista de
municípios) — não a rota inteira. `/municipio/[codigoIbge]` não tem
`loading.tsx` próprio de propósito, pra manter o `notFound()` gerando 404
de verdade (importante pra SEO — `docs/CHECKLIST.md` seção SEO).
**Regra pra próximas telas:** nunca usar o arquivo `loading.tsx` numa rota
que (ou cujas rotas-filhas) chamem `notFound()`. Preferir `<Suspense>`
local em volta só do trecho assíncrono.

### 6.11 Triagem dos ~30 notebooks do Colab (Drive) — joio x trigo

**Contexto:** antes de portar qualquer lógica de pesquisa pro `/pipeline`
real, Pedro pediu pra ler todos os notebooks das duas pastas do Drive
("Codigos Auxiliares de Mapeamento e Validacao", 14 arquivos numerados
`06_xx`, e uma segunda pasta com 16 arquivos, prefixo interno `08_xx`)
e separar o que vale a pena reaproveitar do que é exploratório/superado —
"olhar todos, mas não aprofundar demais". As duas pastas somam 30
arquivos; 28 foram lidos (leitura leve: célula markdown + início de cada
célula de código, sem rodar nada), 2 foram deliberadamente pulados.

**Método:** cada notebook foi baixado via Drive API (a maioria grande
demais pra caber inline — foi decodificado de base64 e lido a partir do
arquivo salvo em disco), e resumido por propósito + veredito, sem
transcrever célula por célula.

**Resultado — tabela de triagem:**

**Núcleo do método (referência primária pra portar pro `/pipeline`):**
| Notebook | Papel |
|---|---|
| `06_08_Focos_de_Calor.ipynb` | Ingestão INPE (zips anuais) + IBGE → gera `01_SP_Focos_Master.csv`, a base de tudo. Corresponde ao futuro `ingest-inpe.yml`. |
| `06_11_Aplicacao_ST-DBSCAN_Geral18-24_Pitangueiras` | **Implementação de referência do ST-DBSCAN oficial.** Confirma em código: `eps_space_km=3.0`, `eps_time_days=1.0`, `min_samples=4`, reprojeção UTM 22S (EPSG:31982). Fórmula exata (corrige a descrição simplificada usada até agora neste documento): `dist_st = np.maximum(dist_espacial_km/eps_espacial, dist_temporal_dias/eps_temporal)`, depois `sklearn.DBSCAN(eps=1.0, metric='precomputed')` sobre essa matriz normalizada — ou seja, dois focos só ficam no mesmo agrupamento se **ambas** as razões (espacial e temporal) forem ≤ 1 simultaneamente. Também tem a validação dNBR por evento (buffer 500 m, `rasterstats`) e um teste de robustez variando o buffer. É o template do qual **todas** as rodadas multi-cidade abaixo derivam (dito explicitamente no cabeçalho delas). |
| `08_11Fase4_Rodada6_STDBSCAN_dNBR.ipynb` e `08_12Grupo_Complemento_ST-DBSCAN+dNBR` | Generalização multi-cidade do template do 06_11 (33 e 12 municípios, respectivamente) — mostram como parametrizar por cidade: nome de busca, `min_samples` por cidade, recorte pelo polígono municipal real (não círculo), CRS UTM/SIRGAS2000 calculado dinamicamente pela longitude. |
| `08_02Classificacao_Bioma_Municipios_SP.ipynb` | Utilitário genuinamente reaproveitável: classifica os 645 municípios por bioma via IBGE/geobr. Candidato a virar um script de apoio real no `/pipeline`. |

**Metodologia de validação estatística (portar a lógica, não o código literal):**
| Notebook | Papel |
|---|---|
| `08_09F10_dNBR_clusters_Pitangueiras.ipynb` | Mann-Whitney U + Cliff's delta comparando dNBR dentro vs. fora do agrupamento. Documenta a ressalva do município canavieiro (colheita de cana confunde com cicatriz de queima). |
| `06_09_ST_DBSCAN_dNBR_Validacao_Pitangueiras.ipynb` | Pipeline completo de sensibilidade IoU/Jaccard por combinação buffer×limiar de dNBR — a lógica de cálculo do IoU é referência boa, **mas** usa parâmetros ST-DBSCAN diferentes dos oficiais (1 km / 3 dias / min_samples=3, via `NearestNeighbors` "na mão") e **Landsat 8/9** em vez de Sentinel-2. Parâmetros e satélite aqui estão superados pela versão oficial (ver pendência abaixo). |

**Ferramentas de QA/diagnóstico visual (úteis, mas não fazem parte do pipeline automático):**
`08_00Analise_Imagens_IdPadroes_CORRIGIDO.ipynb`, `08_06Comparativo_Visual_Fase4_Rodada6_33cidades.ipynb` e `08_08Eixo3_Pontes_Gestal.ipynb` — família "Eixo 3": amostragem de pontos na área extra (cluster − MapBiomas) e geração de chips de satélite pra checagem visual humana. Não automatizável por design (é conferência manual). `08_13Mapa_Geral_SP_Mosaico_dNBR_63cidades_v2.ipynb` — mosaico estadual com o dNBR de todas as cidades já processadas; pode inspirar o futuro mapa interativo. `08_07dNBR_testesgerais.ipynb` — além de repetir rodadas já cobertas acima, tem célula de visualização por pixel (4 faixas de severidade: <0,10 sem evidência / 0,10–0,27 fraca / 0,27–0,44 moderada / ≥0,44 forte) e overlay do dNBR sobre a imagem RGB real — boa referência pra uma futura ferramenta de diagnóstico admin.

**Histórico de seleção de municípios (contexto/proveniência da amostra, não é código de pipeline):**
`06_04_Identificacao_Anomalias_Ago_24.ipynb` (+ variante `_COMPLETO`), `06_05_Frentes_Fogo_Continuo.ipynb`, `06_06_Deteccao_MegaIncendios.ipynb`, `06_07_Top20_Agosto24.ipynb`, `06_12_Frentes_Fogo_Continuo_COMPLETO`, `08_01Analise_Vantagem_Temporal.ipynb`, `08_03Comparacao_Frequencia_Temporal_Agosto2024.ipynb`, `08_10Fase4_Ranking_Anomalia_Cerrado.ipynb`, `08_14Rodada6_Ranking_Volume_Cobertura.ipynb`, `08_15Rodadas_Testes_ST-DBSCAN` — todos documentam **como e por que** cada município entrou na amostra de 63 (ranking por volume/anomalia de agosto/2024, por rodada). Vários usam a biblioteca `st_dbscan` (pip) com parâmetros antigos (`eps1=0.05°`, `eps2=1–3 dias`, `min_samples=4–10`) — protótipos iniciais, substituídos pela implementação "na mão" do 06_11. Valioso como histórico/proveniência (útil pra uma nota metodológica), não como código a portar.

**Puramente apresentação (não usar números daqui pra nada real):**
`06_10_Figuras_CIC` — figuras pra pôster de congresso de iniciação científica com dados **simulados** (`np.random`), o próprio notebook avisa que os dados fictícios devem ser substituídos antes de qualquer uso sério.

**Contexto de pesquisa (informam o "Como produzimos", não são pipeline):**
`06_01_Mapeamento_Pitangueiras.ipynb` — protótipo original do dNBR via GEE/Sentinel-2 (círculo fixo de 25 km, coordenadas hardcoded de Pitangueiras) — superado pela versão com polígono municipal real. `06_02_Mapeamento_LandSat_Pitangueiras_Comparativos.ipynb` — teste de robustez comparando Sentinel-2 vs. Landsat 8/9 pro mesmo cálculo de dNBR — confirma que a escolha por Sentinel-2 foi testada contra alternativa, não arbitrária (bom pra citar na página de metodologia). `06_03_Especificacao_Pitangueiras_Ago2024_MapBiomas.ipynb` — análise socioeconômica (série histórica cana-de-açúcar vs. soja) que explica por que Pitangueiras queima tanto; reforça a ressalva do "município canavieiro" já documentada.

**Pulados deliberadamente (não lidos por completo):**
`08_04Comparativo_Fase4_Rodada6_33cidades.ipynb` (~12,1 MB) e
`08_05Comparativo_Oficial_IoUJaccardPixels_CORRIGIDO_v3.ipynb` (~11,1 MB).
Pelos nomes, são os notebooks oficiais de agregação final do IoU/Jaccard
para as 63 cidades — mas os números finais que eles produzem já estão em
`Tabela_Final_63_Municipios.xlsx`, já ingerida em `pipeline/db/seeds/` e
conferidos exatamente contra o banco (Alta=10/Média=25/Baixa=17/
Insuficiente=11). A lógica de cálculo do IoU/Jaccard já está confirmada
nos notebooks menores (06_09, F10). Ler ~23 MB combinados só pra
reconfirmar números que já bateram não parecia bom uso do tempo, dado o
pedido explícito de não aprofundar demais.

**Decisões do Pedro sobre as duas pendências acima (25/09/2026):**

1. **`min_samples` variável por cidade → regra automática, não constante fixa
   nem tabela de exceções hardcoded.** Pedro escolheu explicitamente a
   opção "regra automática": *"um município com área diferente merece
   contagem de forma diferente"*. Ou seja, o driver conceitual é a
   **área do município**, não uma lista fixa de exceções copiada da
   pesquisa original (que não escalaria pros 582 municípios nunca
   estudados de qualquer forma).
   **Nuance a resolver antes de implementar:** o que os notebooks-fonte
   (`08_12`) realmente usaram pra decidir 2 vs. 4 foi o **teto histórico
   de focos** de cada cidade (sinal fraco/pontual), não a área em si —
   ex.: Barra do Chapeu e Iporanga foram pra `min_samples=2`/0 clusters
   por terem pouquíssimo foco detectado, não necessariamente por serem
   grandes em km². **Proposta de fórmula que reconcilia os dois
   ângulos** (a validar com Pedro antes de codar):
   ```
   densidade_historica = teto_historico_focos_ago(município) / area_km2(município)
   min_samples = 2 se densidade_historica < LIMIAR, senão 4
   ```
   **Essa proposta foi checada contra os dados reais e REFUTADA** — ver
   nota de calibração abaixo. Mantida aqui riscada só como registro do
   raciocínio inicial; a fórmula vigente é a revisada logo depois.

   **Calibração empírica (25/09/2026):** extraí do `08_12` os 12 únicos
   casos onde a pesquisa original variou `min_samples` manualmente (os
   outros 51 dos 63 usaram `min_samples=4` fixo, sem exceção — a
   variação só existe nesse grupo específico):

   | Município | focos_ago24 | teto histórico | min_samples usado |
   |---|---|---|---|
   | Ibitinga | 77 | 5 | 4 |
   | Pontal | 53 | 19 | 4 |
   | Barrinha | 40 | 1 | 4 |
   | Areiópolis | 34 | 4 | 4 |
   | Jaú | 25 | 14 | 4 |
   | Rio Claro | 20 | 10 | 4 |
   | Morro Agudo | 21 | **55** | **2** |
   | Viradouro | 1 | 4 | 2 |
   | Terra Roxa | 0 | — | 2 |
   | Tupã | 0 | — | 2 |
   | Barra do Chapéu | 0 | — | 2 |
   | Iporanga | 0 | — | 2 |

   Isso **derruba a hipótese de área**: não há área nenhuma nesses
   números, e Barrinha (teto histórico=1, provavelmente um município
   pequeno) recebeu `min_samples=4` normalmente. O padrão real é outro:
   `min_samples=2` foi usado quando (a) o volume de focos **no próprio
   recorte sendo processado** é baixo demais pra `min_samples=4` ter
   qualquer chance matemática de formar agrupamento (0–1 foco — nesse
   caso quase virou "tentar mesmo assim, sem garantia"), **ou** (b) o
   volume existe mas **não é atípico pra aquele município** (Morro
   Agudo: 21 focos é normal pra quem já teve 55 no histórico — não virou
   `min_samples=4` porque não havia evento anômalo genuíno a validar,
   só ruído de fundo). Ou seja: o driver real não é geográfico, é
   **força do sinal no período analisado, relativa ao próprio histórico
   do município** — dois fatores, não um.

   **Fórmula CONFIRMADA por Pedro (25/09/2026)** — substitui a versão
   "área" acima:
   ```
   anomalo = focos_periodo_atual > teto_historico(município)
   min_samples = 4  se  focos_periodo_atual >= 4  e  anomalo
   min_samples = 2  caso contrário  (inclusive quando focos_periodo_atual == 0)
   ```
   `LIMIAR_MINIMO = 4` (mesmo valor do `min_samples` "padrão" — só
   promove pra 4 quem tem pelo menos 4 focos anômalos no período;
   escolha do Pedro, por simplicidade e coerência com o próprio
   parâmetro do DBSCAN). **Verificação:** essa fórmula reproduz
   corretamente as 12/12 decisões manuais originais da tabela acima
   (inclusive o caso-armadilha do Morro Agudo, que tem focos>=4 mas cai
   em `min_samples=2` por não ser anômalo em relação ao próprio
   histórico).
   **Pendência técnica de implementação:** `teto_historico` é "máximo
   de focos em agosto num dos anos 2018–2023" pro município — hoje só é
   calculado ad hoc dentro de cada notebook, não persistido em
   `metricas_anuais`. O `/pipeline` de produção precisa calcular isso a
   partir do histórico de focos já ingerido (não precisa de coluna nova
   no schema, dá pra derivar em tempo de execução a partir dos anos
   anteriores já processados).
   **Escopo de exposição — decisão explícita do Pedro:** o valor de
   `min_samples` usado (e a razão/fórmula) é informação de
   **relatório final e documentação apenas** — não vira campo visível
   pro usuário final na interface do site, só aparece em
   `docs/DECISIONS.md`/metodologia e no relatório da auditoria anual.
2. **Parâmetros/satélite oficiais — confirmado.** `06_11`/`08_11`/`08_12`
   (Sentinel-2, ST-DBSCAN "na mão" via `sklearn.DBSCAN(metric=
   'precomputed')`, `eps_espacial=3000 m`/`eps_temporal=1 dia`) são a
   versão oficial e final. Tudo que usa a biblioteca `st_dbscan` (pip),
   Landsat, ou `eps1=0.05°/eps2=1–3 dias` (06_09, 06_05, 06_12 e a
   família "histórico de seleção") é exploração/robustez já superada —
   confirmado por Pedro, sem ressalva.

**Status:** triagem concluída (28/30 lidos, 2 pulados com justificativa
acima). As duas pendências foram totalmente resolvidas por Pedro,
incluindo a fórmula final (e validada) de `min_samples` — nada mais em
aberto nesta frente. Próximo passo: portar a lógica do `06_08`
(ingestão) e do `06_11` (ST-DBSCAN + dNBR, com `min_samples` calculado
pela fórmula em vez de constante fixa) pros scripts reais de
`/pipeline`.

### 6.12 Implementação real do `/pipeline` — ingestão + ST-DBSCAN (25/09/2026)

**Contexto:** primeira leva de código de produção, portando o que a
triagem da seção 6.11 identificou como núcleo do método (`06_08`, `06_11`,
`08_11`/`08_12`), já com a fórmula de `min_samples` confirmada.

**Estrutura criada:**
```
pipeline/
  common/db.py            conexao Postgres (DATABASE_URL, mesmo padrao do webapp)
  common/geo.py           fuso UTM/SIRGAS2000, projecao pra metros, uniao de buffers
  common/ibge_malhas.py   poligono do municipio via API do IBGE
  ingest/inpe.py          leitura/cruzamento do CSV do INPE com IBGE
  stdbscan/core.py        ST-DBSCAN oficial + calcular_min_samples
  dnbr/sentinel2.py       calculo do dNBR via Sentinel-2/GEE
  dnbr/validacao.py       severidade espectral por evento (buffer+zonal stats)
  dnbr/constants.py       constantes sem dependencia de earthengine-api
  run_ingest_stdbscan.py  CLI que liga ingestao + ST-DBSCAN, grava em metricas_anuais
tests/pipeline/           34 testes (pytest), ver tabela de cobertura no pipeline/README.md
```

**Decisões tomadas durante a implementação:**

1. **Polígono municipal via API de malhas do IBGE, não via shapefile local.**
   Os notebooks usavam `SP_Municipios_2024.shp` carregado no Drive; esse
   shapefile ainda não foi importado em `/geodata` (`municipios.geom` está
   NULL pra todos). Em vez de bloquear o dNBR nisso, `common/ibge_malhas.py`
   busca o polígono sob demanda em
   `servicodados.ibge.gov.br/api/v3/malhas/municipios/{codigo}` por
   `codigo_ibge` — mesma família de API já usada pra nome de município.
   Quando `/geodata` for importado, dá pra trocar por uma consulta direta à
   coluna `geom` (evita 1 chamada de rede por município por rodada), mas não
   é bloqueante até lá.
2. **`dnbr/constants.py` separado de `dnbr/sentinel2.py`.** `sentinel2.py`
   importa `earthengine-api` (`ee`) no topo do arquivo; `dnbr/validacao.py`
   precisa só da constante `NO_DATA` (e dos limiares de severidade), sem
   precisar de `ee` instalado. Separar evita que testar a validação (que não
   depende de GEE) exija a lib inteira do Earth Engine instalada.
3. **`zonal_stats` recebe `nodata=NO_DATA` (-9999) explicitamente.** Sem
   isso, o pixel sentinela de "sem dado" do raster exportado (ver
   `dnbr/sentinel2.py::preparar_exportacao`) entraria na média/mediana do
   dNBR e distorceria a severidade calculada — descoberto rodando o teste
   com raster sintético, não estava nos notebooks originais (que não tinham
   teste automatizado nenhum).
4. **Datum EPSG:4326 (WGS84) pros focos do INPE, não EPSG:4674
   (SIRGAS2000)** — mesmo que o schema do banco declare SIRGAS2000 como
   padrão do projeto (`schema.sql`), o código real dos notebooks usa
   `crs="EPSG:4326"` pros pontos de foco. Diferença prática é centimétrica
   (irrelevante pro limiar de 3 km do ST-DBSCAN), mas manteve-se fiel à
   fonte validada em vez de "corrigir" silenciosamente pro padrão do schema.

**Validação feita nesta sessão:**
- 34 testes automatizados (`pytest`, `tests/pipeline/`), incluindo a
  fórmula de `min_samples` contra os 12 casos reais (regressão) e
  `dnbr/validacao.py` contra um GeoTIFF sintético gerado no próprio teste.
- **Teste ponta-a-ponta contra o Postgres local de desenvolvimento**
  (mesmo banco da seção 6.6): CSVs sintéticos de 7 anos pra Pitangueiras,
  rodados via `python -m pipeline.run_ingest_stdbscan`, gravaram uma linha
  real em `metricas_anuais` via `INSERT ... ON CONFLICT` (depois apagada,
  pra não sujar o banco de desenvolvimento com dado de teste). Confirma que
  a leitura de CSV, o cálculo do teto histórico, a fórmula de
  `min_samples`, o ST-DBSCAN e a escrita no banco funcionam juntos de
  ponta a ponta — falta só plugar dado real do INPE no lugar do sintético.

**Pendências da ingestão INPE (não confirmadas, `ingest/inpe.py` documenta
inline):**
1. **URL de download.** A pesquisa original usava um arquivo local
   `focos_br_sp_ref_AAAA.csv` baixado manualmente pelo Pedro. A única URL
   pública confirmada nesta sessão (busca na web, domínio do INPE bloqueado
   pro fetch direto neste sandbox — seção 6.9) é
   `dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/anual/Brasil/focos_anual_br_AAAA.csv`
   (Brasil inteiro, produto "todos os satélites"). Não sabemos se "_ref_" no
   nome do arquivo original é o produto "de referência" do INPE (só o
   satélite de referência, historicamente mais estável pra comparar anos
   diferentes) — se for, os números não batem exatamente com o produto
   "todos os satélites" usado aqui, o que descasaria do que foi validado
   academicamente. **Resposta do Pedro (25/09/2026):** o download é manual,
   pelo portal BDQueimadas (filtro de UF+período na tela, exporta CSV pelo
   próprio portal) — não é uma URL fixa programável, então não dá pra saber
   ainda se bate com o produto usado aqui sem mais investigação. **Próximo
   passo concreto:** da próxima vez que o Pedro fizer esse download manual,
   (a) anotar/printar quais filtros exatos ele seleciona (em especial se
   houver um filtro de "satélite" com uma opção tipo "referência"), ou (b)
   abrir a aba Network do navegador durante o export e ver a URL real que o
   botão de download dispara — qualquer uma das duas resolve a dúvida sem
   depender de acesso ao site do INPE (bloqueado neste sandbox).
   **CONFIRMADO COMO ERRADA (25/09/2026):** rodando `ingest-inpe.yml` de
   verdade pela primeira vez (após merge pra `main` e configuração dos
   secrets), a URL falhou com `404 Client Error` pra
   `focos_anual_br_2020.csv` — o padrão `dataserver-coids.inpe.br/.../
   anual/Brasil/focos_anual_br_AAAA.csv` **não existe** (ou não pra esse
   ano) como está escrito. Não é mais só "não confirmado", é "sabidamente
   errado" — bloqueia `ingest-inpe.yml` de verdade agora, não só em teoria.
   O restante do workflow (instalação de dependências incluindo
   `earthengine-api`/`geopandas`/`rasterio`, secret `DATABASE_URL`
   chegando corretamente, cache do GitHub Actions) funcionou sem problema
   nenhum — o erro é isolado a essa URL.
2. **Colunas confirmadas do CSV bruto:** `data_pas`, `municipio`, `lat`,
   `lon` (direto do código de `06_08`). Não confirmamos se existe uma
   coluna de estado/UF utilizável — `ingest/inpe.py` usa se existir
   (`estado`/`uf`/`state`), com fallback pro cruzamento só por nome de
   município (igual ao notebook original) se não existir. Risco do
   fallback: nome de município duplicado em outro estado (o teste
   `test_carregar_focos_sp_cruza_por_nome_e_filtra_estado` cobre esse caso
   quando a coluna existe; sem ela, o risco é real mas do mesmo tamanho do
   notebook original).

**Status:** ingestão INPE + ST-DBSCAN codificados, testados (exceto o
download real) e validados ponta-a-ponta contra banco local. dNBR
codificado fielmente mas não executado (sem rede/credenciais do GEE neste
sandbox). Faltam: resposta do Pedro sobre a URL/produto correto do INPE,
rodar de verdade com dado real (Pedro ou GitHub Actions), portar
`validacao_mapbiomas` (IoU/Jaccard + permutação), e os 4 workflows do
GitHub Actions.

### 6.13 Correção: `metricas_anuais` é o ano inteiro, não agosto (25/09/2026)

**Contexto:** ao preparar o `ingest-inpe.yml` (seção 2.4, diário), percebi
uma inconsistência entre o que já estava fechado na seção 1.1/2.5 ("janela
aberta a partir de 2018", cadência diária, "tempo real" operacional) e o
`run_ingest_stdbscan.py` da seção 6.12, que tinha copiado direto da pesquisa
a comparação **agosto contra agosto** (`MES_REFERENCIA = 8`). Rodando todo
dia, isso deixaria o job sem produzir nada novo relevante 11 meses por ano.

**Decisão do Pedro:** `num_focos_calor`/`num_agrupamentos`/
`area_st_dbscan_km2` de um `(codigo_ibge, ano)` passam a ser o **ano inteiro
corrente** (janeiro até a data do processamento), recalculado do zero (via
`UPSERT`) a cada execução diária — não mais um recorte de agosto. A fórmula
de `min_samples` (seção 6.11/6.12) segue igual, só que `teto_historico` e
"anômalo" agora comparam **total anual contra total anual**, não mais
agosto contra agosto.

**Impacto nos 63 municípios já validados:** os números hoje em
`metricas_anuais` (seed de 2024) continuam sendo os oficiais, aprovados
academicamente com o recorte de agosto — não foram e não devem ser
recalculados por essa mudança. A mudança vale só a partir daqui, pro
pipeline automático rodando em produção. Ou seja: 2024 fica como está
(dado de pesquisa, comparado ao MapBiomas Fogo que também é anual); anos
processados pelo pipeline automático doravante usam a nova definição.

**Código ajustado:** `pipeline/run_ingest_stdbscan.py` —
`calcular_teto_historico` não filtra mais por mês; `processar_municipio`
soma o ano inteiro; `--ano` no CLI agora é opcional (default: ano corrente,
via `date.today().year`), pensado pra rodar sem argumento no cron diário.
Testes atualizados (`tests/pipeline/test_run_ingest_stdbscan.py`) — 35
testes passando no total.

**Status:** Fechado. Próximo passo: `ingest-inpe.yml` (GitHub Actions) roda
`python -m pipeline.run_ingest_stdbscan --pasta-focos ...` diariamente sem
passar `--ano`.

### 6.14 Workflows do GitHub Actions — 2 de 4 prontos, dNBR mensal (25/09/2026)

**Contexto:** com a ingestão INPE + ST-DBSCAN testadas (seção 6.12/6.13),
próximo passo foi escrever os workflows de fato e o script de orquestração
do dNBR que faltava.

**Criados:**
- `.github/workflows/tests.yml` — os 37→42 testes do pipeline a cada
  push/PR em `pipeline/`/`tests/`.
- `.github/workflows/ingest-inpe.yml` — diário, roda
  `run_ingest_stdbscan.py`, com cache dos CSVs anuais do INPE (anos
  passados imutáveis ficam em cache entre execuções; o ano corrente é
  sempre baixado de novo — novo parâmetro `forcar=` em `baixar_focos_ano`).
- `pipeline/run_dnbr.py` — script de orquestração do dNBR pros 645
  municípios, particionados em N grupos (`--grupo`/`--de-grupos`) pra rodar
  em jobs paralelos.
- `.github/workflows/process-sentinel-dnbr.yml` — mensal, 2 jobs paralelos
  via `strategy.matrix` (seção 2.1).

**Decisões novas tomadas ao construir `run_dnbr.py` (não extraídas de
nenhum notebook — assunções documentadas, não confirmadas com o Pedro):**

1. **Janela antes/depois para cadência mensal contínua: mês anterior vs.
   mês corrente.** A pesquisa comparava julho/setembro em torno do evento
   de agosto/2024 (pulando o mês do evento, pra deixar a cicatriz
   estabilizar e evitar fumaça de incêndio ativo na imagem "depois"). Uma
   cadência mensal contínua não tem um "mês do evento" fixo pra pular no
   meio — comparar o mês imediatamente anterior contra o corrente é a
   extensão mais direta pra detecção de mudança contínua, mas é uma escolha
   nova, não validada academicamente da mesma forma que o resto do método.
   Se isso gerar mais falso positivo que o esperado (ex.: fumaça de
   incêndio ainda ativo contaminando a imagem "depois"), vale revisitar.
2. **Cálculo síncrono via `reduceRegion`, sem exportar GeoTIFF pro Drive.**
   Os notebooks exportam raster bruto+colorido pro Google Drive
   (assíncrono, precisa de polling); pra só gravar `area_dnbr_km2` em
   `metricas_anuais`, isso é desnecessário — a área com dNBR acima do
   limiar de evidência espectral mínimo (0,10) é somada direto no servidor
   do Earth Engine (`ee.Image.reduceRegion` com `Reducer.sum()`),
   síncrono, sem precisar baixar nada. Gerar e guardar o GeoTIFF em si
   (pra arquivo/visualização, ex. Cloudflare R2) fica como extensão futura,
   não bloqueia a métrica.
3. **Resiliência do job longo:** cada município grava numa transação curta
   própria (`with get_connection()` por município, não 1 transação pro
   grupo inteiro de ~320) e erros por município são capturados e pulados
   (`try/except` + `continue`) — um job desses roda por horas (seção 2.1);
   sem isso, um município problemático ou uma queda de conexão no meio
   perderia o progresso inteiro do grupo.

**Testado nesta sessão:** só a lógica pura sem GEE (`janela_mes_anterior`,
`dividir_em_grupo`) — 5 testes novos, 42 no total. O cálculo de dNBR em si
não roda (mesma limitação de rede/credenciais do Earth Engine da seção
6.12).

**Status:** `ingest-inpe.yml`, `process-sentinel-dnbr.yml` e `tests.yml`
prontos (dependem de `secrets.DATABASE_URL` e `secrets.GEE_SERVICE_ACCOUNT_KEY`
configurados no repositório, e da pendência da URL do INPE da seção 6.12).
Faltam `check-mapbiomas.yml` e `audit-anual.yml` — precisam dos scripts de
`validacao_mapbiomas` (IoU/Jaccard + permutação, ainda não portado) e de
auditoria anual, respectivamente.

### 6.15 Núcleo estatístico da validação MapBiomas — pronto e testado; orquestração bloqueada em 3 pendências (25/09/2026)

**Contexto:** ao tentar portar `validacao_mapbiomas` (IoU/Jaccard + teste de
permutação + classificação de confiabilidade — a peça que faltava pro
método completo), o notebook oficial dessa etapa
(`Comparativo_Oficial_IoUJaccardPixels_CORRIGIDO_v3.ipynb`) se mostrou
grande demais pro limite de download da ferramenta de Drive desta sessão
(>10 MB, limite rígido da própria ferramenta — não é o mesmo tipo de
limitação de rede da seção 6.9/6.12).

**Criado e testado (`pipeline/validacao/mapbiomas.py`, 12 testes novos —
53 no total):**
- `calcular_iou_recall(cluster_geom, mapbiomas_geom)` — IoU/Jaccard e
  recall padrão (intersecção/união, intersecção/área MapBiomas).
- `permutacao_iou(...)` — teste de permutação (999x por padrão): reposiciona
  a geometria do agrupamento aleatoriamente (posição **e** rotação, área e
  forma preservadas) dentro do polígono do município, recalcula o IoU a
  cada vez, `p_valor = (permutações com IoU aleatório ≥ observado + 1) /
  (total + 1)`. **Reconstrução a partir do padrão da literatura de
  sensoriamento remoto/ecologia de paisagem, não um port do código
  original** — Pedro descreveu a mecânica estatística geral do teste de
  permutação (correta e consistente com essa implementação), mas não a
  mecânica espacial específica do notebook original (o que exatamente é
  reamostrado). Precisa ser confirmada contra o notebook oficial antes de
  qualquer p-valor daqui virar confiabilidade pública de verdade.
- `classificar_confiabilidade(...)` — mesma regra fixa da seção 1.3,
  testada contra os 5 exemplos documentados ali (Ibitinga/Alta,
  Pitangueiras e Altinópolis/Média, Araraquara/Baixa, Guarulhos/Insuficiente).

**Três pendências que travam o script de orquestração (`run_validacao_
mapbiomas.py`, ainda não escrito) e por isso o `check-mapbiomas.yml`:**

1. **Mecânica exata do teste de permutação** (acima) — falta confirmar ou
   corrigir contra o notebook oficial.
2. **Geometria dos agrupamentos não é persistida.** `calcular_iou_recall`/
   `permutacao_iou` precisam da geometria real (polígono) do agrupamento
   ST-DBSCAN e da área queimada do MapBiomas — mas `metricas_anuais` só
   guarda a **área agregada** (`area_st_dbscan_km2`, um número), não a
   geometria. Duas opções, preciso da decisão do Pedro: (a) recalcular a
   geometria do agrupamento sob demanda a partir dos focos brutos toda vez
   que for validar (reprocessa o ST-DBSCAN, mas não precisa mudar o
   schema); (b) persistir a geometria em algum lugar na hora do
   `ingest-inpe.yml` (nova coluna `geometry` em `metricas_anuais` via
   PostGIS, ou GeoJSON em arquivo/`/geodata`/R2) pra reaproveitar depois.
3. **Fonte do raster do MapBiomas Fogo não confirmada.** Os notebooks leem
   a Coleção 4 via Earth Engine, mas não tenho o ID exato do asset público
   do MapBiomas nesta sessão, nem a lógica de decodificação "valor do pixel
   = mês" descrita em `CONTEXTO_PROJETO.md`. Domínio do MapBiomas
   (`brasil.mapbiomas.org`) bloqueado pro fetch direto neste sandbox (mesmo
   padrão da seção 6.9); via busca na web (não confirmado, 2 candidatos
   diferentes encontrados, nenhum verificado contra a fonte primária):
   `projects/mapbiomas-public/assets/brazil/fire/collection4/
   mapbiomas_fire_collection4_monthly_burned_v1` (Coleção 4, mensal — bate
   com o que o CONTEXTO_PROJETO.md descreve) ou
   `projects/mapbiomas-public/assets/brazil/fire/monitor/
   mapbiomas_fire_monthly_burned_v1` ("Fire Monitor", produto diferente,
   mensal desde 2019). O repositório oficial
   (`github.com/mapbiomas/brazil-fire`, pasta `mapbiomas_fire_collections/
   collection_04/`) provavelmente tem o script com o asset exato, mas não
   consegui abrir os arquivos individuais via fetch nesta sessão.

**Status:** núcleo estatístico fechado e testado; orquestração aguardando
decisão do Pedro nos 3 pontos acima.

### 6.16 Os 4 workflows do GitHub Actions estão todos escritos (25/09/2026)

**Contexto:** com as 2 decisões do Pedro sobre a seção 6.15 (geometria
recalculada sob demanda; asset do MapBiomas assumido como o candidato mais
provável), ficou possível terminar `run_validacao_mapbiomas.py` e
`check-mapbiomas.yml` — o 4º e último workflow planejado desde a seção 2.4.

**Decisões tomadas:**
1. **Geometria do agrupamento:** nova função
   `pipeline/stdbscan/core.py::poligono_stdbscan_municipio` — união de
   TODOS os agrupamentos de um município num único polígono (não um por
   evento, como `resumir_eventos`), porque a comparação com o MapBiomas é
   por município/ano, não por evento. Testado, inclusive o caso de dois
   agrupamentos no mesmo lugar em janelas de tempo diferentes (a união
   deduplica a área sobreposta corretamente, não soma ingenuamente).
2. **`check-mapbiomas.yml` roda mensalmente mesmo o MapBiomas sendo anual**
   — não existe forma confirmada de checar antecipadamente se saiu coleção
   nova, então o job roda todo mês e confia no `UPSERT` (idempotente: sem
   coleção nova, reprocessa à toa, mas não corrompe nada). Reavaliar se o
   custo computacional incomodar.
3. **`--grupo`/`--de-grupos` (mesmo mecanismo do dNBR) por precaução** — o
   custo de 999 permutações × ~645 municípios nunca foi medido em escala
   nesta sessão (cada permutação faz rotação+translação+intersecção de
   polígono, potencialmente caro pra geometrias complexas). Refatorado
   `dividir_em_grupo` de `run_dnbr.py` pra `pipeline/common/
   particionamento.py`, reaproveitado pelos dois scripts.
4. **`run_validacao_mapbiomas.py` ganhou `--baixar-faltantes` própria**
   (não depende só do cache do `ingest-inpe.yml`) — evita falha silenciosa
   se os dois workflows rodarem em dias diferentes e o cache não tiver
   sido populado ainda; também falha alto (`SystemExit`) se não achar
   nenhum CSV, em vez de silenciosamente processar zero municípios.

**Testado nesta sessão:** `poligono_stdbscan_municipio` (3 testes) e
`dividir_em_grupo` (movido, mesmos 2 testes) — 58 testes no total. A
orquestração completa (`run_validacao_mapbiomas.py` de ponta a ponta)
continua não executável aqui — herda as pendências não confirmadas do
INPE (seção 6.12) e do MapBiomas/GEE (seção 6.15).

**Status:** os 4 workflows (`ingest-inpe.yml`, `process-sentinel-dnbr.yml`,
`check-mapbiomas.yml`, `tests.yml`) e todo o código de orquestração
correspondente estão escritos. Falta `audit-anual.yml` (fora do escopo
original dos "4 workflows" — é o controle manual da seção 2.5, roda só
1×/ano pelo próprio Pedro) e confirmar as pendências externas (URL do
INPE, asset do MapBiomas) antes de qualquer execução real valer como
resultado científico.

### 6.17 Primeira execução real dos workflows — INPE confirmado quebrado, GEE liberado após 2 ajustes de IAM (26/09/2026)

**Contexto:** com `DATABASE_URL` e `GEE_SERVICE_ACCOUNT_KEY` configurados
como secrets do repositório (Pedro confirmou os dois já presentes), fizemos
o merge da branch de desenvolvimento pra `main` (`workflow_dispatch`/
`schedule` só são disparáveis pela API do GitHub em workflows que já
existem na branch padrão — 404 na tentativa a partir da feature branch) e
disparamos `ingest-inpe.yml` e `process-sentinel-dnbr.yml` pela primeira
vez de verdade.

**`ingest-inpe.yml`:** falhou como esperado — 404 real em
`dataserver-coids.inpe.br/.../focos_anual_br_2020.csv`. A URL da seção 6.12
sai de "presunção não verificada" pra **confirmada errada**. Segue
bloqueado; precisa da investigação manual do Pedro (aba Network do
navegador durante um export real do BDQueimadas).

**`process-sentinel-dnbr.yml`:** falhou 3 vezes seguidas, cada uma expondo
uma camada de permissão diferente do GCP — nenhuma documentada
antecipadamente, porque criar a service account e baixar a chave JSON não
configura sozinho nenhuma delas:
1. `ee.Initialize()` → `403 USER_PROJECT_DENIED` (service account sem
   nenhum papel de IAM no projeto `concrete-bloom-374223`).
   **Corrigido** concedendo o papel **Administrador do Service Usage**
   (mais amplo que o mínimo pedido pelo erro, `serviceusage.
   serviceUsageConsumer` — mas Admin inclui as permissões de Consumer, e
   não há razão pra seguir o mínimo estrito num projeto pessoal de uso
   único).
2. Novo erro, já dentro do `ee.Initialize()`: `403 Permission
   'earthengine.computations.create' denied`. Permissão de uma família de
   IAM totalmente separada (Earth Engine, não Service Usage) — o papel do
   passo 1 não cobria isso. **Corrigido** concedendo papel de administrador
   do Earth Engine (`roles/earthengine.admin` ou equivalente) à mesma
   service account.
3. Com os dois papéis somados, a rodada passou de falhar em segundos (na
   autenticação) pra ficar minutos em execução real — sinal de que está
   processando municípios de verdade. Resultado final (sucesso/falha) ainda
   em apuração no momento em que este parágrafo foi escrito; ver o
   parágrafo seguinte assim que confirmado.

**Recalibração de expectativa de tempo:** a seção 2.1 já projetava ~3h por
job (~322 municípios × ~0,556 min/município) — ou seja, mesmo com todas as
permissões corretas, uma rodada de teste não termina em minutos. Isso não
é uma falha nova, é o comportamento normal e esperado do dimensionamento já
fechado.

**Lição de processo:** rodar o workflow de verdade continua sendo o jeito
mais rápido de descobrir pendências que nenhuma revisão de código teria
achado — cada uma das 2 permissões de IAM só apareceu depois de tentar e
falhar, uma de cada vez.

**Status:** GEE parcialmente desbloqueado (autenticação passa; resultado
do processamento em si ainda não confirmado). INPE continua bloqueado.

### 6.18 INPE não tem produto anual pronto — troca pra download mensal + concatenação (26/09/2026)

**Contexto:** com o dNBR rodando em segundo plano (seção 6.17), usei o
tempo pra investigar o 404 do INPE por pesquisa na web (`dataserver-coids.
inpe.br` está bloqueado pela política de rede deste ambiente — não dava
pra inspecionar o servidor direto, só por busca/cache de terceiros).

**Descoberta:** 3 buscas direcionadas por `"csv/anual"` não trouxeram
nenhum link indexado real — só suposição do buscador. Em contraste, buscas
por `"csv/mensal/Brasil/focos_mensal_br"` trouxeram **9 arquivos reais e
distintos**, indexados publicamente (`focos_mensal_br_202401.csv` até
`_202510.csv`). Conclusão com boa confiança (mas ainda não 100% — não
consegui baixar/inspecionar direto, só via busca): **o dataserver do INPE
não publica um produto anual pronto**, só `10min` → `diario` → `mensal`. A
URL "anual" da seção 6.12 não era só um palpite de ano/nome errado — o
recurso provavelmente não existe.

**Decisão:** `baixar_focos_ano` (pipeline/ingest/inpe.py) agora baixa os 12
CSVs mensais do ano (`URL_FOCOS_MENSAL_BR`,
`csv/mensal/Brasil/focos_mensal_br_AAAAMM.csv`) e concatena localmente
(`_concatenar_csvs_mensais` — mantém só o cabeçalho do primeiro mês,
descarta o dos demais) num arquivo com o mesmo nome de sempre
(`focos_anual_br_{ano}.csv`), pra nenhum outro módulo precisar mudar (só
`baixar_focos_ano` conhece a URL real). Mês ainda não publicado (404 —
esperado no(s) último(s) mês(es) do ano corrente) é pulado, não é erro;
erro só se nenhum mês do ano estiver disponível.

**Não fechado:** ainda não confirmado contra o servidor real (só evidência
de busca) — próxima rodada de `ingest-inpe.yml` confirma ou refuta.

**Testado nesta sessão:** cache/forçar (comportamento preservado, agora
contando 12 requisições por chamada em vez de 1), pular mês com 404,
erro se nenhum mês disponível, e a concatenação em si (dedup de
cabeçalho) — 4 testes novos, 74 no total.

**Status:** Aberto — evidência forte, não confirmação real.

### 6.19 Dataserver do INPE não retém anos antigos — degradação graciosa no download do histórico (26/09/2026)

**Contexto:** re-testei `ingest-inpe.yml` já com a correção da seção 6.18.
Passou da etapa que falhava antes, mas quebrou em outro lugar: `ANOS_HISTORICO
= 6` (seção 6.11/6.12) faz `run_ingest_stdbscan.py` pedir 2020–2026 pra
calcular o teto histórico, e **2020 deu 404 nos 12 meses**, não só no mês
"anual" de antes. Confirmado por execução real (não é suposição de busca
desta vez) — o dataserver não é um arquivo histórico completo, parece ser
uma janela rolante recente (bate com o próprio código já assumir que a
pesquisa original baixava dado histórico manualmente pelo portal
BDQueimadas, não por este dataserver).

**Decisão:** ano histórico que falhar no download vira só um aviso
(`[AVISO] ...`), não derruba a rodada — `calcular_teto_historico` já
tolera menos anos de histórico disponível (inclusive zero, é o caso já
testado dos municípios "Terra_Roxa"/"Tupã" etc., seção 6.11). O ano ALVO
falhar continua fatal — sem ele não há o que processar, e escrever
`num_focos_calor=0` por causa de uma falha de rede seria dado falso (não
"Insuficiente" de verdade). Extraído `baixar_anos_necessarios` pra
`pipeline/ingest/inpe.py` (reaproveitado por `run_ingest_stdbscan.py` e
`run_validacao_mapbiomas.py` — os dois tinham o mesmo padrão de loop sem
try/except), com `forcar_alvo` pra diferenciar os dois usos (ingest diário
força o ano corrente; validação MapBiomas nunca força, todo ano ali já é
fechado).

**Não fechado:** ainda não sabemos até onde o histórico realmente vai (só
sabemos que 2020 não está lá e há evidência de busca de 2024/2025). Com
`ANOS_HISTORICO=6`, é bem possível que boa parte da janela de 6 anos
sempre falhe silenciosamente (virando avisos) — o teto histórico real
pode ficar sistematicamente mais raso do que o pretendido. Não é urgente
corrigir agora (a fórmula tolera isso), mas vale medir quantos anos
realmente vingam na próxima rodada real antes de considerar
`ANOS_HISTORICO=6` uma decisão ainda válida na prática.

**Testado nesta sessão:** `baixar_anos_necessarios` tolera falha em ano
histórico (não para no meio, avisa), propaga falha do ano alvo, e respeita
`forcar_alvo=False` — 3 testes novos, 77 no total.

**Status:** Aberto — degradação graciosa implementada; extensão real da
janela de histórico do INPE ainda desconhecida.

### 6.20 Coluna de data do CSV real do INPE é `data_hora_gmt`, não `data_pas` — mensal confirmado de verdade pra 2024-2026 (26/09/2026)

**Contexto:** 3ª execução real de `ingest-inpe.yml`, já com as correções
das seções 6.18/6.19. Progresso real e duplo:

1. **A degradação graciosa funcionou exatamente como projetado** — o log
   mostra `[AVISO] 2020/2021/2022/2023 indisponível no INPE...` pros 4 anos
   mais antigos, sem derrubar a rodada. Como não apareceu aviso pra
   2024/2025/2026, **os 3 baixaram com sucesso** — isso confirma de
   verdade (não só busca) que o download mensal da seção 6.18 funciona
   contra o servidor real, pelo menos pra esses 3 anos.
2. Mas caiu num erro novo, mais adiante: `KeyError: 'data_pas'` em
   `carregar_focos_sp`. O nome de coluna assumido (copiado do código da
   pesquisa original, que partia de um arquivo já pré-processado) estava
   errado pro CSV bruto do dataserver.

**Descoberta:** busquei o schema real do CSV do INPE (2 fontes
independentes convergiram no mesmo resultado): `id, lat, lon,
data_hora_gmt, satelite, municipio, estado, pais, municipio_id, estado_id,
pais_id, numero_dias_sem_chuva, precipitacao, risco_fogo, bioma, frp`.
`lat`/`lon`/`municipio`/`estado` já estavam certos (por isso o código
chegou até a linha da data sem quebrar antes) — só a coluna de
data/hora é `data_hora_gmt`, não `data_pas`.

**Decisão:** trocado `focos["data_pas"]` por `focos["data_hora_gmt"]` em
`carregar_focos_sp` (pipeline/ingest/inpe.py). Testes atualizados pro nome
de coluna real.

**Testado nesta sessão:** fixtures de teste corrigidas pro nome de coluna
real — 77 testes (mesma contagem, 3 arquivos de teste ajustados, nenhum
teste novo pra essa troca pontual). Não executado de verdade ainda —
próxima rodada confirma.

**Status:** ✅ **Confirmado.** A 4ª execução real de `ingest-inpe.yml`
completou com sucesso de ponta a ponta (~7 min) — 645 municípios
processados e gravados em `metricas_anuais` no Neon de produção. Primeira
rodada de produção bem-sucedida da sessão. Também rodei `audit-anual.yml`
como teste técnico de conectividade (não uma auditoria de conteúdo real) —
sucesso em ~1 min, confirmando escrita em `auditorias_anuais`.

### 6.21 Asset do MapBiomas Fogo revisado — troca de mensal/índice pra anual/nome de banda (26/09/2026)

**Contexto:** com `check-mapbiomas.yml` rodando pela primeira vez (ainda
com o asset candidato original da seção 6.15), usei o tempo de espera pra
pesquisar mais a fundo — `brasil.mapbiomas.org` bloqueado pro fetch direto
neste sandbox (mesma limitação de rede de sempre), mas o GitHub e buscas
gerais não são.

**Dois problemas encontrados na suposição original:**
1. **Contradição interna:** o comentário do código dizia "Coleção 4
   mensal, 40 bandas (1 por ano)" — mas "mensal" e "1 banda por ano" são
   propriedades incompatíveis. Busca indica que o produto "monthly_burned"
   é uma `ee.ImageCollection` (uma imagem por mês), não uma `ee.Image`
   multi-banda como o código assumia (`ee.Image(asset).select([indice])`)
   — teria quebrado com erro de tipo no Earth Engine.
2. A pergunta que `buscar_area_queimada` faz é "queimou em algum mês do
   ano" — uma agregação ANUAL. O produto certo pra essa pergunta é o
   **anual**, não o mensal.

**Decisão:** trocado pro asset `mapbiomas_fire_collection4_annual_burned_
coverage_v1` — segundo a busca, uma `ee.Image` com bandas NOMEADAS
`burned_coverage_{ano}` (não numeradas por índice), valor do pixel = 
código de classe de uso/cobertura MapBiomas que queimou naquele ano (0 =
não queimou). Trocada a seleção de banda por índice (`select([ano-1985])`)
por seleção por nome (`select(f"burned_coverage_{ano}")`) — mais robusto,
e a lógica `pixel > 0 = queimou` continua válida nessa leitura.

**Ainda não fechado:** evidência bem mais forte e internamente consistente
que a tentativa anterior, mas segue sem confirmação contra a fonte
primária (documentação oficial do MapBiomas) ou execução real — é possível
que o nome do asset, o sufixo de versão (`_v1`) ou o nome exato da banda
estejam sutilmente errados. Se `check-mapbiomas.yml` falhar num erro de
"asset not found" ou "band not found", é aqui que olhar primeiro.

**Status:** Aberto — aguardando confirmação por execução real.

### 6.22 Coleção 4 do MapBiomas só vai até 2024 — confirmado por execução real (26/09/2026)

**Contexto:** `check-mapbiomas.yml` (disparado antes da seção 6.21, ainda
com o asset "mensal" original) completou os 2 jobs sem erro fatal — mas
"sem erro fatal" só quer dizer que o script não quebrou no topo; o
try/except por município engoliu o erro real. Log real: **todos** os ~322
municípios de cada grupo falharam com o mesmo erro:

    EEException: Image.select: Invalid band number (40) specified to
    select. Input only contains 40 bands.

**Diagnóstico:** isso não é sobre qual asset usar (mensal vs. anual) — é
mais simples e mais concreto: o asset da Coleção 4 tem exatamente 40
bandas, ou seja, cobre 1985–2024 (`40 - 1 = 39`, índice 0 a 39). O `--ano`
padrão do script é `date.today().year - 1` = 2025 (hoje é 26/09/2026) —
**um ano além do que a Coleção 4 cobre.** Isso confirma, por execução real
e não por suposição, que a Coleção 4 realmente para em 2024 (bate com a
descrição "1985-2024" já usada nos comentários do código, que aparentemente
ninguém tinha conferido contra o comportamento real até agora).

**Decisão:** `ULTIMO_ANO_MAPBIOMAS_COLECAO4 = 2024` como nova constante em
`run_validacao_mapbiomas.py`, usada como valor padrão de `--ano` (no lugar
de `date.today().year - 1`, que pressupõe uma defasagem de 1 ano que não é
real pra essa coleção específica).

**Efeito colateral útil:** como essa falha aconteceu com o asset "mensal"
antigo (pré-seção 6.21), ela é uma evidência A MAIS de que aquele asset
tem 40 bandas numeradas — ou seja, provavelmente É uma `ee.Image`
multi-banda como o código sempre assumiu, não uma `ee.ImageCollection`
como uma busca sugeriu na seção 6.21. Isso não invalida a troca pro asset
anual (a pergunta ainda é uma agregação anual, então o anual continua
sendo o certo), mas reduz a certeza de que o "mensal" estivesse
estruturalmente errado — pode ter sido só o índice de ano, não o asset,
o problema original. Value de aprender rodando: mesmo uma execução que
"falha" prova coisas.

**Ruído secundário observado (não corrigido, baixa prioridade):** alguns
municípios (poucos, espalhados) deram `ConnectTimeout` na API de malhas do
IBGE (`servicodados.ibge.gov.br`) em vez do erro do GEE — parece
flakiness/rate-limit da API do IBGE sob muitas chamadas sequenciais, não
um bug do pipeline. Como o try/except por município já loga e segue, isso
não trava nada — só significa que alguns municípios ficam sem linha em
`validacao_mapbiomas` numa dada rodada, resolvido sozinho na próxima
(idempotente via UPSERT).

**Testado nesta sessão:** só a mudança de valor padrão, sem teste novo
dedicado (não há teste de CLI/argparse pra esse módulo). 77 testes
seguem passando.

**Status:** Aberto — corrigido, ainda não confirmado por nova execução
real (próxima rodada de `check-mapbiomas.yml` testa este fix junto com o
da seção 6.21).

### 6.23 `process-sentinel-dnbr.yml` completou de ponta a ponta — 2ª rodada de produção confirmada (26/09/2026)

**Status:** ✅ **Confirmado por log real** (não só `conclusion`, lição da
seção 6.22). 2h32min (dentro do ~3h esperado, seção 2.1). Os dois jobs
gravaram `area_dnbr_km2` real em `metricas_anuais` pra maioria dos ~645
municípios (ex.: São Simão 89,03 km², Sertãozinho 180,72 km²) — GEE, a
service account, o cálculo síncrono via `reduceRegion` e a escrita no
Neon de produção todos confirmados funcionando de verdade.

**Ruído recorrente confirmado (mesmo padrão da seção 6.22, agora em 2
workflows diferentes):** vários municípios (espalhados, não um padrão
óbvio) falharam com `ConnectTimeout` na API de malhas do IBGE
(`servicodados.ibge.gov.br`, `common/ibge_malhas.py`), não com erro do
GEE. Como aparece tanto em `run_dnbr.py` quanto em
`run_validacao_mapbiomas.py`, é flakiness real da API do IBGE sob muitas
chamadas sequenciais (645 municípios, uma requisição HTTP cada, sem
retry) — não um bug de código. Não corrigido ainda: um retry com backoff
em `buscar_geometria_municipio` resolveria a maior parte, mas como o
UPSERT é idempotente, o município só fica sem dado numa rodada e se
resolve sozinho na próxima (diário pro dNBR/ingest, mensal pro
MapBiomas) — baixa prioridade, mas vale um retry se incomodar.

### 6.24 ⚠️ check-mapbiomas.yml "passou" mas o resultado é cientificamente inválido — geometria do MapBiomas vindo vazia pra todo município (26/09/2026)

**Status: NÃO CONFIAR nos dados gravados nesta rodada.** A 2ª tentativa
(já com os fixes das seções 6.21/6.22) completou sem nenhum erro fatal e
gravou uma linha em `validacao_mapbiomas` pra quase todos os ~600
municípios dos 2 grupos (só os poucos com timeout do IBGE ficaram de
fora). Mas **toda linha, sem exceção, é `Baixa (IoU=0,0%, p=1,0)`** —
inclusive Ibitinga, que a própria seção 1.3 deste documento cita como
exemplo de referência da confiabilidade **Alta** (recall 83,2%, p=0,003).
Isso prova que não é variação real de queimada — é um bug sistemático.

**Diagnóstico até onde dá pra ir sem acesso ao GEE direto:** `.select(f
"burned_coverage_{ano}")` não lançou erro pra nenhum município (então o
asset existe e o nome da banda está certo) — o problema é depois disso,
em `reduceToVectors().getInfo()`, que está voltando **zero features**
mesmo onde certamente há pixel queimado de verdade (Ibitinga, 2024).
`calcular_iou_recall`/`permutacao_iou` parecem estar corretos — o padrão
IoU=0%/p=1,0 uniforme é exatamente o que aconteceria comparando um
cluster real contra uma geometria do MapBiomas sempre vazia (nenhuma
permutação nunca "perde" de uma referência vazia → p=1,0 sempre).

**Hipóteses não testadas (decidi não adivinhar uma 4ª vez sem evidência
melhor — já foram 2 rodadas reais de ~2h+ cada só pra chegar aqui):**
1. `scale=30`/`crs=EPSG:{epsg_metrico}` em `reduceToVectors` pode não
   bater com a projeção nativa do asset (esse trecho não mudou entre as
   seções 6.15→6.21, então pode ser um bug pré-existente nunca antes
   exercitado — a 1ª tentativa nunca chegou tão longe).
2. O asset `annual_burned_coverage_v1` pode ter a banda `burned_coverage_
   2024` existindo mas vazia/placeholder pra esse ano específico (banda
   nomeada corretamente ≠ dado real presente).
3. Algum detalhe de mascaramento (`selfMask()`) ou de valor de pixel que
   só um acesso direto ao GEE (Code Editor, `Inspector`) resolveria.

**Ação recomendada pro Pedro:** abrir o GEE Code Editor, carregar
`projects/mapbiomas-public/assets/brazil/fire/collection4/
mapbiomas_fire_collection4_annual_burned_coverage_v1`, selecionar a banda
`burned_coverage_2024` e inspecionar visualmente sobre Ibitinga — isso
resolve em minutos o que buscas nesta sessão não conseguem confirmar.

**Não apagar os dados gravados** (são idempotentes via UPSERT — a próxima
rodada corrigida sobrescreve sozinha), mas **não usar esses números pra
nada** até resolver isso — nenhuma confiabilidade Alta/Média/Baixa desta
rodada é confiável.

**Status:** Aberto — bug real confirmado, causa raiz ainda não isolada.

### 6.25 Debug ao vivo com o Pedro no GEE Code Editor — geometria do IBGE é a suspeita (26/09/2026)

**Método:** sem acesso direto ao GEE, pedi pro Pedro rodar diagnósticos no
Code Editor (`code.earthengine.google.com`) e me colar o resultado —
4 testes progressivos, cada um eliminando uma hipótese:

1. **Bandas do asset:** `bandNames()` confirma `burned_coverage_1985` até
   `burned_coverage_2024` (40 bandas nomeadas, exatamente como assumido
   na seção 6.21) — asset e nome de banda corretos, confirmado de
   verdade, não só por busca.
2. **Pixels queimados perto de Ibitinga:** `reduceRegion(sum)` num raio de
   15km deu **74.407** (≈67 km² queimados em 2024) — há queimada real e
   significativa ali. Elimina "banda vazia pro ano".
3. **`reduceToVectors` com os mesmos parâmetros do pipeline (scale=30,
   crs=EPSG:31982) sobre um círculo simples de 15km:** **139 polígonos**.
   Funciona. Elimina "bug de projeção/crs".
4. **Mesmo `reduceToVectors`, mas com o limite administrativo REAL de
   Ibitinga (`FAO/GAUL_SIMPLIFIED_500m/2015/level2`, 690 km²) em vez do
   círculo:** **119 polígonos**. Funciona também. Elimina "polígono
   complexo/côncavo quebra o reduceToVectors" como explicação genérica.

**Conclusão:** a única variável que resta, não testada diretamente (não dá
pra buscar a API do IBGE de dentro do GEE Code Editor — sem `fetch()`), é
a fonte específica da geometria: o GeoJSON `qualidade=maxima` da API do
IBGE (`common/ibge_malhas.py`), passado por shapely → `mapping()` →
`ee.Geometry()`, contra o `reduceToVectors` especificamente (não contra
`reduceRegion`, que é o que `run_dnbr.py` usa com a MESMA geometria do
IBGE e funciona — confirmado seção 6.23). Hipótese mais provável:
"qualidade=maxima" tem milhares de vértices, e algo nesse volume/formato
específico faz o `reduceToVectors` (mas não o `reduceRegion`) devolver
zero feições silenciosamente — não confirmado 100% contra a fonte
primária, mas é a explicação que sobra depois de eliminar asset, banda,
projeção e complexidade genérica de polígono.

**Decisão:** `processar_municipio` (run_validacao_mapbiomas.py) simplifica
a geometria do município (`shapely.simplify(0.0001, preserve_topology=
True)`, ~11m de tolerância, bem abaixo dos 30m de pixel do MapBiomas —
não deveria perder precisão que importe) antes de virar `ee.Geometry`,
tanto pro `buscar_area_queimada` quanto pro domínio do teste de
permutação (mesma geometria simplificada nos dois, por consistência).
`run_dnbr.py`/`buscar_geometria_municipio` **não foram tocados** — o
caminho do dNBR já está confirmado funcionando (seção 6.23), sem motivo
pra mexer nele por precaução.

**Testado nesta sessão:** só os 77 testes de sempre (a simplificação em si
não tem teste dedicado — é uma linha de shapely, comportamento padrão da
biblioteca). **Não confirmado ainda por execução real** — próxima rodada
de `check-mapbiomas.yml` é o teste decisivo: se sair confiabilidade
variada (Ibitinga = Alta, outros municípios com valores diferentes), a
hipótese se confirma; se continuar tudo "Baixa/IoU=0%", a causa é outra
e a simplificação não ajudou.

**Status:** Aberto — fix aplicado com base em eliminação de hipóteses,
ainda não confirmado.

### 6.26 Retry com backoff pros timeouts esparsos da API de malhas do IBGE (26/09/2026)

**Contexto:** enquanto a rodada de teste da seção 6.25 rodava, resolvi a
pendência secundária já identificada nas seções 6.22/6.23 — timeouts
espalhados (municípios diferentes a cada rodada, não um padrão fixo) na
API de malhas do IBGE, tanto no dNBR quanto na validação MapBiomas.

**Decisão:** `buscar_geometria_municipio` (`common/ibge_malhas.py`) agora
tenta até 3 vezes (`tentativas=3`, parâmetro configurável) com backoff
exponencial (1s, 2s) antes de desistir e levantar o erro — como o
try/except por município já existia nos dois scripts chamadores, isso só
reduz a frequência de município perdido por rodada, não muda o
comportamento em caso de falha persistente.

**Testado nesta sessão:** sucesso de primeira não tenta de novo, falha
uma vez e tenta de novo com sucesso (backoff correto), falha todas as
tentativas e levanta o último erro — 3 testes novos, 80 no total.

**Status:** Fechado — melhoria de robustez de baixo risco, não depende
de confirmação externa.

### 6.27 Três pendências pequenas do CHECKLIST.md resolvidas — scan, auditoria WCAG e diagnóstico da compressão de raster (26/09/2026)

Enquanto a rodada de teste do `check-mapbiomas.yml` (seção 6.25) rodava,
resolvi as 3 pendências que o Pedro pediu pra matar.

**1. Scan de vulnerabilidade (Dependabot):** criado
`.github/dependabot.yml` (pip/`pipeline`, npm/`webapp`, github-actions,
semanal). **Fechado em 26/09/2026:** Pedro conferiu em Settings → Code
security do repositório (privado — não vem ligado por padrão como em
repositório público) e "Dependency graph"/"Dependabot alerts" já
apareceram ativos (botão "Disable" nos dois, confirmando o estado
ligado) — nada a mudar.

**2. Auditoria de acessibilidade WCAG AA:** rodei de verdade — subi o
webapp local (Postgres do dev estava parado, religado) e usei Playwright
+ `@axe-core/playwright` (instalados como devDependencies) contra as 3
páginas reais (home, detalhe de município usando Altinópolis como
exemplo, 404). Achado: 4 violações, todas de contraste de cor
(`color-contrast`, nível "serious"):
- `text-stone-500` (cinza secundário genérico, usado em ~20 lugares) —
  contraste 4.32, abaixo do mínimo 4.5:1. **Corrigido** — trocado por
  `text-stone-600` em todo o `/webapp` (não é cor protegida pelo
  `CLAUDE.md`, é só um tom de cinza do Tailwind).
- `text-stone-400` sem variante `dark:` numa legenda da página de
  município — mesma categoria, **corrigido** pro mesmo padrão já usado
  em outros lugares do arquivo (`text-stone-600 dark:text-stone-400`).
- **`--color-acento` (#C17A4E) como texto** sobre o fundo creme
  (contraste 3.08) e **como fundo com texto branco** em badges/botões
  (contraste 3.4) — **não corrigido**, é a cor de ação fixada no
  `CLAUDE.md` ("não mudar sem aprovação explícita do Pedro").
- **Selo verde de confiabilidade Alta (#5B9E4D) com texto branco**
  (contraste 3.25) — **não corrigido**, é selo fixo ("não muda nunca").

Confirmado visualmente por screenshot (Playwright) antes e depois — só a
tonalidade do cinza mudou, nada mais quebrou. `npm run lint` sem erros
novos. Removidos os 2 scripts de diagnóstico temporários depois de usar;
mantidas as devDependencies (`playwright`, `@axe-core/playwright`) pra
qualquer auditoria futura — não virou teste automatizado permanente
(não foi pedido, e "auditoria" no checklist é uma atividade pontual, não
uma nova capacidade de CI).

**Pendência real que sobra, precisa de decisão do Pedro:** as 3 cores
fixas (`--color-acento` e o selo verde) falham WCAG AA em combinações
específicas (texto pequeno normal, não negrito). Opções, sem tocar no hex
em si: (a) aceitar o risco — são cores de marca/funcionais, uso
deliberado; (b) aumentar o peso da fonte nesses elementos especificamente
pra abaixo do limiar de "texto grande" do WCAG (regra frouxa, precisa
≥14pt **bold**, hoje é peso normal); (c) usar uma variante mais escura só
nesses usos específicos (texto/fundo), mantendo os hex "oficiais"
intactos em todo resto. Não decidi por nenhuma — é exatamente o tipo de
mudança que o `CLAUDE.md` pede aprovação explícita antes de mexer.

**3. Compressão de raster em escala:** **não é uma pendência pequena** —
é bloqueada. Conferido que não existe nenhum script de compressão
(rasterio+PIL) nem arquivo raster/GeoTIFF neste repositório; a "validação
nos 5 municípios de teste" citada no `CHECKLIST.md` aconteceu na pesquisa
original, fora deste código. O pipeline atual (`run_dnbr.py`) nem exporta
GeoTIFF — só calcula `area_dnbr_km2` direto no servidor do GEE via
`reduceRegion`, sem baixar raster nenhum (o próprio docstring do módulo
já dizia isso). Reescrevi a descrição do item no `CHECKLIST.md` pra não
sugerir que é "só aplicar em escala" quando na real falta construir a
funcionalidade de exportação de raster primeiro.

**Status:** 1 e 2 resolvidos na medida do possível sem decisão externa;
3 diagnosticado e re-escopado corretamente (não é mais uma pendência
"pequena" mal-classificada).

### 6.28 Fix da seção 6.25 NÃO resolveu o bug do MapBiomas — hipótese refutada por execução real (26/09/2026)

**Contexto:** a rodada decisiva do `check-mapbiomas.yml` (run `36244063350`,
commit `c45b802`, o fix de simplificação de geometria da seção 6.25)
terminou o job do grupo 1/2 (323 municípios) depois de ~1h58min.

**Resultado:** os 293 municípios que geraram resultado (sem nenhum
`[ERRO]` de exceção — o restante provavelmente ficou sem agrupamento no
ano, `Insuficiente`, que nem chega a imprimir linha) saíram **100%
idênticos**: `Baixa (IoU=0.0%, p=1.0)` — incluindo Ibitinga (3519600), o
caso de referência que devia sair "Alta". Zero variação, zero exceção.

**Conclusão:** a hipótese da seção 6.25 ("volume/formato de vértices do
GeoJSON `qualidade=maxima` quebra o `reduceToVectors`, `simplify(0.0001)`
resolve") está **refutada** — pelo menos como formulada. Simplificar a
geometria não fez `buscar_area_queimada` parar de devolver polígono
vazio. Como `run_dnbr.py` usa a mesma geometria (sem simplificar) com
`reduceRegion` e funciona (seção 6.23), e o teste ao vivo no Code Editor
confirmou que `reduceToVectors` funciona com um círculo simples E com o
limite FAO/GAUL de Ibitinga nos mesmos parâmetros (seção 6.25), a causa
provável não é "vértices demais" — é algo mais específico da estrutura da
geometria do IBGE (ex.: geometria tecnicamente inválida — auto-interseção,
anel com orientação errada — que `simplify(preserve_topology=True)` não
conserta, porque só preserva a validade que já existia, não repara uma
entrada já inválida).

**Decisão — próximo passo, mais barato que outra rodada cega de 2h:**
1. `processar_municipio` ganha reparo defensivo (`.buffer(0)` quando
   `geom_simplificada.is_valid` for `False` depois do simplify — idioma
   padrão do shapely pra forçar reconstrução de geometria válida) e
   diagnóstico impresso por município (tipo, nº de partes, contagem de
   vértices antes/depois, validade antes/depois, bounding box) — tudo
   local/shapely, sem custo de rede ou GEE.
2. `buscar_area_queimada` passa a imprimir quantas feições o
   `reduceToVectors` devolveu por chamada.
3. Novo argumento `--municipio <codigo_ibge>` em
   `run_validacao_mapbiomas.py`, com input opcional equivalente em
   `check-mapbiomas.yml` (via `env:`, mesmo padrão anti shell-injection do
   `audit-anual.yml` — aproveitado pra corrigir também o input `ano` já
   existente, que hoje interpola direto no `run:`) — permite testar 1
   município só, em minutos, em vez de rodar os 645 (~2h) a cada iteração
   de diagnóstico.

**Testado nesta sessão:** ainda não implementado — é o próximo passo.

**Status:** Aberto — hipótese da seção 6.25 refutada por execução real;
causa raiz ainda não identificada; ciclo de diagnóstico mais barato
planejado, não implementado ainda (superado em prioridade pelo incidente
da seção 6.29, resolvido antes de voltar a este diagnóstico).

### 6.29 Incidente: pipeline automático sobrescreveu a amostra dos 63 municípios validados manualmente — corrigido com coluna `fonte` (26/09/2026)

**Como foi achado:** o Pedro perguntou se dava pra "resolver de forma mais
simples" replicando/escalando proporcionalmente os dados de IoU já
validados dos 63 municípios pros outros 582, em vez de continuar caçando
o bug do `reduceToVectors` (seção 6.25/6.28). Ao avaliar essa pergunta,
percebi um problema mais urgente: os 63 municípios validados
(`pipeline/db/seeds/003_seed_validacao_mapbiomas_2024.sql`, transcrição da
`Tabela_Final_63_Municipios.xlsx`) usam **`ano=2024`** — exatamente o
mesmo `(codigo_ibge, ano)` que `check-mapbiomas.yml` processa
automaticamente todo mês, com `UPSERT` sem nenhuma proteção.

**Confirmado por execução real:** cruzei a lista dos 63 códigos IBGE
contra o log do job "grupo 1/2" da run `36244063350` (a mesma rodada da
seção 6.25/6.28) — **33 dos 63 municípios já validados, incluindo
Ibitinga**, tinham sido reprocessados nesse job e sobrescritos com o
resultado bugado `Baixa (IoU=0,0%, p=1,0)`, apagando o dado real (Ibitinga
era `Alta`, interseção 17,32%, p=0,003). O job "grupo 2/2" já estava
rodando havia mais tempo que o "grupo 1/2" levou pra terminar — ou seja,
muito provavelmente também já tinha processado a maior parte (ou todos)
os 30 municípios validados restantes, mas o `stdout` do job usa buffer
de bloco (sem `PYTHONUNBUFFERED=1`), então o log não mostrou nenhuma
linha de resultado ainda — **não dá pra confirmar pelo log quantos dos 30
restantes já tinham sido escritos no banco antes do cancelamento**
(as escritas no Postgres não usam esse buffer, só o `print` usa).

**Contenção imediata:** cancelei a run `36244063350`
(`cancel_workflow_run`) assim que o padrão ficou claro, pra não seguir
sobrescrevendo o resto da amostra enquanto a causa raiz do bug (seção
6.28) continua em aberto.

**Resposta à pergunta original do Pedro (extrapolar/escalar os 63 pros
outros 582) — rejeitada:** IoU, recall e p-valor são medidas empíricas de
concordância entre duas fontes de satélite independentes pros incêndios
**específicos** de um município num ano específico — não existe relação
matemática que permita derivar o valor de um município a partir do de
outro (não é função de área, população, ou proximidade; dois municípios
vizinhos podem ter regimes de queima completamente diferentes num mesmo
ano). Fazer isso significaria mostrar pro produtor/brigadista de um
município um selo de confiabilidade que não veio de nenhuma comparação
real com aquele município — o oposto do que o produto promete
("comunicar... o quanto dá pra confiar", `CLAUDE.md`). Numa pesquisa
financiada por CNPq, apresentar número extrapolado como se fosse medição
seria grave se descoberto depois. **A solução "mais simples" que já
existe e é honesta** (`docs/DECISIONS.md` seção 1.2, já implementada em
`webapp/src/app/page.tsx`): município fora da amostra mostra "não
comparado/validado" — sem inventar número. Um modelo estatístico
preditivo (regressão usando bioma/cobertura/clima como covariáveis,
treinado nos 63 pontos) até seria uma abordagem legítima, mas é outra
pesquisa em si, exigiria comunicar o resultado como estimativa/modelo
(não como "confiabilidade" nos mesmos 4 níveis fixos da seção 1.3) — não
foi implementado, só registrado aqui como alternativa real caso o Pedro
queira perseguir depois.

**Decisão — correção estrutural, não só pontual:** nova coluna
`validacao_mapbiomas.fonte` (`'manual'` | `'automatico'`, default
`'automatico'`):
1. `schema.sql` — coluna adicionada com `CHECK` e comentário.
2. `generate_seed_sql.py`/`003_seed_validacao_mapbiomas_2024.sql` —
   regenerado com `fonte='manual'` nas 63 linhas; o `ON CONFLICT DO
   UPDATE` do seed força `fonte` de volta pra `'manual'` mesmo se já
   sobrescrito — reaplicar esse arquivo **é** como restaurar a amostra.
3. `run_validacao_mapbiomas.py`:
   - `_garantir_coluna_fonte()` — `ALTER TABLE ... ADD COLUMN IF NOT
     EXISTS`, idempotente, roda no início de `main()`. Neon de produção
     não tem a coluna ainda (schema aplicado manualmente, seção 6.6) —
     essa migração automática resolve isso na próxima execução, sem
     Pedro precisar rodar SQL a mão.
   - `_buscar_municipios(conn, ano)` — agora exclui município com linha
     `fonte='manual'` pro `ano` pedido; a amostra nem entra mais no loop
     automático (economia real de ~10% do tempo de execução, já que
     eram 63 chamadas ao GEE descartadas a cada rodada).
   - `_gravar_validacao` — grava `fonte='automatico'`; guarda extra
     `WHERE validacao_mapbiomas.fonte != 'manual'` no `DO UPDATE` (defesa
     em profundidade — `_buscar_municipios` já devia bastar, isso cobre
     qualquer caminho de código futuro que chame direto).
   - `--restaurar-amostra-manual` — reaplica o seed oficial e sai, sem
     precisar de `--pasta-focos` nem do GEE; exposto em
     `check-mapbiomas.yml` via input `restaurar_amostra_manual` do
     `workflow_dispatch` (passado por `env:`, não interpolado no `run:`
     — aproveitei pra corrigir o input `ano` já existente, que
     interpolava direto, mesmo padrão anti shell-injection do
     `audit-anual.yml`).

**Testado nesta sessão:** 3 testes novos com `conn`/`cursor` mockados —
`_garantir_coluna_fonte` gera o `ALTER TABLE` esperado,
`_buscar_municipios` inclui `fonte = 'manual'` na query,
`restaurar_amostra_validada` executa o SQL do seed sem as linhas de
comentário e com as 63 linhas `'manual'` (83 testes no total agora).
Não testado (precisa do Neon real): a migração e a restauração de fato
rodando contra produção — próximo passo imediato, fora desta sessão de
código.

**Status:** Fechado. Código commitado e mergeado em `main` (`e3d50a5`),
`check-mapbiomas.yml` disparado manualmente com
`restaurar_amostra_manual=true` (run `36252923307`) — os dois jobs do
matrix terminaram com sucesso em ~7s cada (só banco, sem GEE/INPE),
log confirma a mensagem exata de restauração e nenhum erro. Como o
sandbox não alcança o Neon direto pra um SELECT de conferência (seção
6.9), a confirmação é pelo commit bem-sucedido do script (mesmo padrão
rigoroso desta sessão: log real, não só "conclusion: success" — aqui a
mensagem de saída só aparece depois do `with get_connection()` sair sem
exceção, ou seja, depois do commit). Município fora da amostra continua
protegido daqui pra frente: `_buscar_municipios` nunca mais inclui os 63
no loop automático.

### 6.30 Modo debug `--municipio` implementado — volta ao diagnóstico do `reduceToVectors` (26/09/2026)

Com o incidente da seção 6.29 resolvido, voltei ao plano que a seção 6.28
tinha deixado planejado (adiado na hora pra tratar a prioridade maior).

**Implementado em `run_validacao_mapbiomas.py`:**
- `--municipio <codigo_ibge>` — testa 1 município só, ignorando
  `--grupo`/`--de-grupos`; roda em minutos em vez de ~2h por iteração de
  diagnóstico. Pode mirar em qualquer um dos 63 da amostra manual (ex.:
  Ibitinga, pra comparar contra o valor já conhecido) **sem risco** — a
  gravação já é bloqueada por `fonte='manual'` (seção 6.29) de qualquer
  jeito, então o modo debug não precisa nem se preocupar em excluir esses
  códigos.
- `processar_municipio(..., debug=True)` — liga:
  1. Reparo defensivo: `geom_simplificada.buffer(0)` se `is_valid` for
     `False` depois do `simplify()` (idioma padrão do shapely — cobre a
     hipótese revisada de geometria tecnicamente inválida, já que o
     `simplify(preserve_topology=True)` sozinho, testado por execução
     real na seção 6.28, não resolveu). **Esse reparo roda sempre**,
     debug ligado ou não — é o `print` que é condicional, não o fix.
  2. Prints `[DEBUG]`: tipo de geometria, nº de partes (se
     `MultiPolygon`), contagem de vértices antes/depois do simplify,
     validade original/pós-simplify/pós-reparo, bounding box (tudo
     local/shapely, sem custo de rede) — e a área do domínio já dentro
     do GEE (`ee.Geometry.area().getInfo()`, 1 chamada extra só no modo
     debug).
- `buscar_area_queimada(..., debug=True)` (`mapbiomas_gee.py`) — imprime
  quantas feições o `reduceToVectors` devolveu. É o sinal mais direto
  que existe: esse número é exatamente o que fica sempre 0 no bug em
  aberto, então é o que confirma ou refuta qualquer fix sem esperar o
  pipeline inteiro nem olhar `IoU`/`p-valor`.
- Input `municipio` equivalente em `check-mapbiomas.yml`
  (`workflow_dispatch`, via `env:`).

**Testado nesta sessão:** 5 testes novos, todos puros/mockados —
`_contar_vertices` (polígono simples, `MultiPolygon`, anel interno) e
`_buscar_municipio_unico` (encontrado / não encontrado) — 88 testes no
total agora. O comportamento do reparo (`buffer(0)`) e os prints em si só
são verificáveis com geometria real do IBGE + GEE — não dá nesta sessão
(mesma limitação de sempre, seção 6.2/6.9).

**Status:** Código pronto; próximo passo é disparar
`check-mapbiomas.yml` com `municipio=3519600` (Ibitinga) e ler o log
real — se `reduceToVectors` continuar em 0 feições mesmo com o reparo,
os prints de vértices/validade/bounds dão o próximo diagnóstico sem
precisar de outra rodada cega.

### 6.31 Causa raiz real do bug "sempre Baixa/IoU=0%/p=1.0" — não era geometria, era projeção (26/09/2026)

Disparei `check-mapbiomas.yml` com `municipio=3519600` (Ibitinga) — o
modo debug da seção 6.30 terminou em **2min53s** (vs. ~2h de uma rodada
completa) e o log real deu a resposta definitiva:

```
[DEBUG] 3519600: tipo=Polygon partes=1 vértices=581->580 válido=True->True->True bounds=(-49.084, -21.928, -48.643, -21.651)
[DEBUG] 3519600: área do domínio no GEE = 691.1 km²
[DEBUG] reduceToVectors: 117 feições
[DEBUG] 3519600: mapbiomas_geom.area=0.00 km² vazio=False
3519600 (Ibitinga): Baixa (IoU=0.0%, p=1.0)
```

**Isso refuta as seções 6.25/6.28/6.29 por completo:** a geometria do
IBGE nunca teve "milhares de vértices" (Ibitinga tem 581, um número
normal) nem foi tecnicamente inválida (`válido=True` antes E depois do
simplify) — a simplificação e o `.buffer(0)` da seção 6.30 são inócuos
aqui, não fizeram diferença nenhuma. Domínio de 691,1 km² bate quase
exato com os 690 km² do teste ao vivo com FAO/GAUL (seção 6.25). E o mais
decisivo: **`reduceToVectors` sempre funcionou** — 117 feições reais
devolvidas, mesma ordem de grandeza das 119/139 do teste ao vivo no Code
Editor. Nunca foi "reduceToVectors volta 0 feições com a geometria real",
como as seções 6.24/6.25 concluíram.

**A causa raiz de verdade:** `mapbiomas_geom.area=0.00 km² vazio=False` —
uma geometria REAL (não vazia) com área efetivamente zero. Isso só faz
sentido se as coordenadas estiverem na unidade errada. `reduceToVectors`
recebeu `crs=f"EPSG:{epsg_metrico}"`, mas esse parâmetro só define a
**grade de cálculo interna** do Earth Engine — `getInfo()` numa
`FeatureCollection` sempre serializa a geometria de volta em **EPSG:4326**
(convenção GeoJSON/RFC 7946), independente do `crs` pedido. `mapbiomas_gee.py`
convertia essas coordenadas (reais, em graus) direto pra shapely via
`shape()` e tratava como se já estivessem em `epsg_metrico` (metros) —
então uma área real de ~67 km² (as mesmas 74.407 pixels queimados da
seção 6.25) virava algo como 0,005 grau², que dividido por 1.000.000 pra
"converter" pra km² dá um número que arredonda pra 0,00. Com
`mapbiomas_geom` em graus e `cluster_geom` em metros (`epsg_metrico`, via
`poligono_stdbscan_municipio`), os dois nunca podiam ter overlap — não por
falta de queimada real, mas porque as escalas numéricas das coordenadas
são incomparáveis (graus ~dezena vs. metros ~centena de milhar). Isso
também explica por que `run_dnbr.py`/`reduceRegion` sempre funcionou: ele
devolve estatística agregada (número), nunca geometria — esse bug de
serialização só existe pra operações que retornam `FeatureCollection`.
E explica por que os testes ao vivo do Code Editor (seção 6.25) pareciam
"funcionar": só contavam nº de feições devolvidas, nunca checaram se a
área calculada a partir delas batia com a área real esperada.

**Fix:** `buscar_area_queimada` (`mapbiomas_gee.py`) agora reprojeta
explicitamente as feições de EPSG:4326 pra `epsg_metrico`
(`gpd.GeoSeries(geometrias, crs="EPSG:4326").to_crs(epsg_metrico)`) antes
do `unary_union` — mesmo padrão já usado em `_dominio_em_metros`
(`run_validacao_mapbiomas.py`). Comentário desatualizado sobre "milhares
de vértices"/geometria inválida removido de `processar_municipio`; o
`simplify`+`buffer(0)` da seção 6.30 continuam (precaução barata, nunca
foram o problema, não custam nada tirar nem manter).

**Testado nesta sessão:** 88 testes de sempre (o fix em si — reprojeção
de uma `FeatureCollection` real do GEE — só é verificável contra o GEE
real, não localmente).

**CONFIRMADO por execução real** (2ª rodada `--municipio 3519600`, run
`36253970608`, ~2min30s): mesma geometria de entrada de antes
(581→580 vértices, sempre válida) e mesmas 117 feições do
`reduceToVectors` — a diferença é só o fix de reprojeção, e o resultado
mudou completamente:

```
[DEBUG] 3519600: mapbiomas_geom.area=88.40 km² vazio=False   (antes: 0.00 km²)
3519600 (Ibitinga): Média (IoU=10.23%, p=1.0)                (antes: Baixa, IoU=0.0%, p=1.0)
```

Área real, IoU real e diferente de zero — a "confiabilidade" já não é
mais um valor morto uniforme. Não bate exatamente com o valor da pesquisa
original (`Alta`, 17,32%, p=0,003, seção 1.2/6.1) — esperado, já que esta
é uma reconstrução automática independente (ST-DBSCAN recalculado dos
focos brutos, não os mesmos parâmetros/rodada manual), não uma cópia.
`p=1,0` exato chama atenção (esperava-se algum valor intermediário) mas
é uma pendência **já documentada antes desta sessão** (seção 6.15/6.21:
"mecânica do teste de permutação é uma reconstrução não confirmada
contra o notebook oficial") — não confundir com o bug de projeção que
essa seção resolveu; fica pra observar quando a rodada dos 645 mostrar
se `p` varia entre municípios ou fica sempre travado.

**Status:** Fechado — bug de projeção confirmado e corrigido por
execução real. Essa é a primeira vez, depois de 5 tentativas anteriores
(seções 6.21/6.24/6.25/6.28), que uma explicação mecanicamente completa
bateu com a evidência real, em vez de eliminação de hipóteses por falta
de alternativa melhor. Próximo passo: rodar os 645 municípios de verdade
(`check-mapbiomas.yml` sem `municipio`) e confirmar que a confiabilidade
varia de forma plausível entre eles.

### 6.32 As 3 combinações de cor do WCAG resolvidas — negrito + texto grande, hex intactos (26/09/2026)

Pedro escolheu a opção "negrito" das 3 propostas na seção 6.27 pras 3
combinações que sobraram (`--color-acento` como texto e como fundo com
texto branco; selo verde `#5B9E4D` "Alta" com texto branco).

**Mecânica exata (importante não simplificar demais):** WCAG AA permite
3:1 de contraste (em vez de 4.5:1) pra "texto grande" — definido como
≥18pt regular OU **≥14pt negrito** (14pt ≈ 18,67px, não 18px — `text-lg`
do Tailwind, 18px, fica *abaixo* do limiar; usei `text-[19px]` pra ficar
inequivocamente acima). As 3 combinações já tinham contraste entre 3,08 e
3,4 — todas **acima** do mínimo de 3:1, só abaixo do 4,5:1 de texto
normal. Ou seja: só precisava virar "grande", não precisava mudar
nenhuma cor. Trocado `text-sm font-medium`/`text-xs font-medium` (14px/500,
12px/500) por `text-[19px] font-bold` (19px/700) em:
- 3 botões de fundo `bg-acento` + texto branco (`page.tsx` "Buscar",
  `not-found.tsx` "Voltar para a busca", `error.tsx` "Tentar de novo").
- Link "← voltar para a busca" (`municipio/[codigoIbge]/page.tsx`), cor
  `text-acento` sobre o fundo creme.
- Selo de confiabilidade (`CONFIABILIDADE_STYLE`, usado em `page.tsx` e
  `municipio/[codigoIbge]/page.tsx`) — aplicado às **4 variantes**
  (Alta/Média/Baixa/Insuficiente), não só "Alta": o `className` do selo é
  compartilhado entre as 4, deixar só "Alta" maior criaria selos de
  tamanho inconsistente lado a lado na mesma lista, um problema pior que
  o que estava resolvendo.

**Deliberadamente não tocado:** o "Q" do logo (`layout.tsx`, mesmo par de
cor `bg-acento`/branco) — texto de logo/marca tem isenção explícita na
própria especificação do WCAG (Understanding SC 1.4.3: "text that is part
of a logo or brand name has no minimum contrast requirement"), e
aumentá-lo pra 19px negrito bagunçaria o círculo de 28px do avatar sem
necessidade real.

**Testado:** rodei o Playwright + `@axe-core/playwright` de novo (mesmo
setup da seção 6.27) contra as 3 páginas reais (home, Amparo como
exemplo de "Alta", 404) — **0 violações de `color-contrast`** (eram 3
grupos restantes). Confirmado visualmente por screenshot: selos e botões
ficaram maiores/mais firmes, mas continuam com a mesma paleta de cor
exata, nada quebrado no layout. `npm run lint`: mesmos 2 warnings
pré-existentes de sempre, 0 erros novos.

**Status:** Fechado — as 5 violações de contraste do WCAG AA achadas na
seção 6.27 estão todas resolvidas agora (2 pela troca de cinza da seção
6.27, 3 por esta seção). Nenhum hex mudou.

### 6.33 Cor de ação revertida pra azul — Pedro comparou os dois visuais e decidiu (26/09/2026)

**Contexto:** pendência aberta na seção 7 — o mockup "Painel Queimadas SP"
usa azul `#3C7DA6` como cor de ação, mas a seção 6.8 tinha trocado essa
cor pra argila `--color-acento` `#C17A4E` no restyle, no mesmo dia da
publicação do mockup. Não dava pra saber, só pelos dois artefatos, qual
refletia a intenção mais recente do Pedro.

**Decisão:** Pedro revisou os dois visuais lado a lado e escolheu o azul.

**Mudança:** só em `globals.css`, `--color-acento`/`--color-acento-hover` —
claro `#c17a4e`/`#a8663f` → `#3c7da6`/`#316788`; escuro `#d98f63`/`#e6a67d`
→ `#5fa8d9`/`#77b5df`. Não muda nenhuma das cores protegidas pelo
`CLAUDE.md` (selos verde/mostarda/terracota de confiabilidade) nem o
critério de quando cada uma se aplica — `--color-acento` sempre foi
documentado como token separado, de troca livre com aprovação do Pedro.

**Testado:** as 5 páginas reais (home, Pitangueiras, Amparo, Quem somos,
Como produzimos) via Playwright — screenshot conferido visualmente, sem
erro de console novo. Recalculei o contraste WCAG do novo azul à mão
(fórmula de luminância relativa, mesma do axe-core): azul `#3c7da6` sobre
o fundo creme `#f7f3ec` dá **4,06:1**, branco sobre fundo azul dá
**4,49:1** — os dois folgados acima do 3:1 mínimo pra "texto grande" da
seção 6.32, e na prática **melhores** que os 3,08–3,4:1 da argila que
substituíram (mais próximos até do 4,5:1 de texto normal). O
`text-[19px] font-bold` da seção 6.32 continua necessário e válido, só
não ficou mais apertado com a troca de cor — ficou mais folgado.

**Status:** Fechado.

### 6.34 Fonte AvantGarde Std Bold: arquivo do Google Drive corrompido, sem conserto viável (26/09/2026)

**Contexto:** Pedro pediu explicitamente pra aplicar "AvantGardeStd-Bold"
nos títulos (h1) do site e deixou o arquivo
(`FontsFree-Net-ITCAvantGardeStdBold.ttf`) no Google Drive dele.

**O que eu tentei:** carreguei via `next/font/local` (`layout.tsx`),
numa variável CSS própria `--font-display` (`globals.css`, separada de
`--font-sans`, com fallback pro Public Sans) — assim o resto da
tipografia do site não seria afetado, só os `<h1>`. No Chromium
(`document.fonts`, mais confiável que print de tela pra isso), a fonte
sempre reporta status `"error"`, mesmo com o arquivo baixando com sucesso
(200, confirmado por log de rede).

**Diagnóstico:** validação estrutural com `fontTools` (Python) achou
corrupção em quase toda tabela relevante do arquivo — `name` (offset de
string errado), `post` (valor de formato inválido, 27748.0, não existe
esse formato), e `cmap`/`glyf`/`gasp`/`BASE`/`GDEF`/`GPOS`/`GSUB` todos
falham ao parsear (erro típico: tabela truncada, "unpack requires a
buffer of 2 bytes"). Tentei reconstruir só a tabela `name` do zero —
funcionou isoladamente (fontTools passou a ler os metadados certos), mas
não resolveu o carregamento no navegador, porque o problema real está em
outras tabelas, `glyf` incluída (os contornos dos glifos em si, não
metadado). Reconfirmei rodando a mesma validação no arquivo original,
nunca tocado por mim — os mesmos erros já existiam antes de eu mexer.

**Avaliação:** corrupção de `glyf`/`GPOS`/`GSUB`/`GDEF`/`BASE` não é
metadado com "cabeçalho errado" que dá pra reescrever — são os dados reais
de desenho/kerning da fonte, truncados/ilegíveis. Não existe reconstrução
automática sem o arquivo-fonte original íntegro; `fontforge` (ferramenta
padrão pra recuperação mais agressiva) não está disponível neste ambiente
e, dado o padrão do dano (tabelas inteiras truncadas a poucos bytes), é
improvável que ajudasse de qualquer forma. Suspeita adicional: "ITC Avant
Garde Std Bold" é fonte comercial da Monotype/ITC, não gratuita — sites
tipo "FontsFree.net" que a oferecem de graça costumam servir cópia
pirata ou arquivo deliberadamente quebrado ("amostra" inutilizável); o
padrão de dano encontrado é consistente com isso.

**Ação tomada nesta sessão (reversível):** removido `next/font/local` e o
`.ttf` corrompido do repositório — não faz sentido manter uma referência
de código pra uma fonte que nunca carrega (fica "código morto" confuso
pra quem for mexer depois). `--font-display` continua existindo como
variável separada de `--font-sans` (resolve pro Public Sans por enquanto,
igual todo o resto do texto) — é o encaixe já pronto pra receber a fonte
certa assim que houver um arquivo válido, sem precisar reestruturar nada.

**Status:** diagnóstico fechado (causa é o arquivo, não o código);
encaminhamento em aberto — só o Pedro decide como seguir (ver seção 7).

### 6.35 Rodada completa dos 645 municípios do MapBiomas confirmada em produção — run 36254268271 (26/09/2026)

**Contexto:** seção 6.31 deixou como próximo passo "rodar os 645
municípios de verdade e confirmar que a confiabilidade varia de forma
plausível". Disparada às 16:06 UTC, terminou com sucesso nos 2 jobs
paralelos (grupo 1/2 e 2/2) às ~18:05 UTC — ~1h59 no total.

**Resultado — confirmado, a confiabilidade varia de verdade agora,** não é
mais valor morto uniforme. Dos 645 municípios, 582 são elegíveis pro
pipeline automático (645 − 63 da amostra validada manualmente, protegida
desde a seção 6.29); desses, 516 tiveram agrupamento formado em 2024 e
entraram na comparação — os outros 66 tiveram zero agrupamento no ano e
viram "Insuficiente" por outro caminho do pipeline (`metricas_anuais`),
não aparecem nesta lista por design (ver docstring de
`processar_municipio`, não é bug nem lacuna de log). Distribuição real dos
516: **29 Alta, 378 Média, 109 Baixa.**

**Zero erros:** busquei a tag `[ERRO]` (impressa em qualquer exceção não
tratada, `run_validacao_mapbiomas.py` linha ~342) e `Traceback`/`Exception`
nos logs completos dos 2 jobs — nenhuma ocorrência. As únicas linhas fora
do padrão são 6 avisos `[AVISO]` (INPE sem os anos 2018–2023 disponíveis
"ainda" no servidor deles — degradação graciosa já coberta pela seção
6.19; o pipeline seguiu normalmente só com 2024).

**Sobre o valor-p** (pendência separada, seção 6.15/6.21): **também
varia**, não fica travado em 1,0 — valores de 0,001 até 0,987 espalhados
pelos 516 resultados (~81% batem exatamente em 1,0, o resto varia
continuamente). Isso refuta a hipótese de permutação mecanicamente travada;
não confirma, por si só, que a mecânica bate 100% com o notebook oficial
de referência (verificação separada, se um dia for necessária) — só que
produz uma distribuição plausível, não um valor fixo suspeito.

**4 exemplos reais** (código IBGE, confiabilidade, IoU, p-valor):
- Auriflama (3504206): **Alta** — IoU=3,1%, p=0,002 (os dois critérios passam)
- Itaberá (3521705): **Média** — IoU=3,12%, p=0,001 (só o p-valor passa;
  recall deve ficar abaixo de 50%)
- Ipuã (3521309): **Média** — IoU=19,31%, p=1,0 (maior interseção de toda
  a rodada, mas não significativa — mostra que IoU alto sozinho não
  garante Alta)
- Águas de Lindóia (3500501): **Baixa** — IoU=0,0%, p=1,0 (nenhum critério
  passa)

**Status:** Fechado — validação em escala confirma o fix da seção 6.31 de
ponta a ponta. Dados já gravados em produção (Neon).

### 6.36 Fonte de título resolvida — Jost substitui AvantGarde (26/09/2026)

**Contexto:** seção 6.34 deixou 3 opções pro Pedro depois do arquivo do
AvantGarde Std Bold se confirmar corrompido sem conserto. Pedro escolheu a
opção (b): trocar por uma fonte livre de estilo parecido.

**Decisão:** **Jost**, via `next/font/google`, peso 700 (Bold) só —
mesma regra de antes, usada só em `<h1>` (e no `<h3>` de destaque da
página "Quem somos"), nunca em texto corrido. Jost foi preferida à outra
opção cogitada (Poppins) por ser mais diretamente geométrica/da mesma
linhagem de Futura e Avant Garde (inspirada na Kabel, tipeface alemã de
1927) — Poppins também é geométrica, mas com um ar mais "arredondado/UI
genérico" e muito mais onipresente em produtos de tech, menos parecida
com a identidade que o Pedro pediu originalmente.

**Implementação:** `layout.tsx` carrega `Jost({variable: "--font-jost",
weight: "700"})`; `--font-display` (`globals.css`) aponta primeiro pra
`var(--font-jost)`, com Public Sans como fallback (mesmo padrão de antes,
sem risco de flash com serif). Os `<h1>`/`<h3>` que usam `font-display`
trocaram de `font-semibold` (600, herança de quando o fallback era o
único peso disponível) pra `font-bold` (700, o peso exato carregado do
Jost) — combinação exata, sem depender de aproximação do navegador.

**Testado:** `document.fonts` confirma `Jost 700 loaded` (sem erro) nas 4
páginas com `<h1>` (home, município, Quem somos, Como produzimos);
`font-family`/`font-weight` computados batem (`Jost, ...`, `700`);
conferido visualmente por screenshot — geométrica, círculos bem marcados
no "o", nada parecido com o problema do AvantGarde. `npm run lint`: 0
erros (2 warnings de sempre). `npm run build`: build de produção limpo,
8 rotas geradas sem erro.

**Status:** Fechado — pendência da seção 6.34/7 resolvida.

### 6.37 Primeiro deploy real em produção — `workinclaude.vercel.app` (26/09/2026)

**Contexto:** Pedro importou o repositório na Vercel (conta `queimadas_sp`,
projeto `workinclaude`) — monorepo, então **Root Directory = `webapp`** no
import, framework Next.js detectado automaticamente.

**Armadilha evitada antes de clicar em Deploy:** `src/app/sitemap.ts` é
rota estática (`○`, gerada em build) e consulta o Postgres direto
(`SELECT codigo_ibge FROM municipios...`) — sem `DATABASE_URL` configurada
como variável de ambiente do projeto na Vercel, o build falharia inteiro
(`src/lib/db.ts` lança exceção se a variável não existir), não só a rota
em si. Adicionada a mesma connection string do Neon já usada como secret
nos 4 workflows do GitHub Actions.

**Confirmado funcionando em produção** (verificado pelo próprio Pedro,
`https://workinclaude.vercel.app`): home carrega a lista de municípios,
`/sitemap.xml` responde com todas as URLs (prova que o Postgres/Neon
conectou certo no build), `/municipio/3539509` (Pitangueiras) mostra o
mapa dNBR real e os números certos. HTTPS automático (fornecido pela
Vercel, sem configuração extra) — fecha esse item do `CHECKLIST.md`.

**Pendência menor identificada, ainda não corrigida:** `NEXT_PUBLIC_SITE_URL`
não foi configurada — `/sitemap.xml` em produção mostra `https://example.com`
como domínio de cada URL em vez do domínio real. Não quebra nada
(fallback deliberado, seção anterior à publicação), mas fica errado pra
indexação enquanto não for setada. Fix: adicionar
`NEXT_PUBLIC_SITE_URL=https://workinclaude.vercel.app` (ou o domínio
próprio, se/quando houver um) nas variáveis de ambiente do projeto na
Vercel e redeployar.

**Status:** Fechado (deploy funcionando) — a pendência do `SITE_URL` fica
registrada pra não se perder, mas não trava nada.

### 6.38 Restyle "vidro" — portado do mockup pro produto real (26/09/2026)

**Contexto:** Pedro pediu explicitamente "deixar a interface como esse
artefato" (o mockup "Painel Queimadas SP", mesmo da seção 7/6.33), depois
de ver o site real publicado. Reimplementado do zero em cima do design
system existente (Tailwind v4 + tokens CSS já usados) — **não** copiado
o CSS/HTML do mockup, que usa um framework de tema (light-dark via classe)
incompatível com a estrutura Next.js App Router daqui.

**O que entrou:**
- **Header fixo em vidro** (`position: sticky`, formato pílula,
  `backdrop-blur-xl`, tokens novos `--glass`/`--glass-border`/`--glass-hi`).
- **Hero com orbs animados + anéis decorativos** (`components/Hero.tsx`,
  reaproveitado em `/`, `/como-produzimos`, `/quem-somos` — a página de
  município não usa, igual o mockup, que vai direto pro painel de dados).
- **Alternância manual clara/escura** (`components/ThemeToggle.tsx`,
  botão no header) — além do escuro automático via `prefers-color-scheme`
  que já existia. Decisão de implementação: o ícone (sol/lua) é decidido
  só por CSS (`.icon-sol`/`.icon-lua` em `globals.css`), sem estado em
  React — evita tanto o novo lint `react-hooks/set-state-in-effect`
  quanto mismatch de hidratação (server nunca sabe a preferência salva
  no localStorage do visitante). O `<html>` ganhou
  `suppressHydrationWarning` (mesmo padrão da biblioteca `next-themes`):
  o script que aplica o tema salvo roda antes da hidratação de propósito,
  então o React sempre acusaria um mismatch nesse atributo específico,
  mesmo funcionando certo.
- **Barra de comparação** (`BarraComparacao`, dentro da página de
  município) — mesmas 3 áreas que já existiam no banco (método próprio,
  satélite, MapBiomas), só que visualizadas como barras em vez de só
  números em grid.
- **Tira de anos 2018–atual** na página de município, marcando quais anos
  já têm validação registrada — deixa visível, na própria interface, a
  mesma lacuna que motivou o pedido do Pedro de rodar mais anos (seção 7).
- **Tiles de métrica com "?" expansível** (`components/InfoTile.tsx`) —
  explica Recall/Interseção/valor-p/Área MapBiomas em linguagem simples,
  princípio já estabelecido do projeto.
- **Mapa de Pitangueiras recortado** — a imagem original (seção anterior)
  era o gráfico científico completo (eixos, título, barra de cor do
  matplotlib). Pedro achou "feio" nesse formato dentro do card novo.
  Recortada (Pillow) só a área do mapa colorido, mesmos dados reais, sem
  gerar imagem nova — trocado o eixo/legenda do matplotlib por uma barra
  de gradiente CSS compacta abaixo do mapa. Vira pendência separada (seção
  7) gerar esse recorte pros outros municípios via GEE de verdade.

**Deliberadamente não portado do mockup** (motivo em cada item):
- **Grid de "municípios em destaque" com thumbnail** — precisa de imagem
  real por município, mesma pendência do mapa em escala (seção 7).
- **Barra de cobertura em 4 estados** (processado/sem foco/fora da
  janela/não processado) — o banco não distingue essas 4 categorias hoje
  (só "na amostra" + "tem validação ou não"); inventar uma classificação
  fina sem dado real por trás pareceu pior que não ter.
- **Busca com dropdown ao vivo (autocomplete)** — a busca real continua
  no modelo atual (formulário GET, recarrega a lista) em vez de virar um
  componente cliente com filtro instantâneo; muda o modelo de interação,
  não só o visual, e não foi pedido explicitamente.
- **Cor de "ink" levemente esverdeada do mockup** (`#1E2A22` vs. o
  `--foreground` atual `#26221d`) — mantido o neutro quente ("stone, não
  zinc") que o `CLAUDE.md` já fecha; a diferença entre os dois tons é
  pequena demais pra justificar reabrir essa decisão sem pedido explícito.

**Testado:** as 6 páginas reais (home, 2 municípios, Quem somos, Como
produzimos, 404) — visual (screenshot claro/escuro), `document.fonts`,
lint (0 erros) e build de produção (8 rotas, sem erro) limpos.

**Status:** Fechado.

### 6.39 Auditoria WCAG do restyle: modo escuro nunca tinha sido testado — 3 achados reais, todos corrigidos (26/09/2026)

**Contexto:** a auditoria WCAG anterior (seções 6.27/6.32) rodou só em
modo claro. Ao portar o restyle da seção 6.38 (que adiciona um botão de
alternância manual), rodei `axe-core` nas 6 páginas reais **nos dois
temas** pela primeira vez — e achei 3 problemas reais, 2 deles **já
existentes antes desta sessão**, nunca detectados por falta de teste:

1. **`text-stone-600`/`-500`/`-400` (Tailwind) no escuro:** esses tons
   foram calibrados pra fundo claro; contra o `--background`/`--surface`
   escuros (que já existiam desde o restyle de 25/09) davam só ~2:1 de
   contraste — bem abaixo do 4,5:1 mínimo. Passavam despercebidos porque
   ninguém tinha testado o escuro automático (`prefers-color-scheme`)
   com `axe-core` antes. Fix: 2 tokens novos, `--muted` (substitui
   stone-600) e `--faint` (substitui stone-500/400), com valor calibrado
   pra passar em claro **e** escuro, registrados em `@theme inline` como
   `text-muted`/`text-faint`. Removidos os 5 pares manuais
   `dark:text-stone-400` que existiam (redundantes agora, e a maioria das
   ~57 ocorrências de `text-stone-*` no código nem tinha par manual —
   ninguém tinha se dado conta que precisava).
2. **Botões com fundo `bg-acento` e texto branco, no escuro:** só 2,6:1
   de contraste. Causa: `--color-acento` fica mais claro no modo escuro
   de propósito (pra funcionar bem como cor de TEXTO sobre fundo escuro),
   mas os 4 lugares que usam a mesma cor como **fundo de botão** com
   texto branco em cima (`/`, `/404`, `error.tsx`, os círculos "1/2/3" de
   Como produzimos) precisavam do valor mais escuro/saturado de sempre,
   não do valor pensado pra texto. Fix: token novo `--color-acento-botao`
   (fixo nos dois temas, `#3c7da6`) separado de `--color-acento` (que
   continua variando por tema, uso correto pra links/texto). Also
   aplicado ao círculo do logo no header (decorativo, mas ficou mais
   consistente).
3. **Texto pequeno em `text-acento` sobre branco puro (não creme):**
   eyebrow do Hero (11px) e os links de Lattes/LinkedIn em Quem somos
   (14px) — 4,49:1, a régua de texto normal é 4,5:1 (achado novo desta
   sessão, introduzido pelos componentes novos). Fix: token
   `--color-acento-texto`, mesma cor levemente mais escura
   (`#38759c`, 4,74–5,01:1) só pra esses casos de texto pequeno/peso
   normal — segue o mesmo princípio da seção 6.32 (menor mudança
   possível), mas aqui o texto é pequeno demais pra usar a saída
   "negrito + grande" que resolveu os casos anteriores.

**Testado:** `axe-core` (`wcag2a`+`wcag2aa`) nas 6 páginas reais × 2 temas
= 12 combinações, **0 violações em todas**. `npm run lint`: 0 erros (2
warnings de sempre). `npm run build`: limpo.

**Status:** Fechado — cobertura de WCAG agora inclui os dois temas, não
só o claro.

### 6.40 Miniatura dNBR real pros 645 municípios — arquitetura implementada, falta só o Pedro criar a conta R2 (26/09/2026)

**Contexto:** Pedro pediu urgência no mapa dNBR pra todos os 645
municípios (não só Pitangueiras) e reclamou do estilo "gráfico
científico" da imagem existente. Escolhido como prioridade #1 entre 3
pedidos concorrentes da mesma mensagem (o próprio Pedro confirmou via
pergunta direta).

**Descoberta que simplificou tudo:** `pipeline/dnbr/sentinel2.py::preparar_exportacao`
**já existia** desde a seção 6.11 (portado de notebook) e **já produzia**
a imagem colorida certa (`dnbr.visualize(min=0.1, max=0.7,
palette=["green","yellow","orange","red","black"])`) — só nunca tinha
sido chamada em produção (`run_dnbr.py` só usava o raster bruto pra
`reduceRegion`). Não precisou desenhar paleta nenhuma do zero.

**Decisão de mecanismo:** `ee.Image.getThumbURL()` em vez de exportar
GeoTIFF completo — pega a MESMA imagem colorida que a chamada de área já
calcula (nenhum custo extra de quota do GEE em recomputar Sentinel-2),
renderiza um PNG leve (800px, `DIMENSAO_MINIATURA_PX`) direto no servidor
do Earth Engine. Muito mais barato que a rota "exportar raster" que o
`CHECKLIST.md` já descrevia como não-trivial.

**Decisão de armazenamento:** Cloudflare R2 (já cogitado no
`CHECKLIST.md` pra isso), **não** Vercel Blob — apesar do Vercel Blob ter
zero fricção de conta nova (Pedro já tem Vercel), a API do R2 é
compatível com S3 (`boto3`, biblioteca extremamente madura e bem
documentada) — mais confiança de escrever a integração certa de primeira
do que a API própria do Vercel Blob, que eu conhecia com menos certeza.
Pipeline baixa o PNG do `getThumbURL` (`requests.get`) e sobe pro bucket
via `boto3` — endpoint `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
path `dnbr/{codigo_ibge}-{ano}-{mes:02d}.png`.

**Implementado:**
- `metricas_anuais.dnbr_imagem_url` (coluna nova, `schema.sql` +
  migração idempotente `_garantir_coluna_imagem` em `run_dnbr.py`, mesmo
  padrão de `_garantir_coluna_fonte`).
- `run_dnbr.py`: `processar_municipio` agora devolve `(area_km2, imagem_url)`;
  gera a miniatura só se `R2_ACCESS_KEY_ID` estiver no ambiente
  (`_r2_configurado()`) — **sem os secrets, o pipeline roda exatamente
  igual a antes, só sem imagem** (nunca bloqueia `area_dnbr_km2`, o dado
  principal). Falha na miniatura vira `[AVISO]`, não `[ERRO]`.
  `ON CONFLICT ... DO UPDATE` usa `COALESCE` pra nunca apagar uma URL já
  gravada com uma rodada que rodou sem R2 configurado.
- `.github/workflows/process-sentinel-dnbr.yml`: 5 secrets novos
  (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`,
  `R2_BUCKET_NAME`, `R2_PUBLIC_URL_BASE`) passados como env, todos
  opcionais.
- `webapp`: `MetricasAnuais.dnbrImagemUrl` (tipo + query), e a página de
  município troca a regra hardcoded `CODIGO_IBGE_COM_MAPA_REAL` por uma
  prioridade real: `dnbr_imagem_url` do banco → fallback local (só
  Pitangueiras, legado) → aviso de indisponível. O fallback local some
  sozinho assim que o pipeline gerar uma imagem de verdade pra
  Pitangueiras. Trocado `next/image` por `<img>` simples nessa imagem
  especificamente — o domínio do R2 só existe depois que o Pedro criar o
  bucket, e `next/image` exige o domínio pré-cadastrado em
  `next.config.ts`; `<img>` evita essa dependência de ordem.

**Testado:** 3 testes novos pra `_r2_configurado` (91 testes agora no
pipeline). No `webapp`, testado manualmente contra o Postgres local: (1)
sem `dnbr_imagem_url`, Pitangueiras cai no fallback legado e outros
municípios mostram o aviso; (2) com uma URL de teste gravada na linha de
Pitangueiras/2024, a página passa a usar exatamente essa URL; (3)
revertido, volta ao estado (1) — as 3 combinações de prioridade
confirmadas. `npm run lint`/`build` limpos. **O caminho do GEE
(`getThumbURL` + upload R2) não é executável nesta sessão** — mesma
limitação de sempre (rede/credenciais), precisa de execução real em CI.

**Pendência que só o Pedro resolve:** criar a conta/bucket R2 e os 5
secrets no GitHub — sem isso, `_r2_configurado()` fica `False` pra
sempre e o pipeline roda igual a antes (sem quebrar, só sem miniatura
nova). Passo a passo fica pro chat, não pra este documento.

**Status:** Arquitetura e código fechados; ativação em produção
bloqueada só pelo setup externo do Pedro.

### 6.41 R2 ativado pelo Pedro — 1ª tentativa real achou e corrigiu 2 bugs de verdade (26/09/2026)

**Contexto:** Pedro criou a conta/bucket R2 (`queimadas-sp-dnbr`) e os 5
secrets no mesmo dia da seção 6.40. Antes de confiar direto numa rodada
de ~2h nos 645 municípios, adicionei `--municipio` em `run_dnbr.py`
(mesmo padrão de `run_validacao_mapbiomas.py` seção 6.30) — decisão que
se pagou na primeira tentativa.

**1ª rodada real** (`--municipio 3539509`, run `36272777892`, disparada
antes mesmo do Pedro terminar de configurar o R2): confirmou que a
migração `_garantir_coluna_imagem` rodou certo em produção (armadilha
evitada: o código do `webapp` já esperava a coluna nova assim que foi
pro `main`, antes do pipeline rodar de novo pra criá-la — corrigido na
hora disparando esse mesmo workflow como hotfix).

**2ª rodada real** (`--municipio 3539509` de novo, run `36274763695`,
já com os 5 secrets do Pedro configurados) — **achou um bug de verdade**:
`ValueError: Invalid endpoint: https://***.r2.cloudflarestorage.com`. O
resto funcionou perfeito (dNBR calculado, `area_dnbr_km2=115,82`,
`getThumbURL` funcionou, PNG de 179KB baixado) — só a subida pro R2
falhou. **Hipótese 1 (refutada depois):** `R2_ACCOUNT_ID` colado com a
URL do endpoint inteira — `_endpoint_r2()` v1 tirava `https://`/`http://`
e `.r2.cloudflarestorage.com` se já vierem inclusos.

**3ª rodada real** (run `36274997084`, já com o fix da hipótese 1) —
**mesmo erro exato**, byte a byte. Hipótese 1 estava errada.

**4ª rodada real** (run `36275160292`, com `_diagnostico_seguro()` novo —
imprime só metadados do secret, nunca o valor, pra não vazar credencial
em log): revelou que `R2_ACCOUNT_ID` bruto tem **53 caracteres, sem
espaço interno**, e o `.strip()` não mudou nada — não é a URL inteira
(que teria "http" no começo) nem tem espaço sobrando. **Hipótese 2:** o
ID de verdade (32 hex) está colado junto com texto extra da própria UI
da Cloudflare. Fix: `_endpoint_r2()` v2 usa regex (`[0-9a-f]{32}`) pra
extrair o ID de dentro do que foi colado, não importa o que mais esteja
junto.

**5ª rodada real** (run `36275320666`, com a v2) — **hipótese 2 também
errada**: a regex não achou nenhum trecho de 32 caracteres hex em lugar
nenhum dos 53 caracteres colados. Ou seja, o valor colado provavelmente
não é o Account ID de jeito nenhum — é outro campo (token de API, um
UUID com hífen que quebra a sequência hex contígua, etc.). Pedido pro
Pedro conferir de novo, direto na página R2 Object Storage → Overview
(não dentro de um bucket específico), o campo rotulado exatamente
"Account ID" (32 caracteres hex, sem hífen, sem "https://").

**Por que valeu a pena o `--municipio`:** cada uma dessas 4 rodadas de
descoberta levou ~15 segundos a ~1 minuto. Sem o modo debug, cada
tentativa de diagnóstico custaria uma rodada completa de ~2h nos 645
municípios — 4 rodadas seriam ~8h em vez de ~4 minutos. Mesma lição da
seção 6.30 (MapBiomas).

**Testes:** 96 no pipeline agora (`test_endpoint_r2_normaliza_account_id`
parametrizado, incluindo o caso "ID junto com texto extra";
`test_endpoint_r2_sem_id_valido_da_erro_claro` — o `ValueError` agora diz
claramente "não parece conter um account id válido" em vez de deixar o
boto3 falhar com uma mensagem genérica).

**6ª rodada real** (run `36276029598`, depois do Pedro reconferir e
regravar o secret): **sucesso de ponta a ponta.** Diagnóstico confirmou
`R2_ACCOUNT_ID` agora com exatos 32 caracteres — era mesmo campo errado
antes, como a 5ª rodada indicava. Log real:
```
[DEBUG] 3539509: subiu pro R2 -> .../dnbr/3539509-2026-09.png
3539509 (Pitangueiras): area_dnbr_km2=115.82 imagem=.../dnbr/3539509-2026-09.png
```
`metricas_anuais.dnbr_imagem_url` gravado com a URL real pela primeira
vez em produção.

**Status:** Fechado — caminho GEE → R2 → banco confirmado funcionando de
ponta a ponta com dado real. Próximo passo (não feito ainda, decisão do
Pedro): liberar a rodada completa dos 645 municípios (sem `--municipio`)
pra popular `dnbr_imagem_url` em escala — cada rodada mensal normal
(`process-sentinel-dnbr.yml` no cron do dia 1) já vai fazer isso
automaticamente a partir de agora, então nem precisa disparar manual se
não houver pressa.

### 6.42 Backfill 2025 (ST-DBSCAN) e 1ª rodada real de dNBR em produção pros 645 disparados — dNBR 2025 adiado por decisão do Pedro (27/09/2026)

**Contexto:** início da sessão SOFTWARE 2 (continuação linear da SOFTWARE).
Pedro pediu pra tocar a fila já confirmada na seção 7: "Rodar ST-DBSCAN +
dNBR pros 645 sem confiabilidade, 2025–2026".

**Achado antes de disparar qualquer coisa (leitura direta do código, não
suposição):** `run_dnbr.py::janela_mes_anterior(date.today())` calcula a
janela Sentinel-2 "antes/depois" sempre a partir da data real de execução
— nunca do `--ano` passado (que só rotula a linha gravada em
`metricas_anuais`). Rodar `--ano 2025` hoje gravaria o dNBR de **agora**
(set/2026) rotulado como se fosse de 2025 — dado cientificamente errado,
não um "não disponível" honesto. Diferente do ST-DBSCAN
(`run_ingest_stdbscan.py`), que processa o ano pedido de verdade via os
CSVs históricos do INPE (`--ano` já existia desde a seção 6.13).

**Decisão do Pedro:** pular dNBR pra 2025 por enquanto —
`area_dnbr_km2`/`dnbr_imagem_url` ficam `NULL` nesse ano, só ST-DBSCAN
roda (`num_focos_calor`, `num_agrupamentos`, `area_st_dbscan_km2`).
Honesto sobre o que não foi medido, sem risco de gravar dado incorreto
(mesmo princípio da seção 6.29: não inventar/deslocar número pra parecer
completo). Se um dia for necessário medir dNBR de 2025 retroativamente,
precisa de um parâmetro novo de janela fixa (mês "antes"/"depois"
específicos daquele ano, tipo a pesquisa fez pra agosto/2024) — não
implementado.

**Segundo achado:** `ingest-inpe.yml` nunca expôs `--ano` via
`workflow_dispatch` (só o cron diário, sempre ano corrente). Adicionado o
input `ano` (opcional, `env:` em vez de interpolar direto no `run:` —
mesmo padrão anti shell-injection do input `municipio` em
`process-sentinel-dnbr.yml`, seção 6.28/6.30), sem mudar o comportamento
padrão do cron (sem input, roda exatamente como antes).

**Autorização:** Pedro aprovou mesclar esse commit direto pra `main`
(fast-forward de 1 commit só, `c3298b5`→`172c1b7`) — necessário porque o
GitHub só reconhece inputs de `workflow_dispatch` declarados na cópia do
arquivo já presente na branch padrão (mesma trava documentada na seção
6.17, agora confirmada de novo numa sessão nova).

**Disparado (`workflow_dispatch` via API, ambos `in_progress` no momento
em que esta seção foi escrita):**
- `process-sentinel-dnbr.yml` sem `--municipio` (run `36283297358`) — 1ª
  rodada de **produção real** (não debug) pros 645 municípios inteiros,
  ano 2026 (default, corrente). 2 jobs paralelos, ~2-3h cada (seção 2.1).
- `ingest-inpe.yml` com `ano=2025` (run `36283427897`) — backfill
  ST-DBSCAN pros 645, ano 2025 (janela histórica completa: CSVs
  2019–2025, mesmo `ANOS_HISTORICO=6` de sempre).

**Status:** Aberto — ambos disparados, confirmação de sucesso real (não
só `conclusion`, lição da seção 6.22) fica pro próximo check desta sessão.
ST-DBSCAN 2026 não precisou de ação: já mantido corrente pelo cron diário
existente.

### 6.43 Consulta sob demanda — visitante escolhe município+ano+mês e o método roda ao vivo (27/09/2026)

**Contexto:** Pedro pediu uma funcionalidade nova, bem maior que um ajuste
de tela: o visitante escolhe município + ano (2018–2026, "com
limitações") + mês, e o sistema roda ST-DBSCAN + dNBR **na hora**, só pra
esse recorte — diferente de tudo que existia até aqui (`/webapp` só lia
resultado pré-calculado pelo pipeline em lote). Duas decisões de
arquitetura, ambas confirmadas pelo Pedro antes de codar:

1. **Onde o cálculo roda:** GitHub Actions (`workflow_dispatch`), não um
   serviço dedicado novo (Cloud Run etc.) — reaproveita 100% do
   `/pipeline` Python e dos secrets já configurados, ao custo de ~1-4min
   de latência por consulta (fila+startup do runner) em vez de resposta
   instantânea.
2. **Faixa de anos:** lançado já pra 2024–2026 (ST-DBSCAN via INPE
   confirmado funcionando nesses anos, seção 6.18–6.20); 2018–2023 mostra
   "histórico ainda não integrado" em vez de travar tudo até o
   BDQueimadas ser resolvido (pendência separada, seção 7).

**Achado técnico antes de codar, que mudou o escopo:** `run_dnbr.py`
calculava a janela Sentinel-2 sempre a partir de `date.today()` — rodar
pra um mês passado gravaria o dNBR de **hoje** rotulado como se fosse
daquele mês antigo (dado errado, não "indisponível"). ST-DBSCAN não tinha
esse problema (já processa o ano pedido de verdade via CSV histórico do
INPE). **Decisão do Pedro:** por ora, dNBR sob demanda só funciona pra mês
já encerrado (validado no `/webapp` e de novo no pipeline) — não existe
"escolher o mês corrente", que eliminaria a ambiguidade de qualquer jeito.

**Implementado:**
- `pipeline/db/schema.sql` — 6ª tabela, `consultas_sob_demanda`
  (município×ano×mês, status pendente/processando/concluido/erro,
  resultado ST-DBSCAN+dNBR, `ip_solicitante` pra limite de taxa). Nunca
  escreve em `metricas_anuais` (que continua sendo o dado anual oficial).
- `pipeline/run_dnbr.py::janela_mes_especifico(ano, mes)` — mesma ideia de
  `janela_mes_anterior`, mas ancorada num mês histórico específico (mês
  alvo inteiro como "depois", não "até hoje"). `processar_municipio` foi
  reaproveitado **sem nenhuma mudança** — só troca a janela recebida.
- `pipeline/run_consulta_sob_demanda.py` (novo CLI) — filtra focos por
  município+mês (a coluna `mes` já existia em `carregar_focos_sp`),
  ST-DBSCAN com `min_samples=4` **fixo** (não a fórmula de anomalia anual
  de `calcular_min_samples` — não se aplica a um recorte de 1 mês só;
  simplificação desta sessão, não pedida explicitamente). Migração
  idempotente da tabela (mesmo padrão de `_garantir_coluna_fonte`), já
  que desta vez é o `/webapp` quem escreve a primeira linha, antes do
  pipeline rodar.
- `.github/workflows/consulta-sob-demanda.yml` — só `workflow_dispatch`
  (nunca `schedule`), mesmos secrets de `process-sentinel-dnbr.yml`.
- `/webapp`: `POST /api/consultas` (valida período, checa se já existe
  resultado igual pra reaproveitar sem gastar cota de novo, checa limite
  de 5 consultas/hora por IP, insere linha `pendente`, dispara o workflow
  via API do GitHub) e `GET /api/consultas/[id]` (polling). Componente
  `ConsultaSobDemanda` (client component) embutido em
  `/municipio/[codigoIbge]`, **fora** do bloco "está na amostra" — funciona
  pra qualquer um dos 645 municípios, não só os 63 validados, já que não
  depende do MapBiomas.

**3 bugs reais achados testando de verdade contra Postgres local (não só
lendo o código — subi um Postgres 16+PostGIS neste sandbox pela primeira
vez nesta sessão, apliquei schema+seeds, rodei o build de produção e
bati com `curl` em cada rota):**
1. `id` (BIGSERIAL) volta como **string** do driver `postgres.js`, não
   number — `"id":"1"` no JSON, quebrando o tipo declarado. Corrigido com
   `id::int AS id` (nunca teremos 2 bilhões de consultas).
2. A resposta de "consulta criada" não incluía os campos nulos
   (`numFocosCalor` etc.), só a de reaproveitamento — inconsistente com o
   tipo `ConsultaSobDemanda`. Corrigido pra sempre devolver o formato
   completo.
3. `webapp/.gitignore` tinha `.env*` sem exceção — bloquearia
   `webapp/.env.example` (que nunca existia antes desta sessão, apesar de
   `db.ts` já instruir "copie .env.example"). Adicionado `!.env.example`.

**Cenários confirmados por execução real (curl contra servidor Next.js
local, Postgres 16+PostGIS local, 645 municípios via seed):** mês futuro
rejeitado, ano fora de 2024–2026 rejeitado (mensagem já usa o ano corrente
dinamicamente), município inexistente → 404, disparo sem
`GITHUB_DISPATCH_TOKEN` → linha gravada como `erro` com mensagem limpa +
502 (nunca fica "pendente" pra sempre), polling por id (existente/
inexistente/inválido), limite de taxa (5 OK, 6ª vira 429, e persiste
depois de reiniciar o servidor — é no banco, não em memória), consulta
repetida reaproveita o resultado **sem contar no limite de taxa**.

**Não executável nesta sessão (mesma limitação de sempre — GEE e o
disparo real do GitHub Actions só respondem a partir da rede/credenciais
do Pedro):** o caminho completo ST-DBSCAN+dNBR rodando de verdade dentro
do `consulta-sob-demanda.yml` a partir de um disparo real do `/webapp`.

**Pendência externa, só o Pedro resolve:** criar um **fine-grained PAT do
GitHub** (permissão "Actions: Read and write", só neste repositório) e
configurar `GITHUB_DISPATCH_TOKEN` nas variáveis de ambiente do projeto na
Vercel. Sem isso, `POST /api/consultas` sempre grava a linha como `erro`
("Não foi possível iniciar o cálculo") — nunca quebra o resto do site,
só essa funcionalidade específica fica inativa. Passo a passo de como
gerar o token fica pro chat, não pra este documento.

**Testado:** 14 testes novos (`janela_mes_especifico` parametrizado +
`tests/pipeline/test_run_consulta_sob_demanda.py`), 110 no total.
`npm run lint`/`npm run build` limpos (0 erros novos). Não coberto por
teste automatizado: os route handlers do `/webapp` (só validados
manualmente por execução real acima) — `/webapp` ainda não tem suíte de
testes própria (`docs/CHECKLIST.md`, item já pendente antes desta sessão).

**Status:** Código completo e validado localmente de ponta a ponta
(exceto GEE/disparo real). Falta: Pedro criar o `GITHUB_DISPATCH_TOKEN`,
mesclar pra `main`, e testar o fluxo completo em produção.

### 6.44 1ª rodada real de dNBR em escala (645/645) confirmada por log — todos os municípios com imagem no R2 (27/09/2026)

**Contexto:** a run `36283297358` (disparada no início desta sessão, seção
6.42) era a primeira vez que `process-sentinel-dnbr.yml` rodava **sem**
`--municipio` desde que o R2 foi confirmado funcionando (seção 6.41) —
até aqui só Pitangueiras tinha miniatura real, o resto do site mostrava
"mapa ainda não disponível".

**Confirmado por log real dos 2 jobs (não só `conclusion: success` —
lição da seção 6.22/6.24):** zero `[ERRO]`/`Traceback`/`Exception` nos
dois jobs; `grep -c "area_dnbr_km2="` deu **323 + 322 = 645/645**
municípios com resultado, todos também com `imagem=.../dnbr/{codigo}-
2026-09.png` (nenhum caiu no `[AVISO]` de falha de miniatura nem no
`[PULADO]` de `SemImagemValida`). Valores reais e variados (ex.:
Adamantina 49,27 km², Águas de São Pedro 0,29 km², Zacarias 74,98 km²) —
não é um número travado repetido.

**Duração maior que a estimativa da seção 2.1:** job 1 (grupo 1/2) levou
3h39min, job 2 (grupo 2/2) 5h10min — a estimativa original era ~3h cada.
Ainda folgado do teto de 6h/job do GitHub Actions, mas cresceu o
suficiente pra merecer acompanhamento nas próximas rodadas mensais (dia 1
via cron) — se continuar subindo, pode precisar de mais grupos paralelos
(`--de-grupos 3` em vez de 2) antes de esbarrar no limite de verdade.

**Status:** Fechado — pipeline de dNBR em escala real, confirmado
funcionando de ponta a ponta (GEE → R2 → Postgres) pros 645 municípios,
não só por amostra/debug. `CHECKLIST.md` atualizado (item "Imagens/
rasters comprimidos em produção" não depende mais de "conforme o
pipeline processa cada um" — já processou todos).

### 6.45 Bug real reportado pelo Pedro: mapa dNBR nunca aparecia em nenhum município — corrigido (27/09/2026)

**Contexto:** Pedro testou o site publicado (Olímpia e Pitangueiras) e
reportou dois problemas: (1) o mapa dNBR nunca aparece, em nenhum
município; (2) a "Consultar outro período" (seção 6.43) sempre falha com
"Não foi possível iniciar o cálculo".

**Item 2 não é bug — é a pendência já avisada duas vezes** (seções 6.42/
6.43): sem o `GITHUB_DISPATCH_TOKEN`, o disparo falha graciosamente por
design. Passo a passo de configuração passado pro Pedro no chat.

**Item 1 era um bug real, causado por esta própria sessão.** A página de
município (`municipio/[codigoIbge]/page.tsx`) só procurava
`dnbr_imagem_url` no `metricas_anuais` do **mesmo ano de uma validação
MapBiomas** (`metricas.find(m => m.ano === v.ano)`), e `validacao_mapbiomas`
só cobre até 2024 (Coleção 4, seção 6.22). Mas a partir da seção 6.42/6.44
desta mesma sessão, `process-sentinel-dnbr.yml` passou a gravar
`dnbr_imagem_url` sempre no **ano corrente** (2026) — que nunca tem
validação MapBiomas. Resultado: a busca por ano nunca batia, pra
**nenhum** dos 645 municípios, incluindo Pitangueiras (cujo fallback
estático antigo também está dentro do mesmo bloco morto). Eu já tinha
essa informação toda (sabia que o dNBR grava em 2026, sabia que a
validação para em 2024) mas não conectei os dois fatos antes de dizer pro
Pedro "o site já deve estar mostrando mapa real" — deveria ter conferido
a página renderizada antes de afirmar isso.

**Diagnóstico, não só leitura de código:** reproduzido localmente antes
de mexer em qualquer linha — subi o Postgres local de novo, apliquei os
seeds de 2024, inseri manualmente uma linha `metricas_anuais` pra Olímpia
com `ano=2026` e uma URL de imagem fake (mesma forma exata do dado real
de produção), rodei o build+server local e confirmei via `curl` que a
página realmente mostrava "Mapa dNBR ainda não disponível" mesmo com uma
imagem real existindo no banco — bug confirmado antes do fix, não só
suposto.

**Fix:** nova função `MapaDnbrAtual`, independente do loop de validação —
busca `metricas.find(m => m.dnbrImagemUrl)` (a `metricas` já vem ordenada
`ORDER BY ano DESC`, então isso pega a miniatura mais recente disponível,
de qualquer ano, sem exigir que bata com um ano de validação). Renderizada
uma vez, logo abaixo da `ConsultaSobDemanda`, **fora** do bloco
`!municipio.naAmostra` — agora aparece pros 645 municípios, não só os 63
validados (mesmo princípio já aplicado à seção 6.43). O bloco de imagem
antigo, por-ano, dentro de cada card de validação, foi removido (nunca
mais teria dado real hoje em diante — era estrutural, não um detalhe).
Fallback estático do Pitangueiras preservado, só realocado pra dentro da
nova função, como rede de segurança.

**Testado:** reproduzido o bug, aplicado o fix, reconfirmado com o mesmo
dado sintético — Olímpia agora mostra a imagem real com legenda "Mapa
dNBR mais recente (2026)"; um município sem nenhum dado (`Adolfo`, fora
da amostra) mostra a mensagem honesta de indisponível, sem quebrar. A
seção "Área comparada" (bar chart por ano) e a tabela "Focos de calor e
agrupamentos" não foram tocadas e continuam corretas (conferido no mesmo
teste). `npm run lint`/`build` limpos.

**Status:** Fechado — corrigido e validado localmente. Depende do próximo
deploy na Vercel pra valer em produção.

### 6.46 Miniatura dNBR reduzida de 800px pra 400px, a pedido do Pedro (27/09/2026)

**Contexto:** Pedro pediu pra reduzir a qualidade gráfica do mapa pra
"consulta sob demanda" (seção 6.43) sair mais rápido, aceitando qualidade
menor em troca. `DIMENSAO_MINIATURA_PX` (`run_dnbr.py`, compartilhada
pelo pipeline mensal em lote e pela consulta sob demanda, já que os dois
chamam `processar_municipio`) foi de 800 pra 400 — ainda minimamente
visível como imagem de card, só mais leve de gerar/baixar/subir pro R2.

**Ressalva honesta, pra não prometer o que esse ajuste sozinho não
entrega:** a miniatura não é o gargalo principal do tempo de resposta.
Pelas medições reais já feitas nesta sessão (seções 6.30/6.41), os
minutos de uma consulta vêm principalmente de: (1) fila+cold start do
runner do GitHub Actions (checkout + `pip install` do `requirements.txt`
inteiro, ~30-60s fixos, mesmo pra 1 município só); (2) as chamadas
síncronas ao Earth Engine em `calcular_dnbr` (`.getInfo()` de tamanho de
coleção e cobertura de nuvem, em até 4 tentativas com limiares de nuvem
crescentes). Nenhum dos dois depende do tamanho da miniatura. Reduzir a
dimensão ajuda um pouco (menos dado pra `getThumbURL` renderizar, baixar
e subir), mas não deve tirar a consulta sob demanda da faixa de ~1-3min.

**Se quiser mais velocidade de verdade depois:** o próximo passo com
melhor custo-benefício seria um `requirements` mais enxuto só pra
`consulta-sob-demanda.yml` (o script não usa `geemap`/`rasterio`/
`rasterstats`, só usados por `dnbr/validacao.py` — MapBiomas, que a
consulta sob demanda não faz) — cortaria parte do tempo de instalação de
dependências. Não implementado ainda, não foi pedido.

**Testado:** nenhum teste automatizado depende desse valor (confirmado por
busca antes de mudar); 110 testes seguem passando. Mudança de constante
pura, sem lógica nova.

**Status:** Fechado.

---

## 7. Pendências em aberto (nada decidido ainda)

- **Direção estratégica (25/09/2026):** foco inicial é o produto ser
  entrega de pesquisa (PIBIC) e, se necessário, de TCC — não patente.
  Patenteamento só entraria em cogitação se o projeto crescer muito.
  Consulta ao NIT da UNESP fica **deliberadamente adiada** por ora:
  decisão explícita de Pedro é manter o mínimo de vínculo formal possível
  com a UNESP nesta fase (para não antecipar uma discussão de propriedade
  intelectual que só faz sentido se o projeto de fato escalar).
- **Nome do produto** — ainda não definido (homenagem a duas pessoas,
  sem expor os nomes publicamente).
- **Licenciamento do repositório** — em aberto; consulta ao NIT adiada
  (ver acima), então a licença também fica pendente por ora.
- **Estratégia de expansão da amostra** — dos 63 municípios validados para
  as regiões planejadas (SJRP, Vale do Ribeira, RMSP, Marília/Assis/
  Presidente Prudente); próximo passo definido é validação visual por
  rank de recall antes de expandir.
- **Página "Material didático"** — ainda não discutida.
- **Orientadora formal do PIBIC** — nome só entra na página "Quem somos"
  após autorização dela; por ora, só o nome de Pedro aparece.
- **Redesenho da interface gráfica (25/09/2026):** Pedro decidiu migrar a
  estética visual atual (dashboard "instrumento de precisão", IBM Plex Mono
  + Public Sans, paleta verde/azul — seção 5) para algo mais próximo do
  visual dos diálogos do Claude (claude.ai). Escopo confirmado por Pedro:
  **só restyle visual** (cores, tipografia, layout) — a navegação atual
  (busca → lista → detalhe do município) é mantida, não vira chat/conversa
  em linguagem natural. Confirmado também: a paleta funcional de
  confiabilidade (verde/mostarda/terracota nos selos Alta/Média/Baixa)
  **não muda** — só a estética geral da interface.
  **Status:** implementado nesta sessão (ver seção 6.8), aguardando Pedro
  ver o resultado e aprovar ou pedir ajuste.
- **Geolocalização como atalho de navegação — ideia levantada pelo Pedro
  (26/09/2026):** pergunta original: pedir a localização da pessoa e já
  cair direto no método/resultado dela, sem precisar navegar entre os 645
  municípios; cogitou também virar PWA. Avaliação: são duas ideias com
  viabilidade bem diferentes.
  - **Geolocalização só como atalho de navegação** (pedir
    `navigator.geolocation`, converter lat/lon pro `codigo_ibge` mais
    próximo — reverse geocoding simples — e redirecionar direto pra
    `/municipio/[codigoIbge]`) — barato, compatível com a arquitetura
    atual (o webapp já lê direto do banco, seção 4; isso só muda a
    navegação inicial, não o cálculo). Não deixa de precisar dos 645
    municípios no banco — só evita a pessoa procurar manualmente o dela.
  - **Computar o método sob demanda por visitante** (a leitura "não
    precisar ter todos os 645 disponíveis") — **incompatível** com a
    arquitetura atual: o pipeline depende de jobs em lote no GEE que
    levam horas (dNBR: ~2h30, MapBiomas: ~2h por metade), com cadência
    mensal/anual (seção 1.1) — não dá pra rodar isso de forma síncrona a
    cada carregamento de página. Hoje uma página carrega com uma única
    leitura do Postgres, sem cálculo nenhum ao vivo; computar sob demanda
    tornaria o site **mais lento**, não mais leve.
  - **PWA:** ortogonal às duas ideias acima — dá pra adicionar (manifest +
    service worker pra cache/instalável) independente de qual das duas
    formas de geolocalização for adotada, se for adotada.
  **Status:** ideia registrada, nenhuma decisão tomada — nem a
  geolocalização-como-atalho (que é viável) foi pedida como
  implementação ainda.
- ~~Interface do `/webapp` real ficou mais simples do que o mockup
  visual~~ — **resolvido (26/09/2026, seção 6.38):** cor de ação, mapa
  dNBR, as 2 páginas institucionais, e depois o restyle completo em
  "vidro" (header fixo, hero com orbs, tema claro/escuro manual, barra de
  comparação, tiles expansíveis) — todos portados pro produto real.
  **Ainda faltam, deliberadamente não portados** (motivo detalhado na
  seção 6.38): grid de "municípios em destaque" com thumbnail (depende da
  pendência de imagem em escala, ver abaixo), barra de cobertura em 4
  estados (o banco não distingue essas categorias hoje) e busca com
  dropdown ao vivo (muda o modelo de interação, não só o visual). Path do
  artefato original: `https://claude.ai/artifact/XUKMwTerRzGjnXJkRhVvrJ`.
- ~~Fonte AvantGarde Std Bold não carrega~~ — **resolvido (26/09/2026,
  ver seção 6.36):** Pedro escolheu a opção (b) das 3 propostas na seção
  6.34 — trocar por fonte livre de estilo parecido. Jost (Google Fonts,
  geométrica) está no ar nos títulos, peso 700, funcionando sem erro.
- ~~Mapa dNBR real pros 645 municípios~~ — **arquitetura e código
  fechados (seção 6.40)**, Pedro confirmou essa como a prioridade #1
  entre os 3 pedidos da mensagem. Só falta ele criar a conta/bucket
  Cloudflare R2 e os 5 secrets — sem isso, roda igual a hoje, sem imagem
  nova.
- **Rodar ST-DBSCAN + dNBR + IoU pra 2018–2023 (pedido 26/09/2026,
  Pedro confirmou querer só esse recorte, não 2025/2026 — ver próximo
  item):** o achado da seção 6.35 sobre "INPE não tem 2018–2023" estava
  **impreciso** — Pedro questionou e checar de novo (código +
  documentação anterior, seção 6.19) mostrou que a `[AVISO]` real é sobre
  **um endpoint específico** (`dataserver-coids.inpe.br/.../mensal/...`,
  uma janela rolante recente, não um arquivo histórico completo) — a
  seção 6.19 já suspeitava disso e nunca fechou a pergunta. O histórico
  real do INPE quase certamente existe no **BDQueimadas** (portal oficial
  de consulta/download que a pesquisa original usou manualmente, seção
  6.19) — só que o pipeline atual **não sabe buscar lá**, é uma integração
  nova (URL/formato de export do BDQueimadas ainda não mapeado neste
  código, coluna de data pode vir diferente de novo — mesmo tipo de
  armadilha da seção 6.20). Não é "rodar de novo", é construir a busca
  certa antes.
  **Status:** Pedro confirmou querer isso, mas a prioridade desta sessão
  ficou a seção 6.40 (dNBR em escala) — este item entra na fila depois.
- **Rodar ST-DBSCAN + dNBR pros 645 sem confiabilidade, 2025–2026
  (pedido 26/09/2026, Pedro confirmou):** MapBiomas Fogo Coleção 4 só
  cobre até 2024 (seção 6.22) — esses anos ficam sem `validacao_mapbiomas`
  mesmo, por design, não por bug. **Status (27/09/2026, seção 6.42):** em
  andamento — ST-DBSCAN 2026 já mantido corrente pelo cron diário sem
  ação extra; dNBR 2026 real (645 municípios, não debug) e ST-DBSCAN 2025
  (backfill) disparados, resultado ainda não confirmado. **dNBR 2025
  ficou de fora por decisão do Pedro** — o método atual não tem como
  calcular uma janela retroativa (só sabe "mês anterior vs. corrente" a
  partir da data real), então rodar `--ano 2025` gravaria o dNBR de hoje
  rotulado como se fosse de 2025. `area_dnbr_km2` fica `NULL` em 2025 até
  alguém pedir explicitamente a janela retroativa fixa que isso exigiria
  implementar.
- **"Mudanças de segurança" (pedido 26/09/2026, sem detalhar quais):**
  conferido nesta sessão que a proteção contra SQL injection **já
  existe** — `webapp/src/lib/queries.ts` usa só template tagged do
  `postgres.js` (`sql\`... ${valor}\``), que parametriza automaticamente;
  não tem concatenação de string em nenhuma query, incluindo o fragmento
  dinâmico da busca (linha 36). As pendências reais de segurança que
  seguem em aberto no `docs/CHECKLIST.md` são rate limiting na API,
  política de retenção de dados, e ambiente de staging — nenhuma foi
  especificada como a prioridade pelo Pedro ainda.
- **Reorganizar/esconder a confiabilidade — mudança de paleta pedida
  (pedido 26/09/2026, ainda NÃO implementada, Pedro pediu pra focar na
  seção 6.40 primeiro):** Pedro considera a confiabilidade "dado
  ligeiramente sensível" que pode "comprometer a credibilidade" se
  ficar exposto do jeito atual (selo grande, sempre visível) — quer
  deixá-la "mais escondida" na interface. Proposta dele pra paleta nova
  (substitui a de badge de sempre): **verde = Alta** (igual hoje),
  **verde claro = Média** (hoje é mostarda `#D9A441`), **amarelo escuro
  com fonte preta = Baixa** (hoje é terracota `#C1442D` com fonte
  branca), **cinza = Insuficiente** (igual hoje). Isso muda 2 das 3 cores
  que o `CLAUDE.md` documenta como "não mudam nunca" — só é uma mudança
  válida porque é o próprio Pedro pedindo agora, explicitamente (a regra
  do `CLAUDE.md` existe pra eu não mudar sozinho, não pra travar o Pedro
  de mudar de ideia). Ainda em aberto, não travando nada: (1) o que
  exatamente "esconder mais" significa em termos de interface — remover
  o selo da lista/visão geral e só mostrar dentro do detalhe? Atrás de
  um clique/expansão? (2) hex exato do "verde claro" e do "amarelo
  escuro" (Pedro não deu valores, só o conceito); (3) se muda também o
  código (`Confiabilidade`, `CONFIABILIDADE_STYLE`) ou só a
  representação visual. **Quando isso for implementado, atualizar
  também o `CLAUDE.md`** (não só aqui) — é lá que as cores "fixas" estão
  documentadas como regra do projeto.
