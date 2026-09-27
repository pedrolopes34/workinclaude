"use client";

import { useState } from "react";

// URLs de imagem que vêm do R2 podem genuinamente falhar de carregar no
// navegador do visitante (bucket sem acesso público, R2_PUBLIC_URL_BASE
// mal configurado — docs/DECISIONS.md seção 6.48) mesmo tendo subido com
// sucesso no pipeline (boto3 autenticado nunca testa se o link é público).
// Em vez do ícone padrão de imagem quebrada do navegador, mostra um aviso
// discreto. Client component só por causa do onError (Server Components
// não podem receber handlers de evento).
export function ImagemComFallback({
  src,
  alt,
  className,
  mensagemFallback,
}: {
  src: string;
  alt: string;
  className?: string;
  mensagemFallback: string;
}) {
  const [falhou, setFalhou] = useState(false);

  if (falhou) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-10 text-center text-xs text-muted">
        <span>{mensagemFallback}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL vem do R2 (domínio dinâmico), plain <img> evita depender de next.config.ts saber o domínio de antemão
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFalhou(true)}
    />
  );
}
