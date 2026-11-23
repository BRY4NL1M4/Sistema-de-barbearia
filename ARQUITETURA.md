# Arquitetura do Sistema de Agendamento para Barbearia

## Visao geral

O projeto e um sistema web PWA para agendamento de horarios em barbearia. Ele possui duas areas principais:

- Area do cliente: agenda servicos, consulta uma reserva pelo codigo, reagenda ou cancela um atendimento permitido.
- Area profissional: exige login e mostra agenda, Kanban, fidelidade e dashboard conforme o perfil logado.

O disparo automatico de mensagens por e-mail ou WhatsApp nao foi implementado, conforme decisao do projeto.

## Stack usada

- HTML: estrutura das telas, formularios, modais e navegacao.
- CSS: layout responsivo, cards, modais, agenda, Kanban e visual PWA.
- JavaScript puro: regras de negocio, estado da aplicacao, validacoes e renderizacao dinamica.
- Chart.js: graficos do dashboard.
- Service Worker: cache offline do PWA.
- Manifest Web App: instalacao como aplicativo.
- Node.js: servidor local para entregar arquivos e expor a API.
- SQLite: banco local salvo em `data/barbearia.sqlite`.

## Arquivos principais

- `index.html`: define todas as telas, formularios, modais e elementos que o JavaScript manipula.
- `styles.css`: concentra o visual do sistema, responsividade e componentes reutilizaveis.
- `app.js`: guarda o estado, regras de agenda, login, cadastros, renderizacao e eventos.
- `server.js`: cria o servidor local, entrega os arquivos estaticos e salva/carrega o estado no SQLite.
- `service-worker.js`: registra o cache do PWA.
- `manifest.webmanifest`: define nome, icone, tema e modo de abertura do app instalado.
- `BANCO_SQLITE.md`: explica como o SQLite esta integrado ao projeto.

## Fluxo do cliente

O fluxo publico segue a ordem consolidada:

1. Servico.
2. Data.
3. Horario.
4. Dados do cliente ou busca por WhatsApp cadastrado.
5. Confirmacao.

O cliente nao escolhe profissional. Ao confirmar, o sistema procura automaticamente um profissional disponivel para aquele servico, data e horario. Depois cria a reserva e gera um codigo no formato `TOWER-XXXXXX`.

O resumo lateral fica oculto no estado inicial e aparece somente enquanto o cliente esta criando o agendamento.

## Consulta, reagendamento e cancelamento

Depois de criar uma reserva, o cliente recebe um codigo. Esse codigo pode ser usado em "Meus agendamentos" para:

- visualizar dados da reserva;
- reagendar data e horario;
- cancelar o atendimento.

Cancelamentos nao apagam o registro. O status muda para `Cancelado`, liberando o horario e preservando historico.

## Logica de agenda e conflitos

A agenda trabalha com intervalos configuraveis, normalmente 30 minutos. A duracao real vem do cadastro do servico.

Exemplos:

- Corte: 30 minutos, ocupa um intervalo de 30 minutos.
- Corte + barba: 60 minutos, ocupa dois intervalos de 30 minutos.
- Servico de 50 minutos: ocupa 50 minutos reais; outro atendimento nao pode invadir esse periodo.

A funcao de conflito transforma horarios em minutos e compara intervalos. Um horario so fica disponivel quando o atendimento termina antes do fechamento e nao cruza com outro atendimento do mesmo profissional.

## Profissionais e permissoes

O sistema possui um login administrador e logins de profissionais.

- Administrador: ve todos os dados, cadastros e configuracoes.
- Profissional: ve somente a propria agenda, Kanban e dashboard.

Credenciais locais de demonstracao:

- Admin: `tower` / `2026`
- Bryan: `bryan` / `1111`
- Diego: `diego` / `2222`
- Neto: `neto` / `3333`

## Promocao e fidelidade

A area de promocao informa a regra vigente: a cada R$ 300 acumulados em atendimentos concluidos, o cliente ganha 1 corte gratis.

O cliente pode consultar pontos pelo WhatsApp cadastrado. O painel interno de fidelidade mostra pontos, progresso e beneficios liberados.

## Dashboard

O dashboard usa dados reais do estado da aplicacao e exibe:

- faturamento;
- ticket medio;
- agendamentos validos;
- comissoes geradas;
- faturamento por dia;
- servicos mais feitos;
- horarios mais procurados;
- distribuicao de clientes por faixa etaria.

Quando o login e de profissional, os indicadores consideram apenas os atendimentos daquele profissional.

## Persistencia

O app salva dados em duas camadas:

- `localStorage`: fallback imediato no navegador.
- SQLite local: fonte persistente quando o servidor Node esta aberto.

Ao carregar, o app tenta buscar `/api/state`. Se existir SQLite, ele usa o banco. Se a API nao estiver disponivel, o app continua funcionando com `localStorage`.

## PWA

O projeto possui manifest e service worker. Depois do primeiro acesso, os arquivos principais ficam em cache. O usuario pode instalar o app quando o navegador disponibiliza o evento de instalacao.

O botao de instalacao pode ser ocultado pelo usuario.
