# CLAUDE.md — Painel de Queimadas SP

Antes de ajudar com qualquer tarefa aqui, leia nesta ordem:
1. **[CONTEXTO_PROJETO.md](CONTEXTO_PROJETO.md)** — resumo da pesquisa
   PIBIC/CNPq em si (metodologia ST-DBSCAN+dNBR, cidades já estudadas,
   resultados, armadilhas técnicas já resolvidas). É sobre a **pesquisa**;
   os documentos abaixo são sobre o **software**.
2. **[docs/DECISIONS.md](docs/DECISIONS.md)** — log completo de decisões
   técnicas e metodológicas do software, com contexto e justificativa.
3. **[docs/CHECKLIST.md](docs/CHECKLIST.md)** — checklist de produto, com
   status atual de cada item.

Não pergunte nada que já esteja documentado nesses 3 arquivos — leia
primeiro. Se algo não estiver claro mesmo depois de ler, aí sim pergunte.

## Regra de segurança inegociável

**Nunca inclua comando de deleção recursiva (`rmtree`, `rm -rf`, `shutil.rmtree`, etc.) em nenhum script que aponte para um ponto de montagem de Google Drive** (`/content/gdrive`, ou qualquer caminho montado). Isso já causou perda real de dados pessoais do Pedro uma vez (recuperado da lixeira, mas não teve garantia). Se precisar "limpar" algo antes de montar, use `drive.mount(..., force_remount=True)` sozinho, ou peça para o usuário apagar manualmente a pasta específica.

## O que é este projeto

Software de monitoramento de queimadas para os 645 municípios do estado de
São Paulo. Identifica cicatrizes de queimada cruzando duas fontes
independentes de satélite — agrupamento espaço-temporal de focos de calor
(ST-DBSCAN sobre dados do INPE) e leitura de satélite (dNBR sobre
Sentinel-2, via Google Earth Engine) — e comunica, em linguagem simples, o
quanto dá para confiar em cada resultado, comparando-o ao MapBiomas Fogo.

Nasce de uma Iniciação Científica (PIBIC/CNPq, sem bolsa) de Pedro Lopes de
Oliveira, na UNESP — Faculdade de Ciências e Engenharia (Tupã-SP). A
metodologia já está testada e validada academicamente em 63 municípios; o
software é a extensão pública dessa pesquisa.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Decisões técnicas já fechadas (arquitetura, cadência, critérios) | `docs/DECISIONS.md` |
| O que falta para produção, com status | `docs/CHECKLIST.md` |
| Schema do banco (5 tabelas + view, Postgres + PostGIS) | `pipeline/db/schema.sql` |
| Seeds (municípios de SP + dados reais dos 63 validados) | `pipeline/db/seeds/` |
| O que cada um dos 8 componentes faz | `README.md` de cada pasta |
| Rascunhos de Privacidade/Termos (não oficiais ainda) | `docs/legal/` |
| Contexto bruto da pesquisa (antes deste repositório existir) | `CONTEXTO_PROJETO.md` |

## Convenções já fechadas — não mudar sem aprovação explícita do Pedro

- **Terminologia em português** em tudo visível ao usuário final: nunca
  "cluster" (usar "agrupamento"); "ST-DBSCAN + dNBR" vira "agrupamento de
  focos de calor + leitura de satélite"; "IoU" vira "Interseção", exibido
  como percentual (ex.: "6,1%"), não decimal.
- **Chave de município:** código IBGE de 7 dígitos, nunca o nome.
- **Confiabilidade em 4 níveis** (Alta/Média/Baixa/Insuficiente), critério
  fixo: Alta = Recall≥50% **e** p<0,05; Média = só um passa; Baixa =
  nenhum passa mas há agrupamento; Insuficiente = nenhum agrupamento
  formado no ano.
- **Selos de confiabilidade (não mudam nunca):** verde `#5B9E4D` = Alta,
  mostarda `#D9A441` = Média, terracota `#C1442D` = Baixa — só nesse uso
  funcional, nunca como cor decorativa comum.
- **Estética geral da interface (restyle 25/09/2026, ver
  `docs/DECISIONS.md` seção 6.8):** visual inspirado nos diálogos do
  Claude — fundo creme quente, cards bem arredondados, paleta neutra
  quente (`stone`, não `zinc`). Cor de ação/links: argila quente
  (`--color-acento`, `#C17A4E`), não mais o azul `#3C7DA6` (token mantido
  no código por histórico, mas não usado). Fontes: Public Sans como voz
  principal; IBM Plex Mono só em valores numéricos (código IBGE, recall,
  p-valor), não mais em rótulos/cabeçalhos.
- `/webapp` lê direto do banco/storage — **nunca** passa pela `/api`
  internamente. A API é componente separado, para acesso externo futuro.
- Pipeline **100% automático**, sem gate manual de aprovação; o controle
  manual virou uma auditoria anual (`audit-anual.yml`), registrada em
  `auditorias_anuais` e oculta da interface do usuário final.
- Processamento mensal de dNBR cobre **todos os 645 municípios**, dividido
  em 2 jobs paralelos do GitHub Actions — nunca lotes parciais.
- **Analytics: Vercel Analytics** (nativo da hospedagem, sem cookies, sem
  dado pessoal identificável) — não é necessário banner de consentimento
  de cookies para esse fim.

## O que NÃO está decidido — não travar a implementação por causa disso

- Nome do produto.
- Licenciamento do repositório — **deliberadamente adiado**: a consulta ao
  NIT da UNESP não é prioridade agora.
- Expansão da amostra além dos 63 municípios já validados.

Usar placeholders óbvios (`[NOME_DO_PRODUTO]`, licença `TBD`) onde for
necessário — nenhum desses pontos deveria travar a implementação das
partes já fechadas.

## Como trabalhar aqui

Sempre que uma decisão nova for tomada durante a implementação — inclusive
pequenos ajustes de schema, nomenclatura ou fluxo — registrar em
`docs/DECISIONS.md` e atualizar `docs/CHECKLIST.md`. Os dois são a fonte
única de verdade do projeto desde a fase de planejamento; não deixar
decisão nenhuma existir só na conversa com o Pedro.
