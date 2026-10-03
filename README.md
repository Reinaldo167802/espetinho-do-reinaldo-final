# Espetinho do Reinaldo — V3

Sistema web/PWA base para pedidos online, produtos, pedidos, caixa e comandas.

## Rodar
1. Instale Node.js 20+.
2. `npm install`
3. `ADMIN_PASSWORD=sua_senha npm start`
4. Abra `http://localhost:3000`
5. Painel: `http://localhost:3000/admin.html`

## Railway
- Conecte este projeto a um repositório GitHub.
- Crie uma variável `ADMIN_PASSWORD` com sua senha.
- Para produção, adicione PostgreSQL no projeto e o Railway fornecerá `DATABASE_URL`; o V3 detecta PostgreSQL automaticamente.
- Após o deploy, gere um domínio público no serviço.

## Rotas
- Cliente: `/`
- Administração: `/admin.html`
- Saúde: `/api/health`


## V4 — correções de produção
- Corrigido o preparo de statements SQLite.
- Corrigida a rota curinga para Express 5.
- Senha administrativa lê `SENHA_DE_ADMINISTRADOR` (ou `ADMIN_PASSWORD`) e remove espaços acidentais.
- API administrativa aceita o cabeçalho `x-admin-password` e mantém compatibilidade com `x-senha-admin`.
- Endpoint `/api/health` informa versão, banco e se a variável de senha está configurada, sem expor a senha.
- Painel envia a senha sem espaços nas extremidades.

### Railway
Crie a variável de serviço `SENHA_DE_ADMINISTRADOR` com a senha escolhida por você. Nunca coloque a senha no código ou no GitHub.
