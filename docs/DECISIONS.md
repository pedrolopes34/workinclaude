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

### 6.6 Banco local para desenvolvimento, não Neon ainda
**Contexto:** sem acesso ao Neon nesta sessão.
**Decisão:** Postgres 16 + PostGIS rodando localmente no ambiente do
Claude Code, controlado por `DATABASE_URL` (variável de ambiente) — trocar
para a connection string do Neon é o único passo necessário para migrar,
sem mudar código.
**Status:** Provisório por design. Pendência: Pedro passar acesso ao Neon.

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
- **Redesenho da interface gráfica (25/09/2026):** Pedro sinalizou intenção
  de migrar a interface visual atual (dashboard "instrumento de precisão",
  IBM Plex Mono + Public Sans, paleta verde/azul, telas de busca/lista/
  detalhe — seção 5) para algo mais próximo dos diálogos do Claude
  (claude.ai). Ainda não detalhado se é (a) só restyling visual mantendo a
  navegação atual, (b) mudança de paradigma de interação para conversa em
  linguagem natural, ou (c) híbrido. Supersede parcialmente a seção 5 até
  ser detalhado — **não iniciar redesenho sem alinhar o escopo antes**,
  porque as opções têm tamanhos de trabalho muito diferentes.
