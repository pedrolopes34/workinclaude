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
- [x] Endereço de contato real — e-mails, Lattes/LinkedIn e endereço
      institucional (UNESP FCE Tupã) presentes na página "Quem somos", no
      rodapé do mockup e nos dois textos legais

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
- [ ] Auditoria de acessibilidade nível WCAG AA

## Segurança

- [ ] HTTPS/TLS (Vercel/Netlify fornecem por padrão, mas não configurado
      ainda)
- [ ] Rate limiting na API
- [ ] Proteção contra injeção (especialmente em endpoints com parâmetros de
      busca)
- [ ] Scan de vulnerabilidade de dependências (Dependabot/`npm audit` no CI)
- [ ] Política de retenção de dados de usuário (definir o que é coletado
      antes de escrever a política)

## Testes e operação

- [~] Testes automatizados — 80 testes `pytest` cobrindo o núcleo do
      `/pipeline` (ST-DBSCAN, fórmula de `min_samples` regredida contra os
      12 casos reais, ingestão INPE incluindo a concatenação mensal→anual,
      dNBR, IoU/permutação/confiabilidade regredida contra os 5 exemplos
      documentados, validação de campo e coerção de tipo da auditoria
      anual), com CI/CD real (`.github/workflows/tests.yml`, roda a cada
      push/PR que toque `pipeline/` ou `tests/`) — falta só testes do
      `/webapp`
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
- [ ] Imagens/rasters comprimidos em produção — o processo (rasterio + PIL)
      já foi validado nos 5 municípios de teste do mockup, falta aplicar em
      escala

---

**Contagem atual:** 10 itens feitos, 10 parciais, 13 pendentes — atualizado
em 25/09/2026: banco Postgres+PostGIS com schema + seeds dos 645
municípios/63 validados, webapp Next.js com busca e detalhe de município,
SEO básico, estados de carregamento/erro/404, e primeira leva real do
`/pipeline` (ingestão INPE + ST-DBSCAN portados e testados — ver
`docs/DECISIONS.md` seção 6.12).
Este checklist é sobre prontidão de produção (SEO, segurança, testes) —
para o que foi implementado nesta sessão, ver `docs/DECISIONS.md` seção 6.
