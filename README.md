# Mapa de Reparos

Central visual de processos com login/cadastro na primeira tela, uma entrada em bolhas após a autenticação e um mapa de etapas com cartões ligados por linhas. A base começa **sem casos**. As etapas iniciais são **Orçando → Análise → Enviado → Execução → Finalizado → Execução PR**.

## Funções

- O visitante vê primeiro o login ou a criação de conta. Depois de entrar e receber acesso, vê uma entrada visual com a bolha central e as etapas. A bolha central abre o sistema; uma bolha de etapa abre a lista dela.
- A conta é criada pelo próprio usuário, com e-mail e senha. Com a confirmação por e-mail habilitada, é preciso confirmar o endereço; depois, a conta aguarda aprovação do administrador. O administrador aprova editores em **Configurações**.
- Pessoas autorizadas criam, consultam e editam casos, incluindo etapa, prioridade, data, endereço, descrição e observação.
- Somente o administrador pode adicionar, renomear, colorir, descrever, reordenar ou excluir etapas vazias; também pode editar o nome do sistema, o limite de dias para alerta e a quantidade de cartões visíveis no mapa.
- Administradores podem excluir casos. Editores não têm acesso às configurações.
- A sessão é feita pelo Supabase Auth. Sem sessão, a página mostra somente o login/cadastro; uma conta ainda não aprovada mostra a tela de espera. As políticas RLS do banco protegem casos e alterações mesmo se alguém chamar a API diretamente.
- O Supabase armazena tudo; não há casos fictícios, botão de restauração ou gravação de casos em `localStorage`.
- No mapa, a barra lateral e o cabeçalho permanecem visíveis ao rolar a página. O fluxo pode ser percorrido arrastando com o mouse ou deslizando com o dedo; os cartões continuam abrindo seus casos ao clicar. A marca temporária mostra apenas a letra R.\n- Na tela inicial autenticada, as etapas ficam fixas; apenas o destaque percorre uma etapa por vez. As linhas do núcleo permanecem discretas, enquanto uma segunda trilha conecta cada etapa à próxima. O destaque percorre o processo em ordem e envia um pulso luminoso visível de uma etapa até a seguinte, que recebe uma onda de chegada; o fundo mantém anéis e pontos sutis no mesmo padrão visual escuro.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html`, `src/main.js`, `src/model.js`, `src/style.css`, `src/refinement.css` | Interface, autenticação e lógica do sistema |
| `supabase/schema.sql` | Tabelas, seis etapas iniciais, pedidos de acesso, permissões RLS e função de reordenação |
| `package.json`, `package-lock.json` | Dependências fixadas e scripts |
| `.env.example` | Nomes das duas variáveis públicas necessárias |
| `test/model.test.js`, `test/schema.test.js`, `test/auth-flow.test.js` | Testes de lógica, SQL/RLS em PostgreSQL local e transições de autenticação simuladas |
| `PREVIA_LOGIN.png`, `PREVIA_CADASTRO.png`, `PREVIA_ENTRADA.png` | Ilustrações das três telas; a aparência final deve ser conferida no navegador após o deploy |
| `INSTRUCOES_PARA_PUBLICAR.md` | Roteiro completo para o outro chat |
| `RESUMO_DA_ATUALIZACAO.md` | Mudanças deste pacote e testes executados |

## Instalação local

Requer Node.js compatível com Vite 8. Copie `.env.example` para `.env.local` e substitua a URL e a chave pela URL e pela **publishable key** do seu projeto Supabase. Não use uma chave `service_role`/secret no navegador.

```bash
npm ci
npm test
npm run dev
```

## Implantação

1. Execute `supabase/schema.sql` no SQL Editor do projeto Supabase escolhido. O script não exclui dados preexistentes; em uma base nova cria **zero casos** e seis etapas.
2. Substitua os arquivos antigos do repositório `Reparos05-Monteiro/Process` por todos os arquivos desta entrega, preservando a estrutura de pastas, e faça commit na branch `main`. O ZIP é para transferência; **não** inclua o próprio ZIP, `node_modules`, `dist`, `.env.local`, `.git` ou `upload` no repositório. O antigo `app.js`, `styles.css` e `hub.css` da raiz foram substituídos por `src/`.
3. Na Vercel, use o projeto `process` se já estiver criado e conecte o repositório/branch `main`; evite criar um segundo projeto. Configure **Framework Preset: Vite**, **Root Directory: `./`**, **Install Command: `npm ci`**, **Build Command: `npm run build`**, **Output Directory: `dist`**. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em Production (e Preview, se usar prévias). Use a chave publishable, não service role. Reimplante após adicionar variáveis e obtenha a URL final.
4. Em Supabase **Authentication**, deixe **Allow new users to sign up** habilitado nas configurações gerais; habilite o provedor **Email** e mantenha **Confirm Email** habilitado nas opções desse provedor. Não habilite **Allow anonymous sign-ins**. Em **URL Configuration**, defina **Site URL** como a URL publicada na Vercel e inclua essa URL de callback nas **Redirect URLs** permitidas. Para testes locais, inclua também a URL local do Vite, se necessário. Confira a entrega dos e-mails de confirmação; para uso real com mais usuários, configure o SMTP do seu domínio conforme a documentação do Supabase.
5. Na URL publicada, clique em **Criar conta** e cadastre a conta do proprietário. Confirme o e-mail recebido e faça login. A tela **Aguardando liberação** exibirá o UUID da conta; confirme que ele corresponde ao usuário certo em **Authentication > Users**. Não informe a senha ao outro chat e não a coloque no repositório.
6. Para ativar **somente essa conta** como administradora, substitua `UUID_DO_ADMIN` pelo UUID conferido e execute uma única vez no SQL Editor:

   ```sql
   insert into public.repair_members (user_id, role)
   values ('UUID_DO_ADMIN'::uuid, 'admin')
   on conflict (user_id) do update set role = excluded.role;

   delete from public.repair_access_requests
   where user_id = 'UUID_DO_ADMIN'::uuid;
   ```

   Depois disso, clique em **Verificar acesso** na tela de espera. A partir dessa primeira ativação, outras pessoas poderão criar suas contas; a aprovação delas como **editor** será feita pela administradora em **Configurações > Cadastros aguardando acesso**, diretamente no sistema. Não execute SQL de concessão de administrador para terceiros. Deixe o schema `private` fora dos schemas expostos pela Data API.
7. Verifique no SQL Editor: `select count(*) from public.repair_cases;` deve retornar `0` em instalação nova. `select name from public.repair_stages order by sort_order;` mostra as seis etapas. O script usa `if not exists`, mas reaplicá-lo a uma base existente exige revisar as políticas e os dados antes; ele não apaga casos existentes.
8. Abra o endereço publicado e teste os fluxos descritos abaixo. Confira que o projeto Vercel mostra o repositório e o commit correto.

## Conferências após publicar

| Perfil | Deve funcionar | Deve ser bloqueado |
| --- | --- | --- |
| Visitante | Ver login e criar conta | Ler ou gravar casos; modificar configurações |
| Conta aguardando aprovação | Ver a tela de espera e solicitar verificação | Ver o mapa, ler casos ou editar configurações |
| Editor aprovado | Criar e editar casos; mudar etapa | Adicionar, mover ou excluir etapas e configurações; excluir caso; aprovar pessoas |
| Administrador ativado | Editar etapas e preferências; gerir casos e aprovar editores | Excluir etapa com casos associados |

Teste com a conta administradora: após o login, entre pela bolha central, veja o mapa vazio, crie um caso temporário, mova para outra etapa, renomeie uma etapa em Configurações, reordene e confira a tela inicial. Exclua o caso temporário depois. Crie uma segunda conta de teste, confirme o e-mail, aprove-a em Configurações e confira o perfil editor. A segurança real das operações vem das políticas do Supabase, não da ocultação de botões.

## Limites da versão

- O protótipo trabalha com uma lista compartilhada de casos para membros cadastrados. Não há histórico de alterações, anexos, notificações ou importação de planilhas nesta versão.
- Mudanças feitas em outra sessão aparecem ao recarregar a página ou clicar em **Atualizar**; esta versão não usa Supabase Realtime.
- Busca e mapa carregam os casos em páginas de 500 registros. Para volumes grandes, será melhor paginar também a interface e fazer busca no servidor.
- As configurações aceitam até 12 etapas pela interface para preservar a legibilidade do mapa. Os IDs de etapas são estáveis quando você muda seus nomes ou ordem.
- Sem URL/chave, aplicação do SQL e ativação da primeira conta administradora, o pacote não é um sistema em produção. A tela mostra a configuração pendente em vez de simular sucesso. Os testes SQL rodam em PostgreSQL local (PGlite); cadastro/e-mail e instalação no Supabase real ainda precisam ser conferidos após a publicação.

## Configuração desta implantação

A produção usa o projeto Supabase `ProcessDATABASE`. O arquivo `src/public-config.js` contém somente a URL pública e a chave `sb_publishable_` destinada ao navegador; as políticas RLS continuam sendo a barreira de autorização. Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` definidas na Vercel têm prioridade.

O projeto Vercel oficial é `process`, ligado a `Reparos05-Monteiro/Process` na branch `main`. A configuração de Auth (cadastro por e-mail, confirmação de e-mail, Site URL e Redirect URLs) é feita no painel do Supabase. O primeiro administrador ainda precisa ser criado pelo fluxo de cadastro e vinculado uma única vez em `repair_members` conforme a seção de implantação acima.
