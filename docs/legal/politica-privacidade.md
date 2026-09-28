> **Rascunho de trabalho — não é aconselhamento jurídico.** Este texto foi
> redigido com base nas decisões já fechadas do projeto, mas precisa de
> revisão por alguém qualificado (ou pela própria UNESP, via NIT/jurídico)
> antes de ser publicado como política oficial. Pontos ainda sem decisão
> ficam marcados como `[A DEFINIR]`.

# Política de Privacidade

**Última atualização:** [A DEFINIR — data da primeira publicação]

O Painel de Queimadas SP ("o software") é um projeto de Iniciação
Científica (PIBIC/CNPq) desenvolvido na UNESP — Faculdade de Ciências e
Engenharia (Tupã-SP). Esta política explica quais dados coletamos de quem
visita ou usa o site, e como esses dados são tratados, em conformidade com
a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).

## 1. Dados que o software processa

- **Dados públicos de terceiros** (não são dados pessoais do visitante):
  focos de calor (INPE), imagens de satélite (Sentinel-2/Copernicus) e
  comparações do MapBiomas Fogo. Esses dados são públicos e usados apenas
  para gerar as análises exibidas no site.
- **Dados de navegação do visitante:** usamos o **Vercel Analytics** para
  entender quantas pessoas visitam o site e quais municípios são mais
  consultados. Essa ferramenta não usa cookies, não coleta dado pessoal
  identificável e não permite identificar visitantes individualmente — por
  isso não é necessário banner de consentimento de cookies para esse fim.
- **Consulta por mês (cálculo sob demanda):** quando o visitante pede o
  cálculo de um município num mês, guardamos o município, o ano, o mês, a
  data do pedido e o **endereço IP** de quem pediu. O IP serve só para
  limitar cada endereço a 5 consultas por hora — o cálculo usa recursos
  gratuitos de processamento, e o limite evita abuso. Ele não aparece no
  site, não vai no arquivo de dados para download e não é enviado ao
  serviço que faz o cálculo (GitHub Actions), que recebe só o município, o
  ano e o mês. O resultado da consulta (números e mapa) fica público e pode
  ser reaberto por qualquer pessoa com o link. **Prazo de guarda do IP:**
  `[A DEFINIR — hoje ele fica guardado sem prazo; proposta: apagar depois
  de 7 dias, bem além da janela de 1 hora que o limite usa]`.
- **Contato:** se o visitante enviar uma mensagem pelos e-mails de contato
  publicados no site (`oliveiralopespedro@gmail.com` ou
  `pedro-lopes.oliveira@unesp.br`), o conteúdo dessa troca é tratado como
  qualquer e-mail comum, sem uso além de responder ao contato.
- **Infraestrutura:** o site funciona sobre serviços de terceiros —
  Vercel (hospedagem), Neon (banco de dados), Cloudflare R2 (imagens) e
  GitHub Actions (processamento) —, que tratam os dados técnicos
  necessários ao funcionamento conforme as políticas de cada um.

## 2. O que não fazemos

- Não vendemos, alugamos ou compartilhamos dados de visitantes com
  terceiros para fins comerciais.
- Não criamos perfis de usuário nem exigimos cadastro para consultar os
  municípios.

## 3. Base legal e finalidade

- Métricas de visita (Vercel Analytics, agregadas e sem identificar
  ninguém): legítimo interesse em entender o uso do site para melhorá-lo.
- IP guardado na consulta por mês: legítimo interesse em proteger o
  serviço contra abuso (limite de 5 consultas por hora), pelo prazo acima.

`[Confirmar na revisão: enquadramento no art. 7º, IX, da LGPD e se cabe
aviso junto ao botão da consulta.]`

## 4. Direitos do titular (LGPD)

Qualquer pessoa pode solicitar informações sobre os dados eventualmente
tratados, correção ou exclusão, entrando em contato pelos e-mails acima.

## 5. Contato

Pedro Lopes de Oliveira — `oliveiralopespedro@gmail.com` /
`pedro-lopes.oliveira@unesp.br`.

UNESP — Faculdade de Ciências e Engenharia, Rua Domingos da Costa Lopes,
780, Jd. Itaipu, Tupã-SP, CEP 17602-496.

## 6. Alterações

Esta política pode ser atualizada conforme o projeto evolui — a data no
topo desta página sempre indica a versão mais recente.
