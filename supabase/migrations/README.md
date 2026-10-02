# Migrations do Supabase

O banco de produção já possuía duas migrations históricas antes de este diretório ser versionado:

- `20260930154821 initialize_repair_process_schema`
- `20260930180227 add_signup_access_approval_flow`

O estado completo para uma instalação nova continua documentado em `../schema.sql`.
A partir de 2026-10-02, toda alteração de DDL também deve entrar neste diretório com o mesmo SQL aplicado ao Supabase de produção.
