"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-stone-500">Algo deu errado</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Não conseguimos carregar esta página
      </h1>
      <p className="max-w-sm text-stone-600 dark:text-stone-400">
        Pode ter sido uma falha temporária ao ler os dados. Tenta de novo em
        alguns segundos.
      </p>
      <button
        onClick={() => reset()}
        className="mt-2 rounded-xl bg-acento px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-acento-hover"
      >
        Tentar de novo
      </button>
    </div>
  );
}
