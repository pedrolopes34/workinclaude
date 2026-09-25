# Checklist de produto profissional

Checklist aprovado para o Painel de Queimadas SP, com status atual de cada
item. Atualizar sempre que um item avançar — é a forma de acompanhar o
quanto falta antes de considerar o produto pronto para produção pública.

Legenda: `[x]` feito · `[~]` parcial (feito só no mockup ou parcialmente) ·
`[ ]` pendente.

## SEO e metadados

- [~] Meta title e meta description por página — só o global (`layout.tsx`)
      existe por enquanto; falta metadata específica em cada página
- [ ] Imagem Open Graph
- [ ] Favicon (o mockup usa um ícone genérico de artifact, não o real)
- [ ] `robots.txt`
- [ ] `sitemap.xml`

## Páginas essenciais

- [~] Página 404 personalizada — conteúdo e visual prontos no mockup
      (`#404`); falta ligar de fato no roteamento do produto real
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
- [ ] Estados de carregamento
- [ ] Estados de erro em formulários (ainda não há formulário no produto)
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

- [ ] Testes automatizados com CI/CD
- [ ] Ambiente de staging separado de produção
- [ ] Monitoramento de erros em produção
- [ ] Backup do banco espacial (Neon) e dos GeoTIFFs (Cloudflare R2)
- [~] Analytics — **decidido**: Vercel Analytics (ver `docs/DECISIONS.md`,
      2.2); `@vercel/analytics` já instalado e no `layout.tsx` do webapp;
      falta só publicar na Vercel para ativar de fato

## Documentação e citação

- [x] `CITATION.cff` — na raiz do repositório
- [x] `CHANGELOG.md` com versionamento semântico — iniciado, seção
      "Não lançado" com o que já existe
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

**Contagem atual:** 5 itens feitos, 9 parciais, 19 pendentes — atualizado em
25/09/2026, primeira sessão de código real (banco Postgres+PostGIS com
schema + seeds dos 645 municípios/63 validados, e webapp Next.js com busca
e detalhe de município). Este checklist é sobre prontidão de produção
(SEO, segurança, testes) — para o que foi implementado nesta sessão, ver
`docs/DECISIONS.md` seção 6.
