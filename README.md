# Mapa de Reparos

Central visual de processos com entrada em bolhas, mapa de etapas e cartões ligados por linhas. A base começa **sem casos**. As etapas iniciais são **Orçando → Análise → Enviado → Execução → Finalizado → Execução PR**.

## Funções

- A bolha central abre o sistema; uma bolha de etapa abre a lista dela. A tela inicial não espalha os casos.
- Pessoas autorizadas criam, consultam e editam casos, incluindo etapa, prioridade, data, endereço, descrição e observação.
- Somente o administrador pode adicionar, renomear, colorir, descrever, reordenar ou excluir etapas vazias; também pode editar o nome do sistema, o limite de dias para alerta e a quantidade de cartões visíveis no mapa.
- Administradores podem excluir casos. Editores não têm acesso às configurações.
- A sessão é feita pelo Supabase Auth. Sem sessão, a página mostra as etapas, mas não os casos. Isto é necessário para impedir que dados de imóveis e pessoas fiquem públicos quando forem cadastrados.
- O Supabase armazena tudo; não há casos fictícios, botão de restauração ou gravação de casos em `localStorage`.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html`, `src/main.js`, `src/model.js`, `src/style.css` | Interface e lógica do sistema |
| `supabase/schema.sql` | Tabelas, seis etapas iniciais, permissões RLS e função de reordenação |
| `package.json`, `package-lock.json` | Dependências fixadas e scripts |
| `.env.example` | Nomes das duas variáveis públicas necessárias |
| `test/model.test.js`, `test/schema.test.js` | Testes de lógica, SQL e permissões em PostgreSQL local |
| `INSTRUCOES_PARA_PUBLICAR.md` | Roteiro completo para o outro chat |

## Instalação local

Requer Node.js compatível com Vite 8. Copie `.env.example` para `.env.local` e substitua a URL e a chave pela URL e pela **publishable key** do seu projeto Supabase. Não use uma chave `service_role`/secret no navegador.

```bash
npm ci
npm test
npm run dev
```

## Implantação

1. Execute `supabase/schema.sql` no SQL Editor do projeto Supabase escolhido. O script não exclui dados preexistentes; em uma base nova cria **zero casos** e seis etapas.
2. Em Supabase **Authentication > Providers**, habilite Email e desative cadastro público (signups) e acesso anônimo. Em **Authentication > Users**, crie ou identifique a conta do proprietário da central e copie o UUID do usuário. Não coloque senha em repositório ou conversa.
3. No SQL Editor, substitua `UUID_DO_ADMIN` pelo UUID exato da conta e execute:

   ```sql
   insert into public.repair_members (user_id, role)
   values ('UUID_DO_ADMIN'::uuid, 'admin')
   on conflict (user_id) do update set role = excluded.role;
   ```

   Para permitir que outra pessoa trabalhe nos casos **sem** editar configurações, crie a conta dela em Authentication > Users e cadastre o UUID com `role = 'editor'`. Não adicione membros desconhecidos.
4. Verifique no SQL Editor: `select count(*) from public.repair_cases;` deve retornar `0` em instalação nova. `select name from public.repair_stages order by sort_order;` mostra as seis etapas.
5. Substitua os arquivos antigos do repositório `Reparos05-Monteiro/Process` por todos os arquivos desta entrega, preservando a estrutura de pastas, e faça commit na branch `main`. O ZIP é para transferência; **não** inclua o próprio ZIP, `node_modules`, `dist`, `.env.local`, `.git` ou `upload` no repositório. O antigo `app.js`, `styles.css` e `hub.css` da raiz foram substituídos por `src/`.
6. Na Vercel, use o projeto `process` se já estiver criado e conecte o repositório/branch `main`; evite criar um segundo projeto. Configure **Framework Preset: Vite**, **Root Directory: `./`**, **Install Command: `npm ci`**, **Build Command: `npm run build`**, **Output Directory: `dist`**. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em Production (e Preview, se usar prévias). Use a chave publishable, não service role. Reimplante após adicionar variáveis.
7. Abra o endereço publicado e teste os fluxos descritos abaixo. Confira que o projeto Vercel mostra o repositório e o commit correto.

## Conferências após publicar

| Perfil | Deve funcionar | Deve ser bloqueado |
| --- | --- | --- |
| Visitante | Ver nomes das etapas | Ler ou gravar casos; modificar configurações |
| Editor cadastrado | Criar e editar casos; mudar etapa | Adicionar, mover ou excluir etapas e configurações; excluir caso |
| Administrador cadastrado | Editar etapas e preferências; gerir casos | Excluir etapa com casos associados |

Teste com a conta administradora: entre pela bolha central, veja o mapa vazio, crie um caso temporário, mova para outra etapa, renomeie uma etapa em Configurações, reordene e confira a tela inicial. Exclua o caso temporário depois. Faça uma segunda tentativa com conta editor, se ela existir. A segurança real das operações vem das políticas do Supabase, não da ocultação de botões.

## Limites da versão

- O protótipo trabalha com uma lista compartilhada de casos para membros cadastrados. Não há histórico de alterações, anexos, notificações ou importação de planilhas nesta versão.
- Mudanças feitas em outra sessão aparecem ao recarregar a página ou clicar em **Atualizar**; esta versão não usa Supabase Realtime.
- Busca e mapa carregam os casos em páginas de 500 registros. Para volumes grandes, será melhor paginar também a interface e fazer busca no servidor.
- As configurações aceitam até 12 etapas pela interface para preservar a legibilidade do mapa. Os IDs de etapas são estáveis quando você muda seus nomes ou ordem.
- Sem URL/chave e sem aplicação do SQL/cadastro do administrador, o pacote não é um sistema em produção. A tela mostra claramente a configuração pendente em vez de simular sucesso. Os testes SQL rodam em PostgreSQL local (PGlite); a instalação no Supabase real ainda precisa ser conferida após a publicação.

## Configuração de produção do projeto Process

A instalação `ProcessDATABASE` foi conectada usando `src/public-config.js`, que contém **somente** o endereço público e a chave `sb_publishable_` do Supabase (destinados ao navegador e sujeitos às políticas RLS). Não coloque segredos de servidor no repositório. Se `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` forem definidos nas variáveis de ambiente da Vercel, eles substituem a configuração pública padrão.

Este repositório deve ser associado ao projeto existente `process` na equipe Vercel `reparos05-2577` (branch `main`, Vite, pasta `dist`). Para liberar os casos, primeiro crie um usuário em Supabase Authentication e cadastre seu UUID com papel `admin` em `repair_members`.
