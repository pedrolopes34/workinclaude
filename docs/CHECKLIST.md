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
      confirmadas por reexecução real do axe-core.

## Segurança

- [ ] HTTPS/TLS (Vercel/Netlify fornecem por padrão, mas não configurado
      ainda)
- [ ] Rate limiting na API
- [ ] Proteção contra injeção (especialmente em endpoints com parâmetros de
      busca)
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
      falta só publicar na Vercel para ativar de fato

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
- [ ] Imagens/rasters comprimidos em produção — **bloqueado, não "só
      aplicar em escala" como a redação anterior sugeria**: conferido nesta
      sessão que não existe nenhum script de compressão nem raster/GeoTIFF
      no repositório — a validação nos "5 municípios de teste" foi feita
      fora daqui, na pesquisa original. O pipeline atual (`run_dnbr.py`)
      nem exporta GeoTIFF, só calcula `area_dnbr_km2` direto no servidor do
      GEE (`reduceRegion`, ver seu próprio docstring). Esse item só fica
      acionável depois que a exportação de raster virar uma feature real do
      pipeline — não é uma pendência pequena

---

**Contagem atual:** 14 itens feitos, 10 parciais, 11 pendentes —
atualizado em 26/09/2026: as páginas "Quem somos" e "Como produzimos"
foram portadas pro produto real (`/quem-somos`, `/como-produzimos`),
fechando também o item "Endereço de contato real" que tinha virado `[~]`
na revisão anterior. Cor de ação revertida pra azul por decisão do Pedro
e mapa dNBR real adicionado na página de Pitangueiras (`docs/DECISIONS.md`
seção 6.33/7). Identidade tipográfica dos títulos (fonte AvantGarde que o
Pedro pediu) fica pendente — arquivo fornecido está corrompido sem
conserto viável, decisão de como seguir é dele (seção 6.34/7).

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
