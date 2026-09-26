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
