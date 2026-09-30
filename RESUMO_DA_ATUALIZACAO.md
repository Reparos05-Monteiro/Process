# Atualização: login, cadastro e entrada visual

## O que entrou neste pacote

- Login e criação de conta são a primeira tela. Com confirmação de e-mail ativada no Supabase, o usuário confirma o endereço antes de fazer login.
- Uma conta nova solicita acesso e vê **Aguardando liberação**. Após a ativação inicial da conta administradora no SQL Editor, a administradora aprova editores diretamente em **Configurações**.
- A entrada em bolhas aparece somente para contas liberadas. O círculo central mede 154 px em telas largas e 126 px em telas pequenas; os ícones das etapas medem 69 px e 57 px, respectivamente. As linhas são pontilhadas e os nomes das etapas surgem ao passar o cursor (ou ficam visíveis em telas pequenas).
- Foram removidos os textos de apresentação indicados pelo proprietário. O mapa continua sem casos fictícios, e as etapas podem ser editadas pela administradora.
- O SQL inclui solicitações de acesso, políticas RLS e proteção das preferências e etapas. Os dados de casos exigem conta autorizada.

## Conferência local

`npm test`: seis testes passaram, incluindo transições de autenticação e restrições SQL/RLS locais.

`npm run build`: concluído.

As imagens `PREVIA_LOGIN.png`, `PREVIA_CADASTRO.png` e `PREVIA_ENTRADA.png` são ilustrações fiéis ao layout planejado. Elas não são capturas de um deploy conectado ao Supabase. A confirmação de e-mail e o acesso real precisam ser conferidos depois da publicação.

## Para publicar

Encaminhe este ZIP inteiro e o arquivo `INSTRUCOES_PARA_PUBLICAR.md` ao outro chat. O `README.md` detalha a ordem do deploy, o SQL único para a primeira conta administradora e a matriz de permissões. Não envie sua senha.