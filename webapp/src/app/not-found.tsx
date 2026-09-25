import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-stone-500">Erro 404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Não encontramos esta página
      </h1>
      <p className="max-w-sm text-stone-600 dark:text-stone-400">
        O município ou o endereço que você tentou acessar não existe no
        Painel de Queimadas SP.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-xl bg-acento px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-acento-hover"
      >
        Voltar para a busca
      </Link>
    </div>
  );
}
