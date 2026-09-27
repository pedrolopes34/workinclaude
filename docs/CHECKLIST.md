# Checklist de produto profissional

Checklist aprovado para o Painel de Queimadas SP, com status atual de cada
item. Atualizar sempre que um item avançar — é a forma de acompanhar o
quanto falta antes de considerar o produto pronto para produção pública.

Legenda: `[x]` feito · `[~]` parcial (feito só no mockup ou parcialmente) ·
`[ ]` pendente.

## SEO e metadados

- [x] Meta title e meta description por página — global (`layout.tsx`) +
      metadata dinâmica por município (`generateMetadata`, ex.:
      "Pitangueiras — Painel de Queimadas SP")
- [x] Imagem Open Graph — `src/app/opengraph-image.tsx` (1200×630, título
      provisório) + `metadataBase` no layout, pra URL absoluta no
      compartilhamento (`docs/DECISIONS.md` seção 6.52)
- [~] Favicon — `icon.tsx` gerado dinamicamente (círculo "Q"), placeholder
      até o nome/logo do produto ser decidido (`docs/DECISIONS.md` seção 7)
- [x] `robots.txt` — `src/app/robots.ts`
- [x] `sitemap.xml` — `src/app/sitemap.ts`, inclui a home, `/mapa`,
      `/comparar` e os 63 municípios da amostra (os outros 582 ainda não
      têm conteúdo próprio pra valer indexação). Corrigido em 27/09/2026:
      sem a variável `NEXT_PUBLIC_SITE_URL`, sitemap e robots saíam com
      `example.com`; agora caem no endereço real (`src/lib/site.ts`)

## Páginas essenciais

- [x] Página 404 personalizada — `src/app/not-found.tsx`, com o cuidado de
      não ter `loading.tsx` na rota de município (quebraria o status HTTP
      404 de verdade — ver `docs/DECISIONS.md` seção 6.10)
- [~] Página de agradecimento — conteúdo e visual prontos no mockup
      (`#obrigado`), já com o aviso de pesquisa em andamento; hoje não há
      formulário real que a dispare
- [~] Página de Política de Privacidade — conteúdo fechado (analytics já
      decidido: Vercel Analytics, sem cookies); falta só a data de
      publicação e revisão antes de virar oficial
- [~] Página de Termos de Uso — rascunho redigido
      (`docs/legal/termos-de-uso.md`), mesmo aviso de revisão pendente
- [x] Banner de cookies — **não se aplica**: Vercel Analytics (decidido
      abaixo) não usa cookies nem dado pessoal identificável
- [x] Endereço de contato real — endereço institucional (UNESP FCE Tupã)
      no rodapé (`layout.tsx`) **e** na página "Quem somos" real
      (`/quem-somos`), junto com e-mail pessoal, e-mail institucional,
      Lattes e LinkedIn — portado do mockup pro produto de verdade nesta
      sessão (`docs/DECISIONS.md` seção 7)
- [x] Página "Quem somos" — perfil do Pedro, contato completo (e-mails,
      Lattes, LinkedIn, endereço institucional); nome da orientadora
      deliberadamente omitido até autorização dela (`docs/DECISIONS.md`
      seção 7). Rota real: `/quem-somos`
- [x] Página "Como produzimos" — passo a passo do método, tabela de
      parâmetros tirada do código, regra dos 4 níveis (corrigida em
      27/09/2026: dizia "Recall ≥ 50% **ou** p < 0,05"), limitações
      obrigatórias, fontes oficiais e referências, cadência de atualização.
      Rota real: `/como-produzimos` (`docs/DECISIONS.md` seção 6.52)

## UX e acessibilidade

- [x] Identidade visual dos selos e tipografia — selos sem vermelho (Baixa
      areia, Média verde claro, Alta verde, Insuficiente só contorno),
      validados no validador de paleta (visão normal ΔE 16,3; daltonismo
      ΔE 10,6); fonte Inter em toda a página, conferida no navegador;
      botões do topo alinhados (27/09/2026, `docs/DECISIONS.md` seção 6.55)
- [x] Mapas do estado lado a lado — leitura de satélite (dNBR) mês a mês,
      com limites municipais liga/desliga, e confiabilidade dos 645 por ano;
      mapa de focos com a mesma escala nos dois temas (seção 6.55)
- [x] Busca com sugestões próprias até o último município (o `<datalist>`
      do Chrome parava no 521º) e lista agrupada por nível de confiabilidade
- [x] Página do município ano a ano — anos clicáveis, painel por ano sem
      campos zerados, origem de cada número em poucas palavras
- [x] Texto alternativo em todas as imagens — mapas dNBR com `alt` que
      descreve a escala real (corrigido em 27/09/2026 junto da legenda),
      mapa de SP com `aria-label` que resume as contagens, imagem Open
      Graph com `alt`
- [x] Breakpoints para mobile — produto real testado a 390 px nas 10
      páginas principais (Playwright, 27/09/2026): sem rolagem horizontal;
      navegação vira uma linha rolável no celular (antes sumia)
- [x] Estados de carregamento — `<Suspense>` local na busca (skeleton só na
      lista, não na rota inteira)
- [x] Estados de erro — `src/app/error.tsx` cobre falha genérica de
      renderização/dados; a consulta sob demanda mostra mensagem legível +
      código da consulta pra suporte; busca, filtros e comparação têm
      estado vazio explicado (`docs/DECISIONS.md` seção 6.52)
- [x] Auditoria de acessibilidade nível WCAG AA — rodada com axe-core
      (Playwright) nas 3 páginas reais (home, detalhe de município, 404);
      refeita em 27/09/2026 nas 10 páginas do produto evoluído, nos dois
      temas: 0 violações depois de corrigir 2 achados de contraste (seção
      6.52);
      achou 5 violações de contraste no total. 2 corrigidas direto
      (`text-stone-500` → `text-stone-600`, cinza genérico sem cor
      protegida). As 3 que esbarravam nas cores fixas do `CLAUDE.md`
      (`--color-acento` como texto e como fundo com texto branco; selo
      verde de confiabilidade Alta com texto branco) resolvidas com
      negrito + texto grande (`text-[19px] font-bold`, brecha do próprio
      WCAG pra "texto grande" — os hex não mudaram, decisão do Pedro, ver
      `docs/DECISIONS.md` seção 6.32). **0 violações de `color-contrast`**
      confirmadas por reexecução real do axe-core. Ampliado 26/09/2026
      (seção 6.39): auditoria passou a cobrir **claro e escuro** nas 6
      páginas reais (antes só testava claro) — achou 3 problemas reais do
      modo escuro nunca antes detectados (2 pré-existentes desde o
      restyle de 25/09, 1 introduzido pelo restyle "vidro" da seção
      6.38), todos corrigidos com tokens novos (`--muted`, `--faint`,
      `--color-acento-botao`, `--color-acento-texto`). **0 violações nas
      12 combinações página×tema.**

## Segurança

- [x] HTTPS/TLS — automático pela Vercel desde o 1º deploy em produção
      (26/09/2026, `docs/DECISIONS.md` seção 6.37)
- [~] Rate limiting na API — **existe** pra `POST /api/consultas`
      (consulta sob demanda, `docs/DECISIONS.md` seção 6.43: 5/hora por
      IP, verificado contra o banco, confirmado por execução real). A
      `/api` REST externa em si (`/api`) ainda não foi implementada
      (segue `[ ]` na seção de documentação abaixo) — quando for, precisa
      da sua própria política
- [x] Proteção contra injeção — conferido 26/09/2026: `webapp/src/lib/queries.ts`
      usa só template tagged do `postgres.js` (`sql\`... ${valor}\``, parametriza
      sozinho), inclusive no fragmento dinâmico da busca por nome — sem
      concatenação de string em nenhuma query (`docs/DECISIONS.md` seção 7)
- [x] Scan de vulnerabilidade de dependências — `.github/dependabot.yml`
      criado (pip/`pipeline`, npm/`webapp`, github-actions, semanal) e
      "Dependabot alerts" confirmado ativo pelo Pedro em Settings → Code
      security (26/09/2026) — o repositório era privado, então não veio
      ligado por padrão, mas já estava ativo quando ele conferiu. Virou
      público em 27/09/2026 (`docs/DECISIONS.md` seção 6.50): *secret
      scanning* e *push protection* ficam disponíveis de graça. Varredura
      antes de abrir (todas as branches e todo o histórico): nenhum segredo.
- [ ] Política de retenção de dados de usuário (definir o que é coletado
      antes de escrever a política)

## Testes e operação

- [~] Testes automatizados — 132 testes `pytest` cobrindo o núcleo do
      `/pipeline` (ST-DBSCAN, fórmula de `min_samples` regredida contra os
      12 casos reais, ingestão INPE incluindo a concatenação mensal→anual,
      dNBR incluindo a janela histórica da consulta sob demanda, IoU/
      permutação/confiabilidade regredida contra os 5 exemplos
      documentados, validação de campo e coerção de tipo da auditoria
      anual, proteção da amostra manual, diagnóstico de geometria da
      validação MapBiomas, diagnóstico das imagens do R2 e dos focos por
      satélite, inventário dos dados), com CI/CD real
      (`.github/workflows/tests.yml`, roda a cada push/PR que toque
      `pipeline/` ou `tests/`) — falta só
      testes automatizados do `/webapp` (as rotas de consulta sob demanda,
      `docs/DECISIONS.md` seção 6.43, foram validadas manualmente contra
      Postgres real nesta sessão, não por suíte automatizada)
- [ ] Ambiente de staging separado de produção
- [ ] Monitoramento de erros em produção — incidente real que mostra a
      falta (27/09/2026, `docs/DECISIONS.md` seção 6.49): a cota do GitHub
      Actions esgotou, todo job passou a falhar sem runner e o cron diário
      nem foi criado — ninguém foi avisado; só apareceu investigando o mapa
- [ ] Backup do banco espacial (Neon) e dos GeoTIFFs (Cloudflare R2)
- [~] Analytics — **decidido**: Vercel Analytics (ver `docs/DECISIONS.md`,
      2.2); `@vercel/analytics` já instalado e no `layout.tsx` do webapp;
      site já publicado (seção 6.37) — falta só confirmar se o Pedro
      habilitou a aba Analytics no painel do projeto na Vercel

## Documentação e citação

- [x] `CITATION.cff` — na raiz do repositório (título provisório "Painel
      de Queimadas SP", nome oficial do produto ainda não decidido)
- [x] `CHANGELOG.md` com versionamento semântico — seção "Não lançado" com
      o que já existe
- [ ] Documentação da API em OpenAPI/Swagger
- [~] Página de metodologia transparente com limitações — no produto
      real desde 27/09/2026 (parâmetros, limitações obrigatórias, a
      diferença conhecida de satélites da seção 6.51, fontes e
      referências); falta a revisão final do Pedro e o DOI
- [ ] DOI via Zenodo

## Dados e atribuição

- [x] Atribuição obrigatória das fontes de terceiros (INPE, MapBiomas,
      Sentinel-2/Copernicus/ESA) — presente no rodapé do site real
      (`webapp/src/app/layout.tsx`, aparece em toda página). Correção
      (27/09/2026, `docs/DECISIONS.md` seção 6.50): este item dizia que a
      atribuição também estava "no README raiz do repositório", mas esse
      README nunca existiu — só há README por pasta
- [x] Exportação dos dados em CSV — `/dados/municipios.csv`: os 645
      municípios com o dado validado pela pesquisa e coluna de origem
      (RFC 4180, UTF-8 com BOM), botão na página inicial (seção 6.52)
- [x] Imagens/rasters comprimidos em produção — **fechado 26/09/2026
      (`docs/DECISIONS.md` seções 6.40/6.41)**: `run_dnbr.py` gera uma
      miniatura PNG colorida (já leve por natureza — 400px desde a seção
      6.46, via `getThumbURL` do GEE, não GeoTIFF completo) e sobe pro
      Cloudflare R2. Confirmado funcionando de ponta a ponta com dado real
      (Pitangueiras, run `36276029598`) depois de 6 rodadas de teste que
      acharam e corrigiram 2 bugs reais de normalização do
      `R2_ACCOUNT_ID`. **Escala confirmada (27/09/2026, `docs/DECISIONS.md`
      seção 6.44):** 1ª rodada real sem `--municipio` processou os 645/645
      municípios com sucesso (confirmado por log, não só `conclusion`) —
      todos com miniatura real no R2 agora, não só Pitangueiras. Rodadas
      mensais normais (cron do dia 1) mantêm isso atualizado sozinhas.
      **Exibição no site confirmada em produção (27/09/2026, seção
      6.50):** 645 objetos no bucket e as páginas publicadas renderizando
      o mapa (HTTP 200 `image/png`), depois de corrigida a URL pública.

---

**Contagem atual:** 22 itens feitos, 8 parciais, 6 pendentes —
atualizado em 27/09/2026 (evolução do produto, `docs/DECISIONS.md` seção
6.52): imagem Open Graph, texto alternativo, breakpoints e estados de erro
viraram `[x]`, e entrou a exportação em CSV. Antes, no mesmo dia: rate
limiting virou `[~]` e os testes pytest subiram de 88 para 132 (os últimos
com o filtro do satélite de referência, `docs/DECISIONS.md` seção 6.53).

**Consulta sob demanda — município+ano+mês calculado ao vivo
(`docs/DECISIONS.md` seção 6.43, 27/09/2026):** funcionalidade nova
pedida pelo Pedro — o visitante escolhe um mês já encerrado (2024–2026;
2018–2023 mostra "histórico ainda não integrado") e o sistema roda
ST-DBSCAN + dNBR na hora, via `workflow_dispatch` do GitHub Actions
(reaproveita o `/pipeline` e os secrets já existentes, sem infraestrutura
nova). Tabela `consultas_sob_demanda` nunca sobrescreve `metricas_anuais`.
Validado de ponta a ponta contra Postgres real nesta sessão (primeira vez
que um Postgres+PostGIS local foi montado aqui) — achou e corrigiu 3 bugs
reais (id BIGSERIAL virando string no JSON, formato de resposta
inconsistente, `.gitignore` bloqueando `.env.example`). Falta só o Pedro
criar o `GITHUB_DISPATCH_TOKEN` (fine-grained PAT do GitHub) pra
funcionar em produção — sem ele, a funcionalidade falha graciosamente
(mensagem de erro clara, nunca quebra o resto do site).

atualizado em 26/09/2026: site publicado em produção
(`workinclaude.vercel.app`, seção 6.37 — HTTPS fecha sozinho), proteção
contra SQL injection confirmada já existente, restyle "vidro" completo
com auditoria WCAG agora cobrindo os dois temas (seção 6.39). As páginas
"Quem somos" e "Como produzimos" foram portadas pro produto real
(`/quem-somos`, `/como-produzimos`),
foram portadas pro produto real (`/quem-somos`, `/como-produzimos`),
fechando também o item "Endereço de contato real" que tinha virado `[~]`
na revisão anterior. Cor de ação revertida pra azul por decisão do Pedro
e mapa dNBR real adicionado na página de Pitangueiras (`docs/DECISIONS.md`
seção 6.33/7). Identidade tipográfica dos títulos **fechada**: o arquivo
AvantGarde que o Pedro forneceu estava corrompido sem conserto viável
(seção 6.34); ele escolheu trocar por fonte livre parecida, Jost entrou
no lugar, peso 700, funcionando sem erro (seção 6.36).

**✅ `check-mapbiomas.yml` corrigido E confirmado em escala real
(`docs/DECISIONS.md` seções 6.31 e 6.35):** a causa raiz era projeção —
`getInfo()` do Earth Engine sempre devolve geometria em EPSG:4326,
independente do `crs` pedido no `reduceToVectors`; o código tratava essas
coordenadas em graus como se já estivessem em metros. Confirmado primeiro
com Ibitinga (área de 0,00 km² pra 88,40 km², IoU de 0% pra 10,23%) e
depois com a rodada completa dos 645 municípios em produção (run
`36254268271`): 516 município-ano comparados, confiabilidade **variando
de verdade** (29 Alta, 378 Média, 109 Baixa — nada de "sempre Baixa"),
zero erros nos logs.

**✅ Incidente da amostra manual, corrigido (`docs/DECISIONS.md` seção
6.29):** o `check-mapbiomas.yml` bugado sobrescreveu pelo menos 33 dos 63
municípios da amostra validada manualmente (Ibitinga incluído) com
resultado errado antes de eu cancelar a rodada. Coluna
`validacao_mapbiomas.fonte` protege a amostra permanentemente (88 testes
no total agora), e a restauração já foi aplicada em produção (run
`36252923307`, sucesso confirmado por log).

Este checklist é sobre prontidão de produção (SEO, segurança, testes) —
para o que foi implementado nesta sessão, ver `docs/DECISIONS.md` seção 6.
