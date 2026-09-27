import type { Metadata } from "next";
import Image from "next/image";
import { Hero } from "@/components/Hero";

export const metadata: Metadata = {
  title: "Quem somos — Painel de Queimadas SP",
  description:
    "Painel de Queimadas SP é a extensão pública de uma Iniciação Científica (PIBIC/CNPq) conduzida por Pedro Lopes de Oliveira, com orientação da Profa. Dra. Ana Claudia de Jesus Golzio, na UNESP — Faculdade de Ciências e Engenharia (Tupã-SP).",
};

const CONTATOS = [
  { rotulo: "E-mail pessoal", valor: "oliveiralopespedro@gmail.com" },
  { rotulo: "E-mail institucional", valor: "pedro-lopes.oliveira@unesp.br" },
  {
    rotulo: "Currículo Lattes",
    valor: "lattes.cnpq.br/3280133987837156",
    href: "https://lattes.cnpq.br/3280133987837156",
  },
  {
    rotulo: "LinkedIn",
    valor: "linkedin.com/in/pedro-lopes-de-oliveira-42b492338",
    href: "https://www.linkedin.com/in/pedro-lopes-de-oliveira-42b492338",
  },
];

export default function QuemSomosPage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="Quem somos"
        titulo="Uma pesquisa de graduação, agora aberta ao público"
        descricao="Este software nasce de uma Iniciação Científica em andamento na UNESP, no grupo de pesquisa SINACI, com orientação acadêmica formal."
      />

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Responsável pelo projeto</h2>
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-start">
          <Image
            src="/equipe/pedro.jpg"
            alt="Foto de Pedro Lopes de Oliveira"
            width={354}
            height={440}
            sizes="(min-width: 640px) 144px, 120px"
            className="h-36 w-28 shrink-0 rounded-2xl object-cover sm:h-44 sm:w-36"
            priority
          />
          <div>
            <h3 className="text-xl font-bold text-foreground">Pedro Lopes de Oliveira</h3>
            <p className="mt-1 text-sm text-muted">
              Graduando em Engenharia de Biossistemas · UNESP — Faculdade de Ciências e Engenharia (Tupã-SP)
            </p>
            <p className="mt-4 text-sm text-muted">
              Cursa atualmente o 6º termo de Engenharia de Biossistemas na UNESP. Desde 2024, desenvolve
              iniciação científica (PIBIC/CNPq) em geoprocessamento e sensoriamento remoto aplicados à dinâmica de
              queimadas no estado de São Paulo. Também atuou em extensão universitária em pecuária leiteira e na
              organização de eventos acadêmicos.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Orientação</h2>
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-start">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-background text-lg font-semibold text-muted"
          >
            AG
          </span>
          <div>
            <h3 className="text-xl font-bold text-foreground">Profa. Dra. Ana Claudia de Jesus Golzio</h3>
            <p className="mt-1 text-sm text-muted">
              Professora Assistente Doutora · Departamento de Engenharia de Biossistemas · UNESP — Faculdade de
              Ciências e Engenharia (Tupã-SP)
            </p>
            <p className="mt-4 text-sm text-muted">
              Graduada em Matemática (Unesp, 2008), mestre (Unesp, 2011) e doutora (Unicamp, 2017) em Lógica, com
              pós-doutorados na Unicamp (CNPq) e na Unesp (Fapesp). Aprovada em concurso na área de Inteligência
              Artificial e Aprendizado de Máquina, atua em fundamentos da computação, lógicas não-clássicas, lógica
              fuzzy, análise de dados, big data e inteligência artificial. Coordena o grupo de pesquisa SINACI e
              integra o grupo SALCI, ambos vinculados ao CNPq, e o corpo editorial do South American Journal of Logic.
            </p>
            <a
              href="http://lattes.cnpq.br/2084125874050824"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-semibold text-acento-texto hover:underline"
            >
              Currículo Lattes →
            </a>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Grupo de pesquisa</h2>
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center">
          <Image
            src="/equipe/sinaci.webp"
            alt="Logo do grupo de pesquisa SINACI"
            width={320}
            height={320}
            sizes="112px"
            className="h-28 w-28 shrink-0 rounded-2xl"
          />
          <div>
            <h3 className="text-lg font-bold text-foreground">SINACI</h3>
            <p className="mt-1 text-sm text-muted">
              Sistemas Não-Clássicos Aplicados à Computação Inteligente — grupo de pesquisa da UNESP vinculado ao
              CNPq, coordenado pela Profa. Dra. Ana Claudia de Jesus Golzio. É nele que esta Iniciação Científica é
              desenvolvida.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Da pesquisa ao software</h2>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm text-muted">
            A metodologia usada neste site — agrupamento espaço-temporal de focos de calor
            (ST-DBSCAN) combinado à leitura de satélite (dNBR), validada contra o MapBiomas Fogo —
            foi desenvolvida e testada academicamente ao longo dessa Iniciação Científica, hoje já
            aplicada a 63 municípios paulistas. Este software é a extensão pública dessa pesquisa:
            uma forma de tornar os resultados acessíveis além do ambiente acadêmico, para
            produtores rurais, brigadistas e qualquer pessoa interessada.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Contato</h2>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {CONTATOS.map((c) => (
            <div key={c.rotulo} className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-acento" />
              <div>
                <p className="text-sm font-semibold text-foreground">{c.rotulo}</p>
                {c.href ? (
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tabular-nums text-sm text-acento-texto hover:underline"
                  >
                    {c.valor}
                  </a>
                ) : (
                  <p className="tabular-nums text-sm text-muted">{c.valor}</p>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3 px-4 py-3.5">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-acento" />
            <div>
              <p className="text-sm font-semibold text-foreground">Endereço institucional</p>
              <p className="text-sm text-muted">
                UNESP · Faculdade de Ciências e Engenharia
                <br />
                Rua Domingos da Costa Lopes, 780 · Jd. Itaipu · Tupã-SP · CEP 17602-496
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
