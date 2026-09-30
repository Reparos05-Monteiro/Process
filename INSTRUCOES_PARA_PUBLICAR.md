# Mensagem para enviar ao chat com acesso ao GitHub, Vercel e Supabase

> Tenho um ZIP completo com a nova versão do **Mapa de Reparos**. Extraia e publique esta entrega como um bloco único. No repositório `Reparos05-Monteiro/Process`, substitua os arquivos antigos na branch `main` pela estrutura do ZIP e remova `app.js`, `styles.css` e `hub.css` da raiz. Não suba o próprio ZIP, `node_modules`, `dist`, `.env.local`, arquivos de `upload` nem credenciais. Confirme o SHA do commit.
>
> No projeto Supabase escolhido, execute `supabase/schema.sql` no SQL Editor. Revise grants e RLS. O banco novo deve ter seis etapas e **zero casos** (`select count(*) from public.repair_cases;`). O schema `private` não pode constar entre os schemas expostos na Data API. Não crie casos fictícios nem remova dados reais de um projeto preexistente.
>
> Na Vercel, use o projeto `process` já existente, se houver, conectado ao repositório acima e à branch `main`. Configure Vite, diretório raiz `./`, instalação `npm ci`, build `npm run build`, saída `dist`. Defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para Production (e Preview se for usar). Somente a chave pública publishable pode entrar no frontend. Reimplante e me mande a URL publicada.
>
> Em Supabase Authentication, habilite **Allow new users to sign up**, o provedor Email e **Confirm Email**; deixe login anônimo desabilitado. Ajuste Site URL e Redirect URLs para a URL publicada e confira a entrega dos e-mails. A primeira tela deve ser **Entrar / Criar conta**; após autenticação e autorização, deve aparecer a entrada em bolhas, com o círculo central pequeno; ao entrar nela, o mapa de casos estará vazio. Sem autorização, a pessoa deve ver **Aguardando liberação**.
>
> Eu criarei minha própria conta na URL publicada, confirmarei meu e-mail e informarei o UUID exibido na tela de espera para ativação. Confira o UUID em Authentication > Users e execute **somente para minha conta** o SQL de `role = 'admin'` que está no README. Nunca invente conta, e-mail ou senha. Após essa ativação única, eu poderei aprovar contas de editores e mudar etapas/preferências no próprio sistema, sem editar código. Não conceda o papel de administrador a outras pessoas.
>
> Rode `npm test` e `npm run build`; teste cadastro e confirmação reais, login, aprovação de um editor, mapa inicialmente vazio, criação/edição/mudança de etapa de um caso temporário, edição/reordenação de etapas pelo administrador, e bloqueios de editor/visitante. Exclua o caso temporário ao final. Envie a URL publicada, o SHA do commit, o resultado dos testes e qualquer configuração pendente. O README do ZIP contém os comandos e a matriz de permissões.

Envie o ZIP inteiro junto com esta mensagem. A senha deve ficar apenas no formulário seguro do sistema.