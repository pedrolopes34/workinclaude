# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Não lançado]

### Adicionado
- Esqueleto dos 8 componentes do projeto (`/data`, `/geodata`, `/pipeline`,
  `/webapp`, `/api`, `/tests`, `/security`, `/docs`).
- Schema do banco Postgres + PostGIS (5 tabelas + view `ano_ativo`) em
  `pipeline/db/schema.sql`.
- Seeds reais: 645 municípios de SP e os 63 municípios já validados pela
  pesquisa (dados de `Tabela_Final_63_Municipios.xlsx`), com confiabilidade
  calculada pela regra de 4 níveis já fechada.
- Webapp Next.js (App Router, TypeScript, Tailwind) com busca de município
  e página de detalhe, lendo direto do banco.
- Restyle visual da interface inspirado nos diálogos do Claude.
- Estados de carregamento e erro, 404 personalizada, metadata por página,
  `robots.txt`, `sitemap.xml` e favicon (placeholder).
- Banco de produção criado no Neon (Postgres + PostGIS), populado e
  conferido.
- `CITATION.cff` e este `CHANGELOG.md`.
- `/pipeline` real: ingestão de focos do INPE, ST-DBSCAN oficial (com
  `min_samples` calculado por município em vez de constante fixa) e
  validação de severidade do dNBR, portados dos notebooks de pesquisa e
  cobertos por 34 testes automatizados (`pytest`).
- Pipeline em produção no GitHub Actions: ingestão diária dos focos do INPE
  (satélite de referência; arquivo anual de referência nos anos fechados),
  leitura de satélite (dNBR, Sentinel-2 no Earth Engine) mensal dos 645
  municípios com miniatura no Cloudflare R2, comparação com o MapBiomas
  Fogo (Interseção, Recall e teste de permutação) e auditoria anual manual.
- Confiabilidade dos 645 municípios de 2018 a 2024 (cálculo automático com
  a mesma regra; os 63 da pesquisa em 2024 preservados e protegidos).
- Mapa do estado mês a mês (jan/2018 em diante) lado a lado com a
  confiabilidade do ano, limites municipais liga/desliga, e mapa de focos.
- Página inicial focada nos 645: busca por nome ou código IBGE, lista por
  nível de confiabilidade com a Interseção, CSV completo (município × ano).
- Página do município ano a ano e consulta por mês calculada na hora
  (2018 em diante), com link reproduzível.
- Páginas "Como produzimos", "Quem somos" e "Comparar"; imagem Open Graph;
  sitemap com os 645.
- Selos de confiabilidade sem vermelho e fonte Inter; auditoria WCAG AA nos
  dois temas e no celular.
- Verificação diária de saúde com alerta por issue; testes do webapp
  (Vitest) no CI, ao lado dos testes do pipeline (`pytest`).

### Corrigido
- Comparação com o MapBiomas tratava graus como metros (áreas zeradas).
- Rodada automática sobrescreveu parte da amostra manual; restaurada e
  protegida pela coluna `fonte`.
- Endereço público das imagens no R2; rodada mensal do dNBR com janela
  vazia no dia 1; busca que parava na 521ª sugestão; escala do mapa
  invertida no tema escuro; falhas do serviço de malhas do IBGE.

### Pendente
Ver `docs/CHECKLIST.md` (itens em aberto) e `docs/DECISIONS.md` seção 7
(nome do produto, licença e demais pontos sem decisão).
