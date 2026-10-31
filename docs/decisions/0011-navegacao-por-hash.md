# ADR-0011: Navegação por hash no lugar das rotas do 10.3

**Status:** Aceita (31/10/2026). Altera a tabela de rotas do [FRONTEND.md 10.3](../FRONTEND.md).

## Contexto
O 10.3 desenhava rotas (`/atendimento`, `/perfil`, `/console/:conversaId`) com guardas por papel. O front não tem roteador: o servidor serve só o estático, e cada papel tem uma tela principal (o console do analista é uma página só, com a conversa escolhida no estado). A T25 acrescentou a segunda página do funcionário, "Meu perfil", e precisava de navegação que respeitasse o voltar e o avançar do navegador.

## Decisão
- O funcionário navega por **hash**: `#/` (atendimento) e `#/perfil`. Um hook (`useHashPage`) lê o hash com `useSyncExternalStore`; os itens da navegação são links `<a href="#/perfil">`.
- O **papel decide a tela** depois do login (funcionário: chat; analista: console). Não há guarda de rota, porque não há rota: o servidor continua autorizando cada chamada da api pela sessão.
- Ao **sair, o hash é limpo** (`history.replaceState`): quem entra depois não cai no perfil de quem saiu.
- Com o perfil aberto, a **conversa continua montada e escondida** (atributo `hidden`, fora da tela, do foco e da árvore de acessibilidade). Desmontá-la faria o `useChat` abortar o envio em curso, e o servidor gravaria a resposta parcial do agent como final, contando no limite da sessão (RN14); o rascunho do campo, a edição do card e o "Tentar novamente" também se perderiam.
- A troca de página leva o **foco ao título** da página nova (sem roubar o foco na carga inicial), para o leitor de tela anunciar.

## Alternativas descartadas
- **React Router (ou similar):** resolveria as rotas do 10.3, mas é uma dependência e uma camada de configuração para duas páginas, e o servidor de estáticos teria de devolver o `index.html` em cada rota.
- **Estado em memória, sem URL:** mais simples, mas o voltar do navegador sairia do app e o perfil não teria endereço.
- **Rotas por caminho (`/perfil`) com `history.pushState`:** exigiria o servidor responder o `index.html` em cada caminho; o hash dispensa isso.

## Consequências
- O voltar, o avançar e o recarregar funcionam, sem rota nova no servidor.
- O console do analista continua sem endereço próprio por conversa (`/console/:conversaId` não existe). Se isso virar requisito (link para uma conversa), o hash comporta `#/console/<id>` sem trocar de abordagem.
- A conversa escondida continua recebendo o polling com um analista, então ao voltar ela já está em dia. O custo é manter o estado da conversa na memória enquanto o perfil está aberto, pequeno.
- Se as páginas do funcionário passarem de poucas, vale reavaliar um roteador de verdade.
