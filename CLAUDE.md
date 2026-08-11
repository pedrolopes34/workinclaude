# Instruções para o Claude neste projeto

Antes de ajudar com qualquer tarefa aqui, leia **[CONTEXTO_PROJETO.md](CONTEXTO_PROJETO.md)** — tem o resumo completo da pesquisa PIBIC/CNPq (metodologia ST-DBSCAN+dNBR, cidades já estudadas, resultados, armadilhas técnicas já resolvidas).

## Regra de segurança inegociável

**Nunca inclua comando de deleção recursiva (`rmtree`, `rm -rf`, `shutil.rmtree`, etc.) em nenhum script que aponte para um ponto de montagem de Google Drive** (`/content/gdrive`, ou qualquer caminho montado). Isso já causou perda real de dados pessoais do Pedro uma vez (recuperado da lixeira, mas não teve garantia). Se precisar "limpar" algo antes de montar, use `drive.mount(..., force_remount=True)` sozinho, ou peça para o usuário apagar manualmente a pasta específica.
