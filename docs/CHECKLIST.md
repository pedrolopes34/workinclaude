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
- [ ] Imagem Open Graph
- [~] Favicon — `icon.tsx` gerado dinamicamente (círculo "Q"), placeholder
      até o nome/logo do produto ser decidido (`docs/DECISIONS.md` seção 7)
- [x] `robots.txt` — `src/app/robots.ts`
- [x] `sitemap.xml` — `src/app/sitemap.ts`, inclui a home + os 63
      municípios da amostra (os outros 582 ainda não têm conteúdo próprio
      pra valer indexação)

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
- [x] Página "Como produzimos" — metodologia em 3 passos, os 4 níveis de
      confiabilidade explicados (reaproveitando `CONFIABILIDADE_STYLE`,
      mesmas cores/critérios protegidos do `CLAUDE.md`), limitações
      assumidas, cadência de atualização por fonte. Rota real:
      `/como-produzimos`

## UX e acessibilidade

- [~] Texto alternativo em todas as imagens — já aplicado nas imagens do
      mockup (mapas dNBR e cards de destaque têm `alt` descritivo);
      confirmar quando o conteúdo real entrar
- [~] Breakpoints para mobile — o mockup já é responsivo (grids quebram em
      2/1 colunas); falta testar o produto real
- [x] Estados de carregamento — `<Suspense>` local na busca (skeleton só na
      lista, não na rota inteira)
- [~] Estados de erro — `src/app/error.tsx` cobre falha genérica de
      renderização/dados; ainda não se aplica a formulários (não existe
      formulário no produto ainda)
- [x] Auditoria de acessibilidade nível WCAG AA — rodada com axe-core
      (Playwright) nas 3 páginas reais (home, detalhe de município, 404);
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
- [ ] Rate limiting na API
- [x] Proteção contra injeção — conferido 26/09/2026: `webapp/src/lib/queries.ts`
      usa só template tagged do `postgres.js` (`sql\`... ${valor}\``, parametriza
      sozinho), inclusive no fragmento dinâmico da busca por nome — sem
      concatenação de string em nenhuma query (`docs/DECISIONS.md` seção 7)
- [x] Scan de vulnerabilidade de dependências — `.github/dependabot.yml`
      criado (pip/`pipeline`, npm/`webapp`, github-actions, semanal) e
      "Dependabot alerts" confirmado ativo pelo Pedro em Settings → Code
      security (26/09/2026) — repositório é privado, então não veio ligado
      por padrão, mas já estava ativo quando ele conferiu
- [ ] Política de retenção de dados de usuário (definir o que é coletado
      antes de escrever a política)

## Testes e operação

- [~] Testes automatizados — 88 testes `pytest` cobrindo o núcleo do
      `/pipeline` (ST-DBSCAN, fórmula de `min_samples` regredida contra os
      12 casos reais, ingestão INPE incluindo a concatenação mensal→anual,
      dNBR, IoU/permutação/confiabilidade regredida contra os 5 exemplos
      documentados, validação de campo e coerção de tipo da auditoria
      anual, proteção da amostra manual e diagnóstico de geometria da
      validação MapBiomas), com CI/CD real (`.github/workflows/tests.yml`,
      roda a cada push/PR que toque `pipeline/` ou `tests/`) — falta só
      testes do `/webapp`
- [ ] Ambiente de staging separado de produção
- [ ] Monitoramento de erros em produção
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
- [~] Página de metodologia transparente com limitações — já redigida (em
      tom provisório) na seção "Limitações que assumimos" da página "Como
      produzimos" do mockup; falta a versão final e o DOI
- [ ] DOI via Zenodo

## Dados e atribuição

- [x] Atribuição obrigatória das fontes de terceiros (INPE, MapBiomas,
      Sentinel-2/Copernicus/ESA) — presente no rodapé do mockup (aparece em
      toda tela, por ser global) e no README raiz do repositório
- [~] Imagens/rasters comprimidos em produção — **desbloqueado
      26/09/2026 (`docs/DECISIONS.md` seções 6.40/6.41)**: `run_dnbr.py`
      agora gera uma miniatura PNG colorida (já leve por natureza — 800px
      via `getThumbURL` do GEE, não GeoTIFF completo) e sobe pro
      Cloudflare R2, pros 645 municípios daqui pra frente. Código e
      schema prontos, conta/bucket R2 já criados pelo Pedro — em
      andamento: 5 rodadas de teste reais (`--municipio`) acharam e
      corrigiram 2 bugs de normalização; a 5ª ainda falhou (`R2_ACCOUNT_ID`
      não bate com nenhum ID válido), bloqueado esperando o Pedro
      reconferir esse valor específico no painel da Cloudflare

---

**Contagem atual:** 16 itens feitos, 11 parciais, 8 pendentes —
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
