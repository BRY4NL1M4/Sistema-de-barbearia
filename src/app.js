 

// Chave usada para salvar o estado completo no localStorage.
const storeKey = "barbeariaTower.v1";
// Guarda a preferencia do usuario quando ele decide ocultar o lembrete de instalacao do PWA.
const installDismissKey = "barbeariaTower.installDismissed";
// Endpoint usado pelo servidor Node local para gravar e carregar o estado no SQLite.
const sqliteStateEndpoint = "/api/state";
// Colunas do Kanban e status possiveis de um atendimento.
const statuses = ["Agendado", "Em atendimento", "Concluido", "Cancelado"];
// Lista historica de horarios; a versao final usa makeSlots() com configuracao.
const hours = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00"];
// Guarda instancias de graficos Chart.js para destruir/recriar sem duplicar canvas.
let charts = {};
// Controla em qual etapa o cliente esta no wizard publico.
let currentPublicStep = 1;
// Guarda qual subtela de cadastro esta ativa no painel do usuario.
let currentRegisterTab = "clientes";
// Define se o cliente publico esta buscando cadastro existente ou criando novo.
let publicClientMode = "existing";
// Guarda o id do cliente encontrado pelo WhatsApp durante o agendamento publico.
let selectedPublicClientId = null;
// Callback temporario usado pelo modal de confirmacao.
let pendingConfirm = null;
// Dados temporarios de edicao no modal de cadastros.
let editingRegister = null;
// Guarda o evento de instalacao do PWA ate o usuario clicar no botao "Instalar app".
let deferredInstallPrompt = null;
// Guarda o atendimento aberto pela consulta publica por codigo.
let selectedLookupAppointmentId = null;

// Atalhos pequenos para consultar DOM, data atual, moeda, ids e classes CSS.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const todayIso = () => new Date().toISOString().slice(0, 10);
const money = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
const cls = (value) => value.replace(/\s+/g, "-");
const generateAppointmentCode = () => `TOWER-${uid().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
// Usuarios locais: o administrador enxerga tudo; cada profissional ve apenas seu proprio contexto.
const users = [
  { user: "tower", password: "2026", role: "admin", name: "Administrador", barberId: null },
  { user: "bryan", password: "1111", role: "professional", name: "Bryan Tower", barberId: "b1" },
  { user: "diego", password: "2222", role: "professional", name: "Diego Navalha", barberId: "b2" },
  { user: "neto", password: "3333", role: "professional", name: "Neto Fade", barberId: "b3" }
];
let currentUser = JSON.parse(sessionStorage.getItem("towerUser") || "null");
let adminAuthenticated = Boolean(currentUser);


/**
 * Centraliza as configuracoes iniciais da barbearia.
 * Esses valores sao usados quando o navegador ainda nao possui dados salvos.
 * Tambem servem como fallback quando alguma configuracao antiga estiver incompleta.
 */
function defaultSettings() {
  return {
    shopName: "Barbearia Tower",
    openTime: "09:00",
    closeTime: "19:00",
    slotInterval: 30,
    pointsPerCurrency: 1,
    couponThreshold: 300,
    closedDays: [0]
  };
}


/**
 * Normaliza o objeto principal de dados antes de qualquer renderizacao ou gravacao.
 * A funcao garante que settings, clientes, profissionais, servicos e agendamentos sempre existam.
 * Isso evita erros quando o banco SQLite, o localStorage ou dados antigos nao possuem campos novos.
 */
function normalizeState(data) {
  const normalized = data || initialData();
  normalized.settings = { ...defaultSettings(), ...(normalized.settings || {}) };
  normalized.clients = normalized.clients || [];
  normalized.barbers = normalized.barbers || [];
  normalized.services = normalized.services || [];
  normalized.appointments = normalized.appointments || [];
  normalized.services.forEach((service) => {
    const name = (service.name || "").toLowerCase();
    if (name.includes("corte") && !name.includes("barba")) service.duration = 30;
    if (name.includes("corte") && name.includes("barba")) service.duration = 60;
  });
  normalized.appointments.forEach((appointment) => {
    if (!appointment.code) appointment.code = generateAppointmentCode();
  });
  return normalized;
}

/**
 * Cria a base inicial usada na primeira execucao do sistema.
 * Contem registros de exemplo realistas para clientes, profissionais, servicos e agenda.
 * Esses dados permitem abrir o aplicativo ja com conteudo para testar todos os fluxos.
 */
const initialData = () => ({
  clients: [
    { id: "c1", name: "Lucas Andrade", phone: "(11) 98888-1020", birthdate: "1998-04-12", email: "lucas@email.com", coupons: [] },
    { id: "c2", name: "Marcos Lima", phone: "(11) 97777-3344", birthdate: "1994-09-21", email: "marcos@email.com", coupons: [] },
    { id: "c3", name: "Joao Pedro", phone: "(11) 96666-8484", birthdate: "", email: "", coupons: [] },
    { id: "c4", name: "Rafael Costa", phone: "(11) 95555-1212", birthdate: "", email: "", coupons: [] }
  ],
  barbers: [
    { id: "b1", name: "Bryan Tower", commission: 45 },
    { id: "b2", name: "Diego Navalha", commission: 40 },
    { id: "b3", name: "Neto Fade", commission: 35 }
  ],
  services: [
    { id: "s1", name: "Corte degrade", price: 55, duration: 30 },
    { id: "s2", name: "Barba completa", price: 35, duration: 30 },
    { id: "s3", name: "Corte + barba", price: 85, duration: 60 },
    { id: "s4", name: "Sobrancelha", price: 20, duration: 15 }
  ],
  appointments: [
    { id: "a1", code: "TOWER-LUCAS1", clientId: "c1", barberId: "b1", serviceId: "s1", date: todayIso(), time: "10:00", status: "Agendado", notes: "Cliente prefere maquina baixa.", completedAt: null },
    { id: "a2", code: "TOWER-MARCOS", clientId: "c2", barberId: "b2", serviceId: "s3", date: todayIso(), time: "11:30", status: "Em atendimento", notes: "", completedAt: null },
    { id: "a3", code: "TOWER-JOAO01", clientId: "c3", barberId: "b1", serviceId: "s2", date: todayIso(), time: "14:00", status: "Concluido", notes: "", completedAt: todayIso() },
    { id: "a4", code: "TOWER-RAFAEL", clientId: "c4", barberId: "b3", serviceId: "s4", date: todayIso(), time: "16:30", status: "Agendado", notes: "", completedAt: null }
  ],
  settings: defaultSettings()
});

// Estado vivo do app: tudo que muda na tela nasce daqui e volta para saveState().
let state = loadState();


/**
 * Carrega o estado salvo no navegador como fallback imediato.
 * O carregamento principal em SQLite acontece depois, por hydrateSqliteState().
 * Se nao houver dados persistidos, inicia o sistema com initialData().
 * Se o JSON salvo estiver corrompido, tambem volta para os dados iniciais para manter o app utilizavel.
 */
function loadState() {
  const saved = localStorage.getItem(storeKey);
  if (!saved) return normalizeState(initialData());
  try { return normalizeState(JSON.parse(saved)); } catch { return normalizeState(initialData()); }
}


/**
 * Persiste o estado atual depois de qualquer operacao que altere dados.
 * Primeiro normaliza o objeto, depois salva no localStorage e envia para a API SQLite.
 * E chamada apos cadastros, agendamentos, mudancas de status, configuracoes e reagendamentos.
 */
function saveState() {
  state = normalizeState(state);
  localStorage.setItem(storeKey, JSON.stringify(state));
  syncSqliteState(state);
}


/**
 * Busca o estado salvo no SQLite por meio da API local do servidor Node.
 * Se a API estiver disponivel, ela passa a ser a fonte principal dos dados.
 * Se a API responder 404, o estado atual e gravado no SQLite como primeira carga.
 */
async function hydrateSqliteState() {
  try {
    const response = await fetch(sqliteStateEndpoint, { headers: { Accept: "application/json" } });
    if (response.status === 404) {
      await syncSqliteState(state);
      return;
    }
    if (!response.ok) return;
    state = normalizeState(await response.json());
    localStorage.setItem(storeKey, JSON.stringify(state));
    syncSqliteState(state);
    render();
  } catch {
    // Quando o app roda como arquivo estatico ou na Vercel, a API SQLite pode nao existir.
  }
}

/**
 * Envia uma copia normalizada do estado atual para o servidor salvar no SQLite.
 * O envio e assincrono para nao travar a interface depois de cada acao do usuario.
 * Se a API nao estiver ativa, o localStorage continua mantendo o app utilizavel.
 */
async function syncSqliteState(data) {
  try {
    await fetch(sqliteStateEndpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeState(data))
    });
  } catch {
    // localStorage permanece como fallback quando a API SQLite nao estiver aberta.
  }
}


/**
 * Busca um registro pelo id dentro de uma colecao do estado.
 * E usada para relacionar agendamentos com cliente, profissional e servico.
 * Recebe o nome da colecao e o id procurado, retornando o item correspondente.
 */
function byId(collection, id) {
  return state[collection].find((item) => item.id === id);
}


/**
 * Indica se o usuario logado e administrador.
 * Administrador pode acessar cadastros, configuracoes e todos os profissionais.
 * Profissionais ficam restritos a agenda, dashboard e atendimentos do proprio cadastro.
 */
function isAdminUser() {
  return currentUser?.role === "admin";
}


/**
 * Retorna o id do profissional ligado ao login atual.
 * Para administrador, nao existe filtro obrigatorio e a funcao retorna null.
 * Esse valor e usado para filtrar agenda, Kanban, fidelidade e dashboard.
 */
function activeProfessionalId() {
  return currentUser?.role === "professional" ? currentUser.barberId : null;
}


/**
 * Verifica se um atendimento pertence ao contexto que o usuario pode visualizar.
 * Administrador ve todos; profissional ve somente agendamentos do proprio barbeiro.
 * Centralizar essa regra evita vazamento de informacao entre perfis.
 */
function canSeeAppointment(appointment) {
  const professionalId = activeProfessionalId();
  return !professionalId || appointment.barberId === professionalId;
}


/**
 * Exibe uma mensagem temporaria no topo da interface.
 * Centraliza feedbacks como login realizado, horario indisponivel ou cadastro salvo.
 * Depois de alguns segundos, a mensagem e escondida automaticamente.
 */
function showNotice(text) {
  const notice = $("#notice");
  notice.textContent = text;
  notice.hidden = false;
  setTimeout(() => { notice.hidden = true; }, 3600);
}


/**
 * Funcao principal de atualizacao da tela.
 * Sempre que o estado muda, render() redesenha selects, agenda, Kanban, cadastros, fidelidade, dashboard e configuracoes.
 * Esse padrao evita atualizar partes isoladas manualmente e mantem a interface sincronizada.
 */
function render() {
  fillSelects();
  renderPublic();
  renderAgenda();
  renderKanban();
  renderRegistries();
  renderLoyalty();
  renderDashboard();
}


/**
 * Preenche campos select com dados atuais de clientes, profissionais e servicos.
 * Tambem atualiza filtros da agenda e opcoes do formulario publico.
 * Deve rodar sempre que um cadastro novo for criado ou editado.
 */
function fillSelects() {
  const barberFilter = $("#scheduleBarber");
  const current = barberFilter.value;
  barberFilter.innerHTML = `<option value="">Todos</option>` + state.barbers.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  barberFilter.value = current;

  const clientOptions = state.clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  const barberOptions = state.barbers.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  const serviceOptions = state.services.map((s) => `<option value="${s.id}">${s.name} - ${money(s.price)}</option>`).join("");
  $('#appointmentForm [name="clientId"]').innerHTML = clientOptions;
  $('#appointmentForm [name="barberId"]').innerHTML = barberOptions;
  $('#appointmentForm [name="serviceId"]').innerHTML = serviceOptions;
  $('#publicAppointmentForm [name="barberId"]').innerHTML = `<option value="">Qualquer profissional disponível</option>` + barberOptions;
  $('#publicAppointmentForm [name="serviceId"]').innerHTML = serviceOptions;
}


/**
 * Atualiza a area publica de agendamento do cliente.
 * Renderiza os cards de servico, marca o servico selecionado e recalcula o resumo.
 * Tambem chama renderPublicTimes() para manter horarios disponiveis coerentes com a escolha atual.
 */
function renderPublic() {
  $("#publicServices").innerHTML = state.services.map((service) => `
    <button class="service-card" type="button" data-public-service="${service.id}">
      <strong>${service.name}</strong>
      <span>${money(service.price)} · ${service.duration} min</span>
    </button>
  `).join("");
  $$("[data-public-service]").forEach((button) => button.addEventListener("click", () => {
    $('#publicAppointmentForm [name="serviceId"]').value = button.dataset.publicService;
    showNotice("Servico selecionado.");
  }));
  renderPublicTimes();
}


/**
 * Filtra os agendamentos exibidos na agenda administrativa.
 * Considera data, profissional, status e texto digitado na busca.
 * A busca compara nome do cliente, telefone e nome do servico.
 */
function filteredAppointments() {
  const date = $("#scheduleDate").value;
  const barber = $("#scheduleBarber").value;
  const status = $("#scheduleStatus").value;
  return state.appointments
    .filter((a) => !date || a.date === date)
    .filter((a) => !barber || a.barberId === barber)
    .filter((a) => !status || a.status === status)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}


/**
 * Monta o HTML de um card de atendimento.
 * O card mostra horario, cliente, servico, valor, comissao prevista, observacoes, status e botoes de acao.
 * A mesma estrutura e reutilizada na agenda e no Kanban.
 */
function appointmentCard(a) {
  const client = byId("clients", a.clientId);
  const barber = byId("barbers", a.barberId);
  const service = byId("services", a.serviceId);
  const next = a.status === "Agendado" ? "Em atendimento" : a.status === "Em atendimento" ? "Concluido" : null;
  const commission = service && barber ? service.price * barber.commission / 100 : 0;
  return `
    <article class="appt">
      <div class="time">${a.time}</div>
      <div>
        <strong>${client?.name || "Cliente removido"}</strong>
        <div class="meta">${service?.name || "Servico removido"} com ${barber?.name || "Barbeiro removido"} · ${money(service?.price || 0)}</div>
        <div class="meta">Comissao prevista: ${money(commission)}${a.notes ? ` · ${a.notes}` : ""}</div>
      </div>
      <div class="appt-actions">
        <span class="pill ${cls(a.status)}">${a.status}</span>
        <button data-client-details="${a.clientId}">Ver cliente</button>
        ${next ? `<button data-move="${a.id}" data-status="${next}">${next === "Concluido" ? "Concluir" : "Iniciar"}</button>` : ""}
        ${a.status !== "Cancelado" && a.status !== "Concluido" ? `<button data-move="${a.id}" data-status="Cancelado">Cancelar</button>` : ""}
      </div>
    </article>`;
}


/**
 * Renderiza a lista de horarios da tela Agenda.
 * Usa filteredAppointments() para respeitar filtros aplicados pelo usuario.
 * Depois de desenhar os cards, conecta os botoes de status, recibo e detalhes.
 */
function renderAgenda() {
  const appointments = filteredAppointments();
  $("#scheduleCount").textContent = `${appointments.length} registro(s)`;
  $("#scheduleList").innerHTML = appointments.length ? appointments.map(appointmentCard).join("") : empty("Nenhum horario encontrado.");
  renderSlots(appointments);
  attachMoveHandlers();
}


/**
 * Renderiza a grade lateral de disponibilidade da agenda.
 * Mostra os horarios configurados para o dia e indica quais estao livres ou ocupados.
 * Ao clicar em um horario livre, o formulario de novo atendimento e aberto com data e hora preenchidas.
 */
function renderSlots(appointments) {
  const selectedBarber = $("#scheduleBarber").value;
  const busy = new Set(appointments
    .filter((a) => a.status !== "Cancelado")
    .filter((a) => !selectedBarber || a.barberId === selectedBarber)
    .map((a) => a.time));
  $("#slotGrid").innerHTML = hours.map((hour) => `<button class="slot ${busy.has(hour) ? "busy" : ""}" data-slot="${hour}">${hour}</button>`).join("");
  $$("#slotGrid .slot").forEach((slot) => slot.addEventListener("click", () => {
    $('#appointmentForm [name="time"]').value = slot.dataset.slot;
    $('#appointmentForm [name="date"]').value = $("#scheduleDate").value || todayIso();
    $("#appointmentModal").showModal();
  }));
}


/**
 * Atualiza o select de horarios disponiveis no fluxo do cliente.
 * A disponibilidade depende de profissional, servico, data, dias fechados e conflitos com outros atendimentos.
 * Tambem mostra mensagens claras quando falta selecionar algo ou quando a barbearia esta fechada.
 */
function renderPublicTimes() {
  const form = $("#publicAppointmentForm");
  const date = $("#publicDate").value || todayIso();
  const barberId = $('[name="barberId"]', form).value;
  const booked = new Set(state.appointments
    .filter((a) => a.date === date && a.barberId === barberId && a.status !== "Cancelado")
    .map((a) => a.time));
  $("#publicTime").innerHTML = hours
    .filter((hour) => !booked.has(hour))
    .map((hour) => `<option value="${hour}">${hour}</option>`)
    .join("");
  renderBookingSummary();
}


/**
 * Monta o quadro Kanban do painel administrativo.
 * Cada coluna representa um status: Agendado, Em atendimento, Concluido ou Cancelado.
 * Ajuda o usuario a acompanhar a operacao do dia de forma visual.
 */
function renderKanban() {
  $("#kanbanBoard").innerHTML = statuses.map((status) => {
    const cards = state.appointments.filter((a) => a.status === status).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return `<section class="column">
      <h2>${status} <span>${cards.length}</span></h2>
      <div class="column-body">${cards.length ? cards.map(appointmentCard).join("") : empty("Sem itens.")}</div>
    </section>`;
  }).join("");
  attachMoveHandlers();
}


/**
 * Atualiza a tela de cadastros.
 * Renderiza listas de clientes, profissionais e servicos com botoes de visualizar, editar e excluir.
 * Os cards sao montados a partir do estado atual.
 */
function renderRegistries() {
  $("#clientList").innerHTML = state.clients.map((c) => `<div class="item"><div><strong>${c.name}</strong><span class="meta">${c.phone || "Sem telefone"}</span></div><button class="mini" data-delete="clients:${c.id}">Remover</button></div>`).join("");
  $("#barberList").innerHTML = state.barbers.map((b) => `<div class="item"><div><strong>${b.name}</strong><span class="meta">${b.commission}% de comissao</span></div><button class="mini" data-delete="barbers:${b.id}">Remover</button></div>`).join("");
  $("#serviceList").innerHTML = state.services.map((s) => `<div class="item"><div><strong>${s.name}</strong><span class="meta">${money(s.price)} · ${s.duration} min</span></div><button class="mini" data-delete="services:${s.id}">Remover</button></div>`).join("");
  $$("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteItem(button.dataset.delete)));
}


/**
 * Calcula e exibe o programa de fidelidade.
 * Considera apenas atendimentos concluidos para somar pontos.
 * Mostra progresso ate o cupom, historico e cupons registrados no cliente.
 */
function renderLoyalty() {
  $("#loyaltyList").innerHTML = state.clients.map((client) => {
    const done = state.appointments.filter((a) => a.clientId === client.id && a.status === "Concluido");
    const threshold = Number(state.settings?.couponThreshold || 300);
    const points = done.reduce((sum, a) => sum + Math.round(getAppointmentValue(a) * Number(state.settings?.pointsPerCurrency || 1)), 0);
    const coupons = Math.floor(points / threshold);
    const progress = Math.min(100, points % threshold / threshold * 100);
    const history = done.map((a) => `${formatDate(a.date)} ${a.time} - ${byId("services", a.serviceId)?.name || "Servico"}`).join("<br>");
    return `<article class="loyalty-card">
      <div>
        <strong>${client.name}</strong>
        <div class="meta">${points} pontos · ${coupons} cupom(ns) disponiveis</div>
        <div class="history">${history || "Sem servicos concluidos ainda."}</div>
      </div>
      <div>
        <div class="bar"><span style="width:${progress}%"></span></div>
        <div class="meta">${Math.round(threshold - points % threshold)} pontos ate o proximo cupom</div>
      </div>
    </article>`;
  }).join("");
}


/**
 * Atualiza indicadores gerenciais do dashboard.
 * Calcula faturamento, comissao prevista, quantidade de atendimentos e ranking de servicos.
 * Tambem aciona a criacao dos graficos visuais.
 */
function renderDashboard() {
  const visibleAppointments = state.appointments.filter(canSeeAppointment);
  const done = visibleAppointments.filter((a) => a.status === "Concluido");
  const revenue = done.reduce((sum, a) => sum + (byId("services", a.serviceId)?.price || 0), 0);
  const ticket = done.length ? revenue / done.length : 0;
  const scheduled = visibleAppointments.filter((a) => a.status !== "Cancelado").length;
  const commission = done.reduce((sum, a) => {
    const service = byId("services", a.serviceId);
    const barber = byId("barbers", a.barberId);
    return sum + ((service?.price || 0) * (barber?.commission || 0) / 100);
  }, 0);
  $("#metrics").innerHTML = [
    ["Faturamento", money(revenue)],
    ["Ticket medio", money(ticket)],
    ["Agendamentos validos", scheduled],
    ["Comissoes geradas", money(commission)]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
  drawCharts(done, visibleAppointments);
}


/**
 * Recria os graficos do dashboard com os dados atualizados.
 * Destruir graficos anteriores evita sobreposicao de canvas quando render() roda mais de uma vez.
 * Usa Chart.js para faturamento por dia e servicos mais realizados.
 */
function drawCharts(done, visibleAppointments = state.appointments.filter(canSeeAppointment)) {
  if (!window.Chart) return;
  const revenueByDay = group(done, (a) => a.date, (a) => byId("services", a.serviceId)?.price || 0);
  const services = group(done, (a) => byId("services", a.serviceId)?.name || "Servico", () => 1);
  const peakHours = group(visibleAppointments.filter((a) => a.status !== "Cancelado"), (a) => a.time, () => 1);
  const ages = groupClientsByAge(visibleAppointments);
  makeChart("revenueChart", "bar", Object.keys(revenueByDay), Object.values(revenueByDay), "R$");
  makeChart("serviceChart", "doughnut", Object.keys(services), Object.values(services), "Qtd");
  makeChart("peakHoursChart", "bar", Object.keys(peakHours), Object.values(peakHours), "Agendamentos");
  makeChart("ageChart", "doughnut", Object.keys(ages), Object.values(ages), "Clientes");
}


/**
 * Agrupa clientes por faixa etaria usando os agendamentos visiveis no dashboard.
 * Cada cliente entra uma unica vez no grafico para evitar distorcer a idade por quantidade de cortes.
 * Clientes sem data de nascimento entram na faixa "Sem data".
 */
function groupClientsByAge(appointments) {
  const clientIds = [...new Set(appointments.map((a) => a.clientId))];
  const ranges = { "Ate 20": 0, "21 a 30": 0, "31 a 40": 0, "41+": 0, "Sem data": 0 };
  clientIds.forEach((id) => {
    const client = byId("clients", id);
    if (!client?.birthdate) {
      ranges["Sem data"] += 1;
      return;
    }
    const age = Math.floor((Date.now() - new Date(`${client.birthdate}T12:00:00`).getTime()) / 31557600000);
    if (age <= 20) ranges["Ate 20"] += 1;
    else if (age <= 30) ranges["21 a 30"] += 1;
    else if (age <= 40) ranges["31 a 40"] += 1;
    else ranges["41+"] += 1;
  });
  return ranges;
}


/**
 * Cria um grafico Chart.js padronizado.
 * Recebe o id do canvas, tipo de grafico, labels, dados e titulo da serie.
 * Retorna a instancia criada para que ela possa ser destruida antes de nova renderizacao.
 */
function makeChart(id, type, labels, data, label) {
  charts[id]?.destroy();
  charts[id] = new Chart($(`#${id}`), {
    type,
    data: { labels, datasets: [{ label, data, backgroundColor: ["#d9a441", "#3578a8", "#2f8f65", "#c94c3e", "#111316"] }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}


/**
 * Agrupa uma lista em um objeto usando uma chave calculada.
 * E usado em relatorios e graficos para somar valores por data ou por servico.
 * O valueFn permite transformar cada item antes de acumular.
 */
function group(items, keyFn, valueFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + valueFn(item);
    return acc;
  }, {});
}


/**
 * Conecta eventos aos botoes renderizados dinamicamente nos cards de atendimento.
 * Como os cards sao recriados por render(), os listeners precisam ser reaplicados depois da renderizacao.
 * Controla mudanca de status, detalhes do cliente, reagendamento e recibo.
 */
function attachMoveHandlers() {
  $$("[data-move]").forEach((button) => button.addEventListener("click", () => {
    const appointment = state.appointments.find((a) => a.id === button.dataset.move);
    appointment.status = button.dataset.status;
    if (appointment.status === "Concluido") appointment.completedAt = todayIso();
    saveState();
    render();
    showNotice(appointment.status === "Concluido" ? "Atendimento concluido, comissao e pontos atualizados." : "Status atualizado.");
  }));
}


/**
 * Remove um cadastro depois de confirmacao.
 * Recebe os dados codificados no botao, identifica colecao e id, e atualiza o estado.
 * Usa confirmAction() para evitar exclusoes acidentais.
 */
function deleteItem(encoded) {
  const [collection, id] = encoded.split(":");
  const inUse = state.appointments.some((a) => a.clientId === id || a.barberId === id || a.serviceId === id);
  if (inUse) return showNotice("Este cadastro esta vinculado a agendamentos. Cancele ou conclua antes de remover.");
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState();
  render();
}


/**
 * Gera o HTML padrao para listas vazias.
 * Mantem a interface consistente quando nao ha cadastros, agendamentos ou resultados filtrados.
 * Evita deixar paineis em branco sem explicacao para o usuario.
 */
function empty(text) {
  return `<div class="item"><span class="meta">${text}</span></div>`;
}


/**
 * Formata datas ISO no padrao brasileiro.
 * Recebe uma data no formato yyyy-mm-dd e retorna dd/mm/aaaa.
 * E usada em telas, modais, recibos e relatorios.
 */
function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}


/**
 * Preenche campos select com dados atuais de clientes, profissionais e servicos.
 * Tambem atualiza filtros da agenda e opcoes do formulario publico.
 * Deve rodar sempre que um cadastro novo for criado ou editado.
 */
function fillSelects() {
  const barberFilter = $("#scheduleBarber");
  const current = barberFilter.value;
  const publicService = $('#publicAppointmentForm [name="serviceId"]').value;
  barberFilter.innerHTML = `<option value="">Todos</option>` + state.barbers.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  barberFilter.value = current;
  if (activeProfessionalId()) barberFilter.value = activeProfessionalId();

  const clientOptions = state.clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  const barberOptions = state.barbers.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  const serviceOptions = state.services.map((s) => `<option value="${s.id}">${s.name} - ${money(s.price)}</option>`).join("");
  $('#appointmentForm [name="clientId"]').innerHTML = clientOptions;
  $('#appointmentForm [name="barberId"]').innerHTML = barberOptions;
  $('#appointmentForm [name="serviceId"]').innerHTML = serviceOptions;
  $('#publicAppointmentForm [name="serviceId"]').innerHTML = serviceOptions;
  $('#publicAppointmentForm [name="serviceId"]').value = publicService || state.services[0]?.id || "";
}


/**
 * Atualiza a area publica de agendamento do cliente.
 * Renderiza os cards de servico, marca o servico selecionado e recalcula o resumo.
 * Tambem chama renderPublicTimes() para manter horarios disponiveis coerentes com a escolha atual.
 */
function renderPublic() {
  const selectedService = $('#publicAppointmentForm [name="serviceId"]').value;
  $("#publicServices").innerHTML = state.services.map((service) => `
    <button class="service-card ${service.id === selectedService ? "selected" : ""}" type="button" data-public-service="${service.id}" aria-pressed="${service.id === selectedService}">
      <strong>${service.name}</strong>
      <span>${money(service.price)} - ${service.duration} min</span>
    </button>
  `).join("");
  $$("[data-public-service]").forEach((button) => button.addEventListener("click", () => {
    $('#publicAppointmentForm [name="serviceId"]').value = button.dataset.publicService;
    renderPublic();
  }));
  renderPublicTimes();
  updatePublicStep();
  renderBookingSummary();
}


/**
 * Atualiza visualmente a etapa ativa do agendamento publico.
 * Controla os botoes do indicador de etapas e quais secoes do wizard ficam visiveis.
 * Usa currentPublicStep como fonte de verdade.
 */
function updatePublicStep() {
  $$("[data-step]").forEach((step) => step.classList.toggle("active", Number(step.dataset.step) === currentPublicStep));
  $$("[data-step-target]").forEach((button) => button.classList.toggle("active", Number(button.dataset.stepTarget) === currentPublicStep));
}


/**
 * Valida os campos obrigatorios de uma etapa especifica do wizard.
 * Na etapa de cliente existente, exige que um cadastro seja encontrado pelo WhatsApp.
 * Na etapa de novo cliente, exige nome, telefone, nascimento e email validos.
 */
function validatePublicStep(step) {
  if (step === 2 && isClosedDate($("#publicDate").value)) {
    goPublicStep(2);
    showNotice("A barbearia nao atende nesta data. Escolha outro dia.");
    return false;
  }
  if (step === 3 && !$("#publicTime").value) {
    goPublicStep(3);
    showNotice("Escolha um horario disponivel para continuar.");
    return false;
  }
  if (step === 4 && publicClientMode === "existing") {
    if (selectedPublicClientId) return true;
    if (findPublicClient()) return true;
    goPublicStep(4);
    showNotice("Busque seu cadastro pelo WhatsApp antes de continuar.");
    return false;
  }
  const fields = $$(`[data-step="${step}"] input, [data-step="${step}"] select, [data-step="${step}"] textarea`);
  const invalid = fields.find((field) => !field.disabled && !field.validity.valid);
  if (invalid) {
    goPublicStep(step);
    invalid.reportValidity();
    return false;
  }
  return true;
}


/**
 * Valida todas as etapas ate um ponto do wizard.
 * Impede que o cliente pule direto para servico ou horario sem preencher dados obrigatorios.
 * Retorna false assim que encontrar uma etapa invalida.
 */
function validatePublicUntil(step) {
  for (let index = 1; index <= step; index += 1) {
    if (!validatePublicStep(index)) return false;
  }
  return true;
}


/**
 * Move o cliente para outra etapa do passo a passo.
 * Atualiza currentPublicStep, redesenha a etapa ativa e atualiza a revisao final.
 * E chamada pelos botoes Voltar, Continuar e pelas abas do wizard.
 */
function goPublicStep(step) {
  currentPublicStep = step;
  updatePublicStep();
  renderBookingSummary();
}


/**
 * Renderiza o resumo do agendamento publico.
 * Mostra cliente, servico, profissional, data, horario, valor e duracao conforme o usuario escolhe.
 * Ajuda o cliente a revisar tudo antes de confirmar.
 */
function renderBookingSummary() {
  const form = $("#publicAppointmentForm");
  const service = byId("services", $('[name="serviceId"]', form).value);
  const barber = service && $("#publicTime").value ? byId("barbers", findAvailableBarberForSlot({
    serviceId: service.id,
    date: $("#publicDate").value || todayIso(),
    time: $("#publicTime").value
  })?.id) : null;
  const existingClient = selectedPublicClientId ? byId("clients", selectedPublicClientId) : null;
  const name = existingClient?.name || $('[name="clientName"]', form).value || "Cliente";
  const phone = existingClient?.phone || $('[name="clientPhone"]', form).value || $('[name="lookupPhone"]', form).value || "Telefone nao informado";
  const birthdate = existingClient?.birthdate || $('[name="clientBirthdate"]', form).value || "";
  const email = existingClient?.email || $('[name="clientEmail"]', form).value || "";
  const date = $("#publicDate").value ? formatDate($("#publicDate").value) : "Data pendente";
  const time = $("#publicTime").value || "Horario pendente";
  const summaryHtml = `
    <div class="summary-row"><span>Cliente</span><strong>${name}</strong></div>
    <div class="summary-row"><span>Contato</span><strong>${phone}</strong></div>
    <div class="summary-row"><span>Email</span><strong>${email || "Nao informado"}</strong></div>
    <div class="summary-row"><span>Nascimento</span><strong>${birthdate ? formatDate(birthdate) : "Nao informado"}</strong></div>
    <div class="summary-row"><span>Servico</span><strong>${service ? `${service.name} - ${money(service.price)}` : "Pendente"}</strong></div>
    <div class="summary-row"><span>Profissional</span><strong>${barber?.name || "Definido automaticamente"}</strong></div>
    <div class="summary-row"><span>Horario</span><strong>${date} - ${time}</strong></div>
  `;
  const inline = $("#bookingSummaryInline");
  if (inline) inline.innerHTML = summaryHtml;
}


/**
 * Troca a aba ativa na tela de cadastros.
 * Atualiza botoes superiores, paineis visiveis e a referencia currentRegisterTab.
 * Permite que o mesmo modal de cadastro abra com o formulario correto.
 */
function switchRegisterTab(tabId) {
  currentRegisterTab = tabId;
  $$("[data-register-tab]").forEach((button) => button.classList.toggle("active", button.dataset.registerTab === tabId));
  $$(".register-pane").forEach((pane) => pane.classList.toggle("active", pane.id === tabId));
}


/**
 * Abre o modal de cadastro ou edicao correspondente a aba atual.
 * Quando recebe um id, entra em modo de edicao e preenche o formulario com os dados existentes.
 * Quando nao recebe id, abre um formulario novo e limpo.
 */
function openRegisterModal(tabId = currentRegisterTab) {
  const titles = { clientes: "Novo cliente", profissionais: "Novo profissional", servicos: "Novo servico" };
  $("#registerModalTitle").textContent = titles[tabId] || "Novo cadastro";
  $$(".register-form").forEach((form) => form.classList.toggle("active", form.dataset.registerForm === tabId));
  $("#registerModal").showModal();
}


/**
 * Fecha um modal pelo id informado.
 * Tambem limpa estado temporario de edicao quando o modal de cadastro e fechado.
 * E usada por botoes com data-close-modal.
 */
function closeModal(id) {
  $(`#${id}`).close();
}


/**
 * Aplica mascara de WhatsApp brasileiro enquanto o usuario digita.
 * Transforma numeros soltos no formato (11) 99999 - 9999.
 * Ajuda a padronizar comparacoes e melhorar a experiencia de preenchimento.
 */
function maskPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const ddd = digits.slice(0, 2);
  const first = digits.slice(2, 7);
  const last = digits.slice(7, 11);
  let masked = "";
  if (ddd) masked = `(${ddd}`;
  if (ddd.length === 2) masked += ") ";
  if (first) masked += first;
  if (last) masked += ` - ${last}`;
  return masked;
}


/**
 * Remove tudo que nao for numero de um telefone.
 * Permite comparar telefones mesmo que tenham espacos, parenteses ou tracos diferentes.
 * E essencial para encontrar cliente existente pelo WhatsApp.
 */
function phoneDigits(value = "") {
  return value.replace(/\D/g, "");
}


/**
 * Alterna o modo do cliente publico entre cadastro existente e novo cadastro.
 * Mostra o painel correto, atualiza botoes ativos e limpa selecoes antigas quando necessario.
 * Desabilita campos da opcao oculta para que nao bloqueiem nem entrem no envio.
 */
function setPublicClientMode(mode) {
  publicClientMode = mode;
  if (mode === "new") selectedPublicClientId = null;
  $$("[data-client-mode]").forEach((button) => button.classList.toggle("active", button.dataset.clientMode === mode));
  $$("[data-client-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.clientPanel === mode));
  $$("[data-client-panel]").forEach((panel) => {
    $$("input", panel).forEach((field) => { field.disabled = panel.dataset.clientPanel !== mode; });
  });
  $('[name="lookupPhone"]').required = mode === "existing";
  $('[name="clientName"]').required = mode === "new";
  $('[name="clientPhone"]').required = mode === "new";
  $('[name="clientBirthdate"]').required = mode === "new";
  $('[name="clientEmail"]').required = mode === "new";
  renderBookingSummary();
}


/**
 * Busca cliente existente pelo WhatsApp informado.
 * Quando encontra, guarda o id em selectedPublicClientId e libera o fluxo sem pedir novo cadastro.
 * Quando nao encontra, orienta o cliente a preencher como novo cliente.
 */
function findPublicClient() {
  const lookup = $('[name="lookupPhone"]').value;
  const digits = phoneDigits(lookup);
  const result = $("#clientLookupResult");
  selectedPublicClientId = null;
  if (digits.length !== 11) {
    result.textContent = "Informe um WhatsApp completo para buscar.";
    $('[name="lookupPhone"]').reportValidity();
    return false;
  }
  const client = state.clients.find((item) => phoneDigits(item.phone) === digits);
  if (!client) {
    result.innerHTML = `Cadastro nao encontrado. <button class="inline-link" type="button" id="usePhoneForNewClient">Criar cadastro com este telefone</button>`;
    $("#usePhoneForNewClient").addEventListener("click", () => {
      $('[name="clientPhone"]').value = maskPhone(lookup);
      setPublicClientMode("new");
    });
    return false;
  }
  selectedPublicClientId = client.id;
  $('[name="clientName"]').value = client.name;
  $('[name="clientPhone"]').value = maskPhone(client.phone);
  $('[name="clientBirthdate"]').value = client.birthdate || "";
  $('[name="clientEmail"]').value = client.email || "";
  result.innerHTML = `<strong>${client.name}</strong><span>${client.phone || maskPhone(lookup)}</span>`;
  renderBookingSummary();
  return true;
}


/**
 * Abre o modal com dados completos do cliente ligado a um atendimento.
 * Mostra telefone, email, nascimento, quantidade de atendimentos, pontos e historico recente.
 * Facilita atendimento interno sem ocupar espaco no card da agenda.
 */
function openClientDetails(clientId) {
  const client = byId("clients", clientId);
  if (!client) return showNotice("Cliente nao encontrado.");
  $("#clientDetailsModal .modal-head h2").textContent = "Dados do cliente";
  const appointments = state.appointments
    .filter((a) => a.clientId === clientId)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const done = appointments.filter((a) => a.status === "Concluido");
  const points = done.reduce((sum, a) => sum + (byId("services", a.serviceId)?.price || 0), 0);
  $("#clientDetails").innerHTML = `
    <div class="detail-grid">
      <div><span>Nome</span><strong>${client.name}</strong></div>
      <div><span>Telefone</span><strong>${client.phone || "Nao informado"}</strong></div>
      <div><span>Data de nascimento</span><strong>${client.birthdate ? formatDate(client.birthdate) : "Nao informada"}</strong></div>
      <div><span>Email</span><strong>${client.email || "Nao informado"}</strong></div>
      <div><span>Pontos</span><strong>${points}</strong></div>
      <div><span>Atendimentos</span><strong>${appointments.length}</strong></div>
    </div>
    <div class="detail-history">
      ${appointments.length ? appointments.map((a) => {
        const service = byId("services", a.serviceId);
        const barber = byId("barbers", a.barberId);
        return `<div>${formatDate(a.date)} ${a.time} - ${service?.name || "Servico"} com ${barber?.name || "Profissional"} (${a.status})</div>`;
      }).join("") : "<div>Nenhum atendimento registrado.</div>"}
    </div>
  `;
  $("#clientDetailsModal").showModal();
}


/**
 * Abre um modal de visualizacao para cliente, profissional ou servico cadastrado.
 * O conteudo muda conforme o tipo de registro solicitado.
 * E usado pelos botoes Ver nas listas de cadastro.
 */
function openRegistryDetails(type, id) {
  if (type === "clients") return openClientDetails(id);
  const titles = { barbers: "Dados do profissional", services: "Dados do servico" };
  const item = byId(type, id);
  if (!item) return showNotice("Cadastro nao encontrado.");
  $("#clientDetailsModal .modal-head h2").textContent = titles[type] || "Dados do cadastro";
  if (type === "barbers") {
    const done = state.appointments.filter((a) => a.barberId === id && a.status === "Concluido");
    const commission = done.reduce((sum, a) => {
      const service = byId("services", a.serviceId);
      return sum + ((service?.price || 0) * item.commission / 100);
    }, 0);
    $("#clientDetails").innerHTML = `
      <div class="detail-grid">
        <div><span>Profissional</span><strong>${item.name}</strong></div>
        <div><span>Comissao</span><strong>${item.commission}%</strong></div>
        <div><span>Atendimentos concluidos</span><strong>${done.length}</strong></div>
        <div><span>Comissao gerada</span><strong>${money(commission)}</strong></div>
      </div>`;
  }
  if (type === "services") {
    const appointments = state.appointments.filter((a) => a.serviceId === id);
    $("#clientDetails").innerHTML = `
      <div class="detail-grid">
        <div><span>Descricao</span><strong>${item.name}</strong></div>
        <div><span>Preco</span><strong>${money(item.price)}</strong></div>
        <div><span>Tempo para fazer</span><strong>${item.duration} min</strong></div>
        <div><span>Agendamentos</span><strong>${appointments.length}</strong></div>
      </div>`;
  }
  $("#clientDetailsModal").showModal();
}


/**
 * Monta o HTML de um card de atendimento.
 * O card mostra horario, cliente, servico, valor, comissao prevista, observacoes, status e botoes de acao.
 * A mesma estrutura e reutilizada na agenda e no Kanban.
 */
function appointmentCard(a) {
  const client = byId("clients", a.clientId);
  const barber = byId("barbers", a.barberId);
  const service = byId("services", a.serviceId);
  const next = a.status === "Agendado" ? "Em atendimento" : a.status === "Em atendimento" ? "Concluido" : null;
  const commission = service && barber ? service.price * barber.commission / 100 : 0;
  return `
    <article class="appt">
      <div class="time">${a.time}</div>
      <div>
        <strong>${client?.name || "Cliente removido"}</strong>
        <div class="meta">${service?.name || "Servico removido"} com ${barber?.name || "Barbeiro removido"} - ${money(service?.price || 0)}</div>
        <div class="meta">Comissao prevista: ${money(commission)}${a.notes ? ` - ${a.notes}` : ""}</div>
      </div>
      <div class="appt-actions">
        <span class="pill ${cls(a.status)}">${a.status}</span>
        <button data-client-details="${a.clientId}">Ver cliente</button>
        ${next ? `<button data-move="${a.id}" data-status="${next}">${next === "Concluido" ? "Concluir" : "Iniciar"}</button>` : ""}
        ${a.status !== "Cancelado" && a.status !== "Concluido" ? `<button data-move="${a.id}" data-status="Cancelado">Cancelar</button>` : ""}
      </div>
    </article>`;
}


/**
 * Atualiza a tela de cadastros.
 * Renderiza listas de clientes, profissionais e servicos com botoes de visualizar, editar e excluir.
 * Os cards sao montados a partir do estado atual.
 */
function renderRegistries() {
  $("#clientList").innerHTML = state.clients.map((c) => `<div class="item"><div><strong>${c.name}</strong><span class="meta">${c.phone || "Sem telefone"}${c.email ? ` - ${c.email}` : ""}${c.birthdate ? ` - ${formatDate(c.birthdate)}` : ""}</span></div><div class="item-actions"><button class="mini" data-view-register="clients:${c.id}">Visualizar</button><button class="mini" data-delete="clients:${c.id}">Remover</button></div></div>`).join("");
  $("#barberList").innerHTML = state.barbers.map((b) => `<div class="item"><div><strong>${b.name}</strong><span class="meta">${b.commission}% de comissao</span></div><div class="item-actions"><button class="mini" data-view-register="barbers:${b.id}">Visualizar</button><button class="mini" data-delete="barbers:${b.id}">Remover</button></div></div>`).join("");
  $("#serviceList").innerHTML = state.services.map((s) => `<div class="item"><div><strong>${s.name}</strong><span class="meta">${money(s.price)} - ${s.duration} min</span></div><div class="item-actions"><button class="mini" data-view-register="services:${s.id}">Visualizar</button><button class="mini" data-delete="services:${s.id}">Remover</button></div></div>`).join("");
  $$("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteItem(button.dataset.delete)));
  $$("[data-view-register]").forEach((button) => button.addEventListener("click", () => {
    const [type, id] = button.dataset.viewRegister.split(":");
    openRegistryDetails(type, id);
  }));
}


/**
 * Calcula e exibe o programa de fidelidade.
 * Considera apenas atendimentos concluidos para somar pontos.
 * Mostra progresso ate o cupom, historico e cupons registrados no cliente.
 */
function renderLoyalty() {
  $("#loyaltyList").innerHTML = state.clients.map((client) => {
    const done = state.appointments.filter((a) => a.clientId === client.id && a.status === "Concluido");
    const points = done.reduce((sum, a) => sum + (byId("services", a.serviceId)?.price || 0), 0);
    const coupons = Math.floor(points / 300);
    const progress = Math.min(100, points % 300 / 300 * 100);
    const history = done.map((a) => `${formatDate(a.date)} ${a.time} - ${byId("services", a.serviceId)?.name || "Servico"}`).join("<br>");
    return `<article class="loyalty-card">
      <div>
        <strong>${client.name}</strong>
        <div class="meta">${points} pontos - ${coupons} cupom(ns) disponiveis</div>
        <div class="history">${history || "Sem servicos concluidos ainda."}</div>
      </div>
      <div>
        <div class="bar"><span style="width:${progress}%"></span></div>
        <div class="meta">${Math.round(300 - points % 300)} pontos ate o proximo cupom</div>
      </div>
    </article>`;
  }).join("");
}


/**
 * Alterna entre a tela Cliente e a tela Usuario.
 * Atualiza classes active do alternador e das secoes principais.
 * Quando entra no painel do usuario, tambem aplica o estado de login.
 */
function setArea(areaId) {
  $$(".area-switch button").forEach((b) => b.classList.toggle("active", b.dataset.area === areaId));
  $$(".client-app, .admin-app").forEach((area) => area.classList.toggle("active", area.id === areaId));
  applyAdminState();
  render();
}


/**
 * Controla se o painel administrativo aparece bloqueado ou liberado.
 * Usa a variavel adminAuthenticated, que vem da sessao atual do navegador.
 * Define classes locked/unlocked para o CSS mostrar login ou painel completo.
 */
function applyAdminState() {
  const admin = $("#adminApp");
  admin.classList.toggle("locked", !adminAuthenticated);
  admin.classList.toggle("unlocked", adminAuthenticated);
  $$("[data-admin-only]").forEach((button) => {
    button.hidden = adminAuthenticated && !isAdminUser();
  });
  if (adminAuthenticated && !isAdminUser()) {
    $("#scheduleBarber").disabled = true;
    $('#appointmentForm [name="barberId"]').disabled = true;
    $("#viewTitle").textContent = "Agenda do profissional";
    const activeView = $(".view.active");
    if (activeView && ["cadastros", "configuracoes"].includes(activeView.id)) {
      $$(".nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === "agenda"));
      $$(".view").forEach((view) => view.classList.toggle("active", view.id === "agenda"));
    }
  } else {
    $("#scheduleBarber").disabled = false;
    $('#appointmentForm [name="barberId"]').disabled = false;
  }
}


/**
 * Configura o envio de um formulario de cadastro.
 * Recebe o id do formulario, a colecao que sera alterada e uma funcao mapper para montar o registro.
 * A mesma estrutura atende clientes, profissionais e servicos, tanto criando quanto editando.
 */
function registerForm(id, collection, mapper) {
  $(`#${id}`).addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state[collection].push({ id: uid(), ...mapper(data) });
    event.currentTarget.reset();
    saveState();
    $("#registerModal").close();
    render();
  });
}


/**
 * Retorna o valor financeiro de um atendimento.
 * Busca o servico associado ao agendamento e usa o preco cadastrado.
 * Se o servico nao existir, retorna zero para evitar erro de calculo.
 */
function getAppointmentValue(a) {
  return byId("services", a.serviceId)?.price || 0;
}


/**
 * Calcula a comissao prevista de um atendimento.
 * Multiplica o valor do servico pelo percentual de comissao do profissional.
 * E usada em cards, dashboard e recibos.
 */
function getAppointmentCommission(a) {
  const service = byId("services", a.serviceId);
  const barber = byId("barbers", a.barberId);
  return (service?.price || 0) * (barber?.commission || 0) / 100;
}


/**
 * Gera a lista de horarios possiveis da agenda.
 * Usa abertura, fechamento e intervalo configurado em minutos.
 * Por exemplo, intervalo 30 cria 09:00, 09:30, 10:00 e assim por diante.
 */
function makeSlots(interval = Number(state.settings?.slotInterval || 30)) {
  const start = state.settings?.openTime || "09:00";
  const end = state.settings?.closeTime || "19:00";
  const toMinutes = (value) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const pad = (value) => String(value).padStart(2, "0");
  const result = [];
  for (let minute = toMinutes(start); minute <= toMinutes(end); minute += interval) {
    result.push(`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`);
  }
  return result;
}


/**
 * Converte um horario HH:mm para minutos desde meia-noite.
 * Essa conversao simplifica comparacoes matematicas entre horarios.
 * E usada principalmente nas regras de conflito de agenda.
 */
function timeToMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}


/**
 * Converte minutos desde meia-noite de volta para HH:mm.
 * Mantem zero a esquerda em hora e minuto para exibir no padrao esperado.
 * Complementa timeToMinutes() nas regras de agenda.
 */
function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}


/**
 * Calcula o intervalo real ocupado por um atendimento.
 * O inicio vem do horario escolhido e o fim vem da duracao do servico.
 * Isso permite tratar servicos de 45, 50, 75 minutos etc. sem depender apenas do intervalo visual.
 */
function appointmentRange(appointment) {
  const service = byId("services", appointment.serviceId);
  const start = timeToMinutes(appointment.time);
  const duration = Number(service?.duration || state.settings?.slotInterval || 30);
  return { start, end: start + duration };
}


/**
 * Verifica se dois intervalos de tempo se sobrepoem.
 * Retorna true quando um atendimento invade o periodo de outro.
 * E a regra central para impedir dois clientes no mesmo profissional ao mesmo tempo.
 */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}


/**
 * Valida se um novo horario conflita com atendimentos ja existentes.
 * Compara profissional, data, status e intervalo real ocupado pelo servico.
 * O parametro ignoreId permite reagendar um atendimento sem comparar ele contra ele mesmo.
 */
function hasScheduleConflict({ barberId, serviceId, date, time, ignoreId = null }) {
  if (date < todayIso()) return true;
  if (date === todayIso() && timeToMinutes(time) <= timeToMinutes(new Date().toTimeString().slice(0, 5))) return true;
  if (isClosedDate(date)) return true;
  const service = byId("services", serviceId);
  const start = timeToMinutes(time);
  const end = start + Number(service?.duration || state.settings?.slotInterval || 30);
  const close = timeToMinutes(state.settings?.closeTime || "19:00");
  if (end > close) return true;
  return state.appointments.some((appointment) => {
    if (appointment.id === ignoreId || appointment.status === "Cancelado") return false;
    if (appointment.barberId !== barberId || appointment.date !== date) return false;
    const range = appointmentRange(appointment);
    return rangesOverlap(start, end, range.start, range.end);
  });
}


/**
 * Calcula todos os horarios livres para uma combinacao de profissional, servico e data.
 * Remove horarios que terminariam depois do fechamento ou que entrariam em conflito.
 * E usada tanto no agendamento publico quanto no reagendamento administrativo.
 */
function availableSlotsFor({ barberId, serviceId, date, ignoreId = null }) {
  return makeSlots().filter((slot) => !hasScheduleConflict({ barberId, serviceId, date, time: slot, ignoreId }));
}


/**
 * Escolhe automaticamente um profissional livre para o horario solicitado pelo cliente.
 * Filtra barbeiros que nao possuem conflito e prioriza quem tem menos atendimentos no dia.
 * Assim o cliente nao precisa escolher profissional, mas a agenda continua separada internamente.
 */
function findAvailableBarberForSlot({ serviceId, date, time, ignoreId = null, preferredBarberId = "" }) {
  const available = state.barbers
    .filter((barber) => !hasScheduleConflict({ barberId: barber.id, serviceId, date, time, ignoreId }))
    .map((barber) => ({
      ...barber,
      load: state.appointments.filter((a) => a.barberId === barber.id && a.date === date && a.status !== "Cancelado").length
    }))
    .sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
  return available.sort((a, b) => (preferredBarberId && a.id === preferredBarberId ? -1 : 0) - (preferredBarberId && b.id === preferredBarberId ? -1 : 0) || a.load - b.load || a.name.localeCompare(b.name))[0] || null;
}


/**
 * Calcula horarios publicos com base em qualquer profissional disponivel.
 * Um slot so aparece para o cliente quando ao menos um profissional consegue atender todo o tempo do servico.
 * Essa regra cobre servicos de 30, 50, 60 minutos ou qualquer duracao cadastrada.
 */
function availablePublicSlots({ serviceId, date, ignoreId = null, preferredBarberId = "" }) {
  if (!serviceId || !date || isClosedDate(date)) return [];
  return makeSlots().filter((slot) => findAvailableBarberForSlot({ serviceId, date, time: slot, ignoreId, preferredBarberId }));
}


/**
 * Verifica se a data escolhida cai em um dia fechado.
 * Compara o dia da semana com a configuracao closedDays.
 * Bloqueia horarios publicos quando a barbearia nao atende naquele dia.
 */
function isClosedDate(date) {
  if (!date) return false;
  const day = new Date(`${date}T12:00:00`).getDay();
  return (state.settings?.closedDays || []).map(Number).includes(day);
}


/**
 * Atualiza textos de marca e data exibidos na interface.
 * Usa o nome configurado da barbearia para manter tela publica e painel alinhados.
 * Tambem atualiza o label de hoje na sidebar.
 */
function setBranding() {
  const name = state.settings?.shopName || "Barbearia Tower";
  document.title = name;
  $$(".brand strong, .client-hero h1").forEach((node) => { node.textContent = name; });
}


/**
 * Renderiza a grade lateral de disponibilidade da agenda.
 * Mostra os horarios configurados para o dia e indica quais estao livres ou ocupados.
 * Ao clicar em um horario livre, o formulario de novo atendimento e aberto com data e hora preenchidas.
 */
function renderSlots(appointments) {
  const selectedBarber = activeProfessionalId() || $("#scheduleBarber").value;
  const date = $("#scheduleDate").value;
  const slotHours = makeSlots();
  if (isClosedDate(date)) {
    $("#slotGrid").innerHTML = `<div class="item"><span class="meta">Barbearia fechada nesta data.</span></div>`;
    return;
  }
  $("#slotGrid").innerHTML = slotHours.map((hour) => {
    const busy = selectedBarber
      ? state.appointments.some((a) => a.barberId === selectedBarber && a.date === date && a.status !== "Cancelado" && rangesOverlap(timeToMinutes(hour), timeToMinutes(hour) + Number(state.settings.slotInterval), appointmentRange(a).start, appointmentRange(a).end))
      : appointments.some((a) => a.status !== "Cancelado" && a.time === hour);
    return `<button class="slot ${busy ? "busy" : ""}" data-slot="${hour}" ${busy ? "disabled" : ""}>${hour}</button>`;
  }).join("");
  $$("#slotGrid .slot:not(.busy)").forEach((slot) => slot.addEventListener("click", () => {
    $('#appointmentForm [name="time"]').value = slot.dataset.slot;
    $('#appointmentForm [name="date"]').value = $("#scheduleDate").value || todayIso();
    if (activeProfessionalId()) $('#appointmentForm [name="barberId"]').value = activeProfessionalId();
    $("#appointmentModal").showModal();
  }));
}


/**
 * Atualiza o select de horarios disponiveis no fluxo do cliente.
 * A disponibilidade depende de profissional, servico, data, dias fechados e conflitos com outros atendimentos.
 * Tambem mostra mensagens claras quando falta selecionar algo ou quando a barbearia esta fechada.
 */
function renderPublicTimes() {
  const form = $("#publicAppointmentForm");
  const date = $("#publicDate").value || todayIso();
  const serviceId = $('[name="serviceId"]', form).value;
  if (isClosedDate(date)) {
    $("#publicTime").innerHTML = "";
    showNotice("A barbearia nao atende nesta data.");
    renderBookingSummary();
    return;
  }
  const preferredBarberId = $('[name="barberId"]', form)?.value || "";
  const slots = availablePublicSlots({ serviceId, date, preferredBarberId });
  $("#publicTime").innerHTML = slots.length
    ? slots.map((hour) => `<option value="${hour}">${hour}</option>`).join("")
    : `<option value="">Nenhum horario livre</option>`;
  renderBookingSummary();
}


/**
 * Filtra os agendamentos exibidos na agenda administrativa.
 * Considera data, profissional, status e texto digitado na busca.
 * A busca compara nome do cliente, telefone e nome do servico.
 */
function filteredAppointments() {
  const date = $("#scheduleDate").value;
  const barber = activeProfessionalId() || $("#scheduleBarber").value;
  const status = $("#scheduleStatus").value;
  const query = ($("#scheduleSearch")?.value || "").trim().toLowerCase();
  return state.appointments
    .filter(canSeeAppointment)
    .filter((a) => !date || a.date === date)
    .filter((a) => !barber || a.barberId === barber)
    .filter((a) => !status || a.status === status)
    .filter((a) => {
      if (!query) return true;
      const client = byId("clients", a.clientId);
      const service = byId("services", a.serviceId);
      return [client?.name, client?.phone, client?.email, service?.name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}


/**
 * Monta o HTML de um card de atendimento.
 * O card mostra horario, cliente, servico, valor, comissao prevista, observacoes, status e botoes de acao.
 * A mesma estrutura e reutilizada na agenda e no Kanban.
 */
function appointmentCard(a) {
  const client = byId("clients", a.clientId);
  const barber = byId("barbers", a.barberId);
  const service = byId("services", a.serviceId);
  const next = a.status === "Agendado" ? "Em atendimento" : a.status === "Em atendimento" ? "Concluido" : null;
  return `
    <article class="appt">
      <div class="time">${a.time}</div>
      <div>
        <strong>${client?.name || "Cliente removido"}</strong>
        <div class="meta">${service?.name || "Servico removido"} com ${barber?.name || "Profissional removido"} - ${money(service?.price || 0)}</div>
        <div class="meta">Comissao prevista: ${money(getAppointmentCommission(a))}${a.notes ? ` - ${a.notes}` : ""}</div>
      </div>
      <div class="appt-actions">
        <span class="pill ${cls(a.status)}">${a.status}</span>
        <button data-client-details="${a.clientId}">Ver cliente</button>
        ${a.status !== "Concluido" && a.status !== "Cancelado" ? `<button data-reschedule="${a.id}">Reagendar</button>` : ""}
        ${next ? `<button data-move="${a.id}" data-status="${next}">${next === "Concluido" ? "Concluir" : "Iniciar"}</button>` : ""}
        ${a.status === "Concluido" ? `<button data-receipt="${a.id}">Recibo</button>` : ""}
        ${a.status !== "Cancelado" && a.status !== "Concluido" ? `<button data-move="${a.id}" data-status="Cancelado">Cancelar</button>` : ""}
      </div>
    </article>`;
}


/**
 * Renderiza a lista de horarios da tela Agenda.
 * Usa filteredAppointments() para respeitar filtros aplicados pelo usuario.
 * Depois de desenhar os cards, conecta os botoes de status, recibo e detalhes.
 */
function renderAgenda() {
  const appointments = filteredAppointments();
  $("#scheduleCount").textContent = `${appointments.length} registro(s)`;
  $("#scheduleList").innerHTML = appointments.length ? appointments.map(appointmentCard).join("") : empty("Nenhum horario encontrado.");
  renderSlots(appointments);
  attachMoveHandlers();
}


/**
 * Monta o quadro Kanban do painel administrativo.
 * Cada coluna representa um status: Agendado, Em atendimento, Concluido ou Cancelado.
 * Ajuda o usuario a acompanhar a operacao do dia de forma visual.
 */
function renderKanban() {
  $("#kanbanBoard").innerHTML = statuses.map((status) => {
    const cards = state.appointments.filter(canSeeAppointment).filter((a) => a.status === status).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return `<section class="column">
      <h2>${status} <span>${cards.length}</span></h2>
      <div class="column-body">${cards.length ? cards.map(appointmentCard).join("") : empty("Sem itens.")}</div>
    </section>`;
  }).join("");
  attachMoveHandlers();
}


/**
 * Monta e abre o recibo de um atendimento.
 * Busca cliente, profissional, servico, valor, comissao, data e horario.
 * O recibo pode ser impresso pelo botao do modal.
 */
function openReceipt(appointmentId) {
  const a = state.appointments.find((item) => item.id === appointmentId);
  if (!a) return showNotice("Atendimento nao encontrado.");
  const client = byId("clients", a.clientId);
  const barber = byId("barbers", a.barberId);
  const service = byId("services", a.serviceId);
  const points = Math.round(getAppointmentValue(a) * Number(state.settings?.pointsPerCurrency || 1));
  $("#receiptContent").innerHTML = `
    <div class="receipt">
      <strong>${state.settings.shopName}</strong>
      <span>${formatDate(a.date)} - ${a.time}</span>
      <div>Cliente: ${client?.name || "Cliente"}</div>
      <div>Profissional: ${barber?.name || "Profissional"}</div>
      <div>Servico: ${service?.name || "Servico"}</div>
      <div>Valor: ${money(getAppointmentValue(a))}</div>
      <div>Comissao: ${money(getAppointmentCommission(a))}</div>
      <div>Pontos gerados: ${points}</div>
    </div>`;
  $("#receiptModal").showModal();
}


/**
 * Abre o modal de reagendamento para um atendimento existente.
 * Preenche a data atual do atendimento e calcula novos horarios disponiveis.
 * Respeita duracao do servico, profissional, data e conflitos existentes.
 */
function openReschedule(appointmentId) {
  const a = state.appointments.find((item) => item.id === appointmentId);
  if (!a) return;
  const form = $("#rescheduleForm");
  form.appointmentId.value = a.id;
  form.date.value = a.date;
  renderRescheduleTimes(a, a.time);
  $("#rescheduleModal").showModal();
}

/** Recalcula os horarios e explica no proprio modal quando a data nao permite reagendar. */
function renderRescheduleTimes(appointment, preferredTime = "") {
  const form = $("#rescheduleForm");
  const slots = availablePublicSlots({ serviceId: appointment.serviceId, date: form.date.value, ignoreId: appointment.id });
  form.time.innerHTML = slots.length
    ? slots.map((slot) => `<option value="${slot}">${slot}</option>`).join("")
    : '<option value="">Nenhum horario disponivel</option>';
  if (slots.includes(preferredTime)) form.time.value = preferredTime;
  form.time.disabled = !slots.length;
  $('button[type="submit"]', form).disabled = !slots.length;
  const feedback = $("#rescheduleFeedback");
  feedback.hidden = Boolean(slots.length);
  feedback.textContent = slots.length ? "" : "Nao ha horarios disponiveis nesta data. Escolha outro dia.";
}


/**
 * Cancela uma reserva pela area publica depois de localizar o codigo.
 * A reserva nao e removida do historico; ela muda para status Cancelado e libera o horario.
 * Essa escolha mantem rastreabilidade para o painel interno.
 */
function cancelPublicAppointment(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return showNotice("Agendamento nao encontrado.");
  confirmAction("Cancelar agendamento", "Deseja cancelar este horario?", () => {
    appointment.status = "Cancelado";
    saveState();
    render();
    renderMyAppointments();
    showNotice("Agendamento cancelado.");
  });
}


/** Copia o codigo; a selecao manual fica disponivel se o navegador negar acesso. */
async function copyAppointmentCode(code, feedback = $("#copyCodeFeedback"), codeElement = $("#publicConfirmationContent .confirmation-code")) {
  try {
    await navigator.clipboard.writeText(code);
    feedback.textContent = "Codigo copiado!";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(codeElement);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    feedback.textContent = "Nao foi possivel copiar automaticamente. O codigo esta selecionado para copiar manualmente.";
  }
}

/**
 * Exibe os dados da reserva e permite copiar seu codigo para consultas posteriores.
 * O botao captura o codigo desta reserva, mesmo quando o modal e reutilizado.
 */
function openPublicConfirmation(appointment) {
  const client = byId("clients", appointment.clientId);
  const service = byId("services", appointment.serviceId);
  const barber = byId("barbers", appointment.barberId);
  $("#publicConfirmationContent").innerHTML = `
    <div class="confirmation-code">${appointment.code}</div>
    <div class="confirmation-copy">
      <button class="ghost" id="copyAppointmentCodeBtn" type="button">Copiar codigo</button>
      <span id="copyCodeFeedback" role="status" aria-live="polite"></span>
    </div>
    <div class="detail-grid">
      <div><span>Cliente</span><strong>${client?.name || "Cliente"}</strong></div>
      <div><span>Servico</span><strong>${service?.name || "Servico"}</strong></div>
      <div><span>Data</span><strong>${formatDate(appointment.date)}</strong></div>
      <div><span>Horario</span><strong>${appointment.time}</strong></div>
      <div><span>Profissional</span><strong>${barber?.name || "Definido automaticamente"}</strong></div>
      <div><span>Valor</span><strong>${money(getAppointmentValue(appointment))}</strong></div>
    </div>
    <p class="helper-text">Guarde este codigo para consultar, reagendar ou cancelar sua reserva.</p>`;
  $("#copyAppointmentCodeBtn").addEventListener("click", () => copyAppointmentCode(appointment.code));
  $("#publicConfirmationModal").showModal();
}


/**
 * Consulta os pontos do cliente a partir do WhatsApp informado na area de promocao.
 * Soma apenas atendimentos concluidos e compara com a meta definida nas configuracoes.
 * Retorna quanto o cliente ja acumulou e quanto falta para o proximo beneficio.
 */
function renderPromoBalance() {
  const box = $("#promoBalance");
  const digits = phoneDigits($("#promoPhone").value);
  box.hidden = false;
  const client = state.clients.find((item) => phoneDigits(item.phone) === digits);
  if (!client) {
    box.textContent = "Cliente nao encontrado para este WhatsApp.";
    return;
  }
  const done = state.appointments.filter((a) => a.clientId === client.id && a.status === "Concluido");
  const threshold = Number(state.settings?.couponThreshold || 300);
  const points = done.reduce((sum, a) => sum + Math.round(getAppointmentValue(a) * Number(state.settings?.pointsPerCurrency || 1)), 0);
  const remainder = points % threshold;
  const remaining = remainder === 0 && points >= threshold ? 0 : threshold - remainder;
  box.innerHTML = `<strong>${client.name}</strong><span>${points} pontos acumulados. ${Math.floor(points / threshold)} beneficio(s) liberado(s). ${remaining === 0 ? "Beneficio disponivel." : `Faltam ${remaining} pontos para o proximo.`}</span>`;
}


/**
 * Conecta eventos aos botoes renderizados dinamicamente nos cards de atendimento.
 * Como os cards sao recriados por render(), os listeners precisam ser reaplicados depois da renderizacao.
 * Controla mudanca de status, detalhes do cliente, reagendamento e recibo.
 */
function attachMoveHandlers() {
  $$("[data-move]").forEach((button) => button.addEventListener("click", () => {
    const appointment = state.appointments.find((a) => a.id === button.dataset.move);
    appointment.status = button.dataset.status;
    if (appointment.status === "Concluido") {
      appointment.completedAt = todayIso();
      saveState();
      render();
      openReceipt(appointment.id);
      showNotice("Atendimento concluido, comissao e pontos atualizados.");
      return;
    }
    saveState();
    render();
    showNotice("Status atualizado.");
  }));
  $$("[data-client-details]").forEach((button) => button.addEventListener("click", () => openClientDetails(button.dataset.clientDetails)));
  $$("[data-reschedule]").forEach((button) => button.addEventListener("click", () => openReschedule(button.dataset.reschedule)));
  $$("[data-receipt]").forEach((button) => button.addEventListener("click", () => openReceipt(button.dataset.receipt)));
}


/**
 * Centraliza a confirmacao de acoes sensiveis.
 * Recebe titulo, mensagem e callback que so sera executado se o usuario confirmar.
 * Evita duplicar logica de modal para excluir registros ou cancelar atendimentos.
 */
function confirmAction(title, message, action) {
  pendingConfirm = action;
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmModal").showModal();
}


/**
 * Remove um cadastro depois de confirmacao.
 * Recebe os dados codificados no botao, identifica colecao e id, e atualiza o estado.
 * Usa confirmAction() para evitar exclusoes acidentais.
 */
function deleteItem(encoded) {
  const [collection, id] = encoded.split(":");
  const inUse = state.appointments.some((a) => a.clientId === id || a.barberId === id || a.serviceId === id);
  if (inUse) return showNotice("Este cadastro esta vinculado a agendamentos. Cancele ou conclua antes de remover.");
  confirmAction("Remover cadastro", "Tem certeza que deseja remover este cadastro?", () => {
    state[collection] = state[collection].filter((item) => item.id !== id);
    saveState();
    render();
    showNotice("Cadastro removido.");
  });
}


/**
 * Abre o modal de cadastro ou edicao correspondente a aba atual.
 * Quando recebe um id, entra em modo de edicao e preenche o formulario com os dados existentes.
 * Quando nao recebe id, abre um formulario novo e limpo.
 */
function openRegisterModal(tabId = currentRegisterTab, id = null) {
  const titles = { clientes: "Cliente", profissionais: "Profissional", servicos: "Servico" };
  editingRegister = id ? { tabId, id } : null;
  $("#registerModalTitle").textContent = `${id ? "Editar" : "Novo"} ${titles[tabId].toLowerCase()}`;
  $$(".register-form").forEach((form) => {
    form.classList.toggle("active", form.dataset.registerForm === tabId);
    if (form.dataset.registerForm === tabId) form.reset();
  });
  if (id) {
    const collection = tabId === "clientes" ? "clients" : tabId === "profissionais" ? "barbers" : "services";
    const item = byId(collection, id);
    const form = $(`[data-register-form="${tabId}"]`);
    if (tabId === "clientes") {
      form.name.value = item.name || "";
      form.phone.value = item.phone || "";
      form.birthdate.value = item.birthdate || "";
      form.email.value = item.email || "";
    }
    if (tabId === "profissionais") {
      form.name.value = item.name || "";
      form.commission.value = item.commission || "";
    }
    if (tabId === "servicos") {
      form.name.value = item.name || "";
      form.price.value = item.price || "";
      form.duration.value = item.duration || "";
    }
  }
  $("#registerModal").showModal();
}


/**
 * Configura o envio de um formulario de cadastro.
 * Recebe o id do formulario, a colecao que sera alterada e uma funcao mapper para montar o registro.
 * A mesma estrutura atende clientes, profissionais e servicos, tanto criando quanto editando.
 */
function registerForm(id, collection, mapper) {
  $(`#${id}`).addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) return event.currentTarget.reportValidity();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (editingRegister) {
      const item = byId(collection, editingRegister.id);
      Object.assign(item, mapper(data));
      editingRegister = null;
    } else {
      state[collection].push({ id: uid(), ...mapper(data) });
    }
    event.currentTarget.reset();
    saveState();
    $("#registerModal").close();
    render();
  });
}


/**
 * Atualiza a tela de cadastros.
 * Renderiza listas de clientes, profissionais e servicos com botoes de visualizar, editar e excluir.
 * Os cards sao montados a partir do estado atual.
 */
function renderRegistries() {
  $("#clientList").innerHTML = state.clients.map((c) => `<div class="item"><div><strong>${c.name}</strong><span class="meta">${c.phone || "Sem telefone"}${c.email ? ` - ${c.email}` : ""}${c.birthdate ? ` - ${formatDate(c.birthdate)}` : ""}</span></div><div class="item-actions"><button class="mini" data-view-register="clients:${c.id}">Visualizar</button><button class="mini" data-edit-register="clientes:${c.id}">Editar</button><button class="mini" data-delete="clients:${c.id}">Remover</button></div></div>`).join("");
  $("#barberList").innerHTML = state.barbers.map((b) => `<div class="item"><div><strong>${b.name}</strong><span class="meta">${b.commission}% de comissao</span></div><div class="item-actions"><button class="mini" data-view-register="barbers:${b.id}">Visualizar</button><button class="mini" data-edit-register="profissionais:${b.id}">Editar</button><button class="mini" data-delete="barbers:${b.id}">Remover</button></div></div>`).join("");
  $("#serviceList").innerHTML = state.services.map((s) => `<div class="item"><div><strong>${s.name}</strong><span class="meta">${money(s.price)} - ${s.duration} min</span></div><div class="item-actions"><button class="mini" data-view-register="services:${s.id}">Visualizar</button><button class="mini" data-edit-register="servicos:${s.id}">Editar</button><button class="mini" data-delete="services:${s.id}">Remover</button></div></div>`).join("");
  $$("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteItem(button.dataset.delete)));
  $$("[data-view-register]").forEach((button) => button.addEventListener("click", () => {
    const [type, id] = button.dataset.viewRegister.split(":");
    openRegistryDetails(type, id);
  }));
  $$("[data-edit-register]").forEach((button) => button.addEventListener("click", () => {
    const [tabId, id] = button.dataset.editRegister.split(":");
    openRegisterModal(tabId, id);
  }));
}


/**
 * Recupera reservas somente quando telefone e nascimento coincidem no mesmo cadastro.
 * Os resultados usam nos de texto e permitem copiar ou consultar cada reserva encontrada.
 */
function recoverAppointmentCodes(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $("#recoverCodeFeedback");
  const results = $("#recoveredAppointments");
  results.replaceChildren();
  results.hidden = true;
  const phone = phoneDigits(form.elements.recoveryPhone.value);
  const birthdate = form.elements.recoveryBirthdate.value;
  if (phone.length !== 11 || !birthdate || birthdate > todayIso()) {
    feedback.textContent = "Informe um telefone completo e uma data de nascimento valida.";
    return;
  }
  const clientIds = new Set(state.clients.filter((client) => phoneDigits(client.phone) === phone && client.birthdate === birthdate).map((client) => client.id));
  const appointments = state.appointments.filter((appointment) => clientIds.has(appointment.clientId))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  if (!appointments.length) {
    feedback.textContent = "Nenhuma reserva encontrada com esses dados. Confira o telefone e o nascimento ou procure a barbearia.";
    return;
  }
  feedback.textContent = `${appointments.length} reserva(s) encontrada(s).`;
  results.hidden = false;
  appointments.forEach((appointment) => {
    const row = document.createElement("div");
    row.className = "recovered-appointment";
    const description = document.createElement("span");
    description.textContent = `${formatDate(appointment.date)} - ${appointment.time} - ${byId("services", appointment.serviceId)?.name || "Servico"} - ${appointment.status}`;
    const code = document.createElement("code");
    code.textContent = appointment.code;
    const actions = document.createElement("div");
    actions.className = "actions";
    const status = document.createElement("span");
    status.className = "helper-text";
    status.setAttribute("role", "status");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "mini";
    copy.textContent = "Copiar codigo";
    copy.addEventListener("click", () => copyAppointmentCode(appointment.code, status, code));
    const consult = document.createElement("button");
    consult.type = "button";
    consult.className = "mini";
    consult.textContent = "Ver agendamento";
    consult.addEventListener("click", () => {
      $("#myAppointmentsCode").value = appointment.code;
      renderMyAppointments();
      $("#myAppointmentsList").scrollIntoView({ block: "nearest" });
    });
    actions.append(copy, consult);
    row.append(description, code, actions, status);
    results.append(row);
  });
}

/** Consulta a reserva pelo codigo e oferece as acoes permitidas pelo status atual. */
function renderMyAppointments() {
  $("#myAppointmentsList").hidden = false;
  selectedLookupAppointmentId = null;
  const code = ($("#myAppointmentsCode").value || "").trim().toUpperCase();
  const appointment = state.appointments.find((item) => item.code === code);
  if (!appointment) {
    $("#myAppointmentsList").innerHTML = `<div class="item"><span class="meta">Nenhum agendamento encontrado para este codigo.</span></div>`;
    return;
  }
  selectedLookupAppointmentId = appointment.id;
  const client = byId("clients", appointment.clientId);
  const service = byId("services", appointment.serviceId);
  const barber = byId("barbers", appointment.barberId);
  const canManage = appointment.status !== "Cancelado" && appointment.status !== "Concluido";
  $("#myAppointmentsList").innerHTML = `
    <div class="item">
      <div>
        <strong>${formatDate(appointment.date)} - ${appointment.time}</strong>
        <span class="meta">${client?.name || "Cliente"} - ${service?.name || "Servico"} - ${barber?.name || "Profissional"} - ${appointment.status}</span>
        <span class="meta">Codigo: ${appointment.code}</span>
      </div>
      <div class="item-actions">
        ${canManage ? `<button class="mini" data-public-reschedule="${appointment.id}">Reagendar</button><button class="mini" data-public-cancel="${appointment.id}">Cancelar</button>` : ""}
      </div>
    </div>`;
  $$("[data-public-reschedule]").forEach((button) => button.addEventListener("click", () => openReschedule(button.dataset.publicReschedule)));
  $$("[data-public-cancel]").forEach((button) => button.addEventListener("click", () => cancelPublicAppointment(button.dataset.publicCancel)));
}


/**
 * Preenche o formulario de configuracoes com os valores salvos.
 * Marca dias fechados, horarios, intervalo e regras de pontuacao.
 * Garante que a tela sempre reflita o estado atual antes de editar.
 */
function renderSettingsForm() {
  const form = $("#settingsForm");
  if (!form) return;
  form.shopName.value = state.settings.shopName;
  form.openTime.value = state.settings.openTime;
  form.closeTime.value = state.settings.closeTime;
  form.slotInterval.value = state.settings.slotInterval;
  form.pointsPerCurrency.value = state.settings.pointsPerCurrency;
  form.couponThreshold.value = state.settings.couponThreshold;
  Array.from(form.querySelectorAll('[name="closedDays"]')).forEach((option) => {
    option.checked = state.settings.closedDays.map(Number).includes(Number(option.value));
  });
}


/**
 * Exporta a agenda filtrada para um arquivo CSV.
 * Inclui data, hora, cliente, telefone, profissional, servico, status, valor e comissao.
 * Usa Blob e URL temporaria para baixar o arquivo direto no navegador.
 */
function exportCsv() {
  const rows = [["Data", "Hora", "Cliente", "Telefone", "Servico", "Profissional", "Status", "Valor"]];
  state.appointments.forEach((a) => {
    rows.push([
      a.date,
      a.time,
      byId("clients", a.clientId)?.name || "",
      byId("clients", a.clientId)?.phone || "",
      byId("services", a.serviceId)?.name || "",
      byId("barbers", a.barberId)?.name || "",
      a.status,
      getAppointmentValue(a)
    ]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-bearbearia-tower.csv";
  link.click();
  URL.revokeObjectURL(url);
}


/**
 * Gera uma janela de impressao com relatorio da agenda filtrada.
 * Monta uma tabela HTML simples para facilitar impressao ou salvar como PDF.
 * Reutiliza os mesmos filtros aplicados na tela Agenda.
 */
function printReport() {
  const done = state.appointments.filter((a) => a.status === "Concluido");
  const revenue = done.reduce((sum, a) => sum + getAppointmentValue(a), 0);
  const win = window.open("", "_blank");
  win.document.write(`<title>Relatorio</title><body><h1>${state.settings.shopName}</h1><p>Faturamento: ${money(revenue)}</p><p>Atendimentos concluidos: ${done.length}</p></body>`);
  win.document.close();
  win.print();
}


/**
 * Funcao principal de atualizacao da tela.
 * Sempre que o estado muda, render() redesenha selects, agenda, Kanban, cadastros, fidelidade, dashboard e configuracoes.
 * Esse padrao evita atualizar partes isoladas manualmente e mantem a interface sincronizada.
 */
function render() {
  state = normalizeState(state);
  setBranding();
  fillSelects();
  renderPublic();
  renderAgenda();
  renderKanban();
  renderRegistries();
  renderLoyalty();
  renderDashboard();
  renderSettingsForm();
}


/**
 * Conecta eventos aos botoes renderizados dinamicamente nos cards de atendimento.
 * Como os cards sao recriados por render(), os listeners precisam ser reaplicados depois da renderizacao.
 * Controla mudanca de status, detalhes do cliente, reagendamento e recibo.
 */
function attachMoveHandlers() {
  $$("[data-move]").forEach((button) => button.addEventListener("click", () => {
    const appointment = state.appointments.find((a) => a.id === button.dataset.move);
    appointment.status = button.dataset.status;
    if (appointment.status === "Concluido") appointment.completedAt = todayIso();
    saveState();
    render();
    showNotice(appointment.status === "Concluido" ? "Atendimento concluido, comissao e pontos atualizados." : "Status atualizado.");
  }));
  $$("[data-client-details]").forEach((button) => button.addEventListener("click", () => openClientDetails(button.dataset.clientDetails)));
  $$("[data-reschedule]").forEach((button) => button.addEventListener("click", () => openReschedule(button.dataset.reschedule)));
  $$("[data-receipt]").forEach((button) => button.addEventListener("click", () => openReceipt(button.dataset.receipt)));
}


/**
 * Registra todos os eventos iniciais do aplicativo.
 * Conecta cliques, submits, inputs, filtros, modais, login, wizard, cadastros e configuracoes.
 * E executada uma unica vez ao carregar a pagina.
 */
function initEvents() {
  // Valores iniciais de data, autenticacao e modo padrao do fluxo publico.
  $("#todayLabel").textContent = formatDate(todayIso());
  $("#scheduleDate").value = todayIso();
  $('#appointmentForm [name="date"]').value = todayIso();
  $("#publicDate").value = todayIso();
  $("#publicDate").min = todayIso();
  applyAdminState();
  setPublicClientMode("existing");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  $("#installAppPrompt").hidden = Boolean(isStandalone || localStorage.getItem(installDismissKey) === "true");

  // Alterna entre as duas interfaces principais: Cliente e Usuario.
  $$(".area-switch button").forEach((button) => button.addEventListener("click", () => setArea(button.dataset.area)));

  // Navegacao lateral do painel administrativo e atualizacao do titulo da tela.
  $$(".nav button").forEach((button) => button.addEventListener("click", () => {
    if (button.hidden) return;
    $$(".nav button").forEach((b) => b.classList.remove("active"));
    $$(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    $(`#${button.dataset.view}`).classList.add("active");
    $("#viewTitle").textContent = button.textContent;
    if (button.dataset.view === "dashboard") renderDashboard();
  }));

  // Abertura de modais e filtros da agenda administrativa.
  $$("[data-open-modal]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.openModal}`).showModal()));
  ["scheduleDate", "scheduleBarber", "scheduleStatus"].forEach((id) => $(`#${id}`).addEventListener("change", renderAgenda));
  $("#scheduleSearch").addEventListener("input", renderAgenda);

  // Recalculo de horarios publicos conforme o cliente altera data ou servico.
  ["publicDate"].forEach((id) => $(`#${id}`).addEventListener("change", renderPublicTimes));
  $('#publicAppointmentForm [name="serviceId"]').addEventListener("change", renderPublic);

  // Identificacao do cliente publico: alterna modo e busca cadastro existente pelo WhatsApp.
  $$("[data-client-mode]").forEach((button) => button.addEventListener("click", () => setPublicClientMode(button.dataset.clientMode)));
  $("#findClientBtn").addEventListener("click", () => {
    if (findPublicClient()) goPublicStep(5);
  });
  $$('input[name="lookupPhone"], input[name="clientPhone"], input[name="phone"], input[name="recoveryPhone"], #promoPhone').forEach((input) => {
    input.addEventListener("input", () => {
      input.value = maskPhone(input.value);
      if (input.name === "lookupPhone") selectedPublicClientId = null;
      renderBookingSummary();
    });
  });

  // Validacao do wizard: se um campo obrigatorio falhar, a tela volta para a etapa correta.
  $$("#publicAppointmentForm [required]").forEach((field) => {
    field.addEventListener("invalid", () => {
      const step = field.closest("[data-step]")?.dataset.step;
      if (step) {
        currentPublicStep = Number(step);
        updatePublicStep();
      }
    });
  });

  // Resumo do agendamento acompanha qualquer mudanca feita pelo cliente.
  $$("#publicAppointmentForm input, #publicAppointmentForm select, #publicAppointmentForm textarea").forEach((field) => {
    field.addEventListener("input", renderBookingSummary);
    field.addEventListener("change", renderBookingSummary);
  });

  // Botoes de avancar, voltar e clicar diretamente nas etapas do passo a passo.
  $$("[data-next-step]").forEach((button) => button.addEventListener("click", () => {
    if (validatePublicStep(currentPublicStep)) goPublicStep(Number(button.dataset.nextStep));
  }));
  $$("[data-prev-step]").forEach((button) => button.addEventListener("click", () => goPublicStep(Number(button.dataset.prevStep))));
  $$("[data-step-target]").forEach((button) => button.addEventListener("click", () => {
    const target = Number(button.dataset.stepTarget);
    if (target <= currentPublicStep || validatePublicUntil(target - 1)) goPublicStep(target);
  }));

  // Abas de cadastro, abertura/fechamento de modais e acoes de relatorio/recibo.
  $$("[data-register-tab]").forEach((button) => button.addEventListener("click", () => switchRegisterTab(button.dataset.registerTab)));
  $("#newRegisterBtn").addEventListener("click", () => openRegisterModal());
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  $("#myAppointmentsBtn").addEventListener("click", renderMyAppointments);
  $("#recoverCodeForm").addEventListener("submit", recoverAppointmentCodes);
  $("#recoverCodeForm").addEventListener("input", () => {
    $("#recoveredAppointments").replaceChildren();
    $("#recoveredAppointments").hidden = true;
    $("#recoverCodeFeedback").textContent = "";
  });
  $("#promoRulesBtn").addEventListener("click", () => $("#promoRulesModal").showModal());
  $("#promoBalanceBtn").addEventListener("click", renderPromoBalance);
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#exportPdfBtn").addEventListener("click", printReport);
  $("#printReceiptBtn").addEventListener("click", () => window.print());

  // Instalacao do PWA: o botao so aparece quando o navegador informa que o app pode ser instalado.
  $("#installAppBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return showNotice("No celular, use o menu do navegador e escolha Adicionar a tela inicial.");
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#installAppPrompt").hidden = true;
  });
  $("#dismissInstallBtn").addEventListener("click", () => {
    localStorage.setItem(installDismissKey, "true");
    $("#installAppPrompt").hidden = true;
  });

  // Confirmacao generica: executa o callback pendente apenas quando o usuario confirma.
  $("#confirmForm").addEventListener("submit", (event) => {
    if (event.submitter?.value === "confirm" && pendingConfirm) pendingConfirm();
    pendingConfirm = null;
  });

  // Reagendamento: valida conflito de horario antes de salvar nova data e hora.
  $("#rescheduleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const appointment = state.appointments.find((a) => a.id === data.appointmentId);
    if (!appointment) return;
    const barber = findAvailableBarberForSlot({ serviceId: appointment.serviceId, date: data.date, time: data.time, ignoreId: appointment.id });
    if (!barber) {
      renderRescheduleTimes(appointment);
      const feedback = $("#rescheduleFeedback");
      feedback.hidden = false;
      feedback.textContent = "Este horario nao esta mais disponivel. Escolha outro horario.";
      return;
    }
    appointment.date = data.date;
    appointment.time = data.time;
    appointment.barberId = barber.id;
    appointment.status = "Agendado";
    saveState();
    $("#rescheduleModal").close();
    render();
    if (selectedLookupAppointmentId === appointment.id) renderMyAppointments();
    showNotice("Atendimento reagendado.");
  });
  $("#rescheduleForm [name='date']").addEventListener("change", (event) => {
    const form = $("#rescheduleForm");
    const appointment = state.appointments.find((a) => a.id === form.appointmentId.value);
    if (!appointment) return;
    renderRescheduleTimes(appointment, form.time.value);
  });

  // Configuracoes: salva regras de agenda, dias fechados e programa de pontos.
  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    state.settings = {
      ...state.settings,
      shopName: data.shopName,
      openTime: data.openTime,
      closeTime: data.closeTime,
      slotInterval: Number(data.slotInterval),
      pointsPerCurrency: Number(data.pointsPerCurrency),
      couponThreshold: Number(data.couponThreshold),
      closedDays: Array.from(form.querySelectorAll('[name="closedDays"]:checked')).map((option) => Number(option.value))
    };
    saveState();
    render();
    showNotice("Configuracoes salvas.");
  });

  // Login local para liberar as telas internas do usuario.
  $("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const user = users.find((item) => item.user === data.user.trim().toLowerCase() && item.password === data.password);
    if (!user) {
      return showNotice("Usuario ou senha invalidos.");
    }
    currentUser = user;
    adminAuthenticated = true;
    sessionStorage.setItem("towerUser", JSON.stringify(user));
    event.currentTarget.reset();
    applyAdminState();
    render();
    showNotice("Login realizado.");
  });

  // Novo horario criado pelo painel administrativo.
  $("#appointmentForm").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (activeProfessionalId()) data.barberId = activeProfessionalId();
    const conflict = hasScheduleConflict({ barberId: data.barberId, serviceId: data.serviceId, date: data.date, time: data.time });
    if (conflict) return showNotice("Horario indisponivel para este barbeiro. Escolha outro horario.");
    state.appointments.push({ id: uid(), ...data, status: "Agendado", completedAt: null });
    saveState();
    event.currentTarget.reset();
    $('#appointmentForm [name="date"]').value = $("#scheduleDate").value || todayIso();
    $("#appointmentModal").close();
    render();
    showNotice("Horario agendado com sucesso.");
  });

  // Agendamento publico criado pelo cliente no passo a passo.
  $("#publicAppointmentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    // Enter nas etapas intermediarias avanca o fluxo sem criar uma reserva incompleta.
    if (currentPublicStep < 5) {
      if (validatePublicStep(currentPublicStep)) goPublicStep(currentPublicStep + 1);
      return;
    }
    if (!validatePublicUntil(5)) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const barber = findAvailableBarberForSlot({ serviceId: data.serviceId, date: data.date, time: data.time, preferredBarberId: data.barberId || "" });
    if (!barber) {
      renderPublicTimes();
      return showNotice("Esse horario acabou de ficar indisponivel. Escolha outro horario.");
    }
    const normalizedPhone = (data.clientPhone || data.lookupPhone || "").trim();
    let client = selectedPublicClientId ? byId("clients", selectedPublicClientId) : state.clients.find((c) => phoneDigits(c.phone) === phoneDigits(normalizedPhone));
    if (!client) {
      client = { id: uid(), name: data.clientName.trim(), phone: normalizedPhone, birthdate: data.clientBirthdate || "", email: data.clientEmail || "", coupons: [] };
      state.clients.push(client);
    }
    const appointment = {
      id: uid(),
      code: generateAppointmentCode(),
      clientId: client.id,
      barberId: barber.id,
      serviceId: data.serviceId,
      date: data.date,
      time: data.time,
      status: "Agendado",
      notes: data.notes,
      completedAt: null
    };
    state.appointments.push(appointment);
    saveState();
    form.reset();
    $("#publicDate").value = todayIso();
    currentPublicStep = 1;
    selectedPublicClientId = null;
    setPublicClientMode("existing");
    render();
    openPublicConfirmation(appointment);
    showNotice("Agendamento confirmado. A barbearia ja recebeu seu horario.");
  });

  // Formularios de cadastro: cada chamada define como transformar FormData em registro.
  registerForm("clientForm", "clients", (data) => ({ name: data.name, phone: data.phone, birthdate: data.birthdate || "", email: data.email || "", coupons: [] }));
  registerForm("barberForm", "barbers", (data) => ({ name: data.name, commission: Number(data.commission) }));
  registerForm("serviceForm", "services", (data) => ({ name: data.name, price: Number(data.price), duration: Number(data.duration) }));
}

// Registra o service worker para habilitar cache offline do PWA.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

// Captura o evento nativo de instalacao do PWA e mostra o botao proprio do sistema.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const installPrompt = $("#installAppPrompt");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (installPrompt && !isStandalone && localStorage.getItem(installDismissKey) !== "true") installPrompt.hidden = false;
});

// Quando o PWA ja foi instalado, o botao deixa de aparecer.
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const installPrompt = $("#installAppPrompt");
  if (installPrompt) installPrompt.hidden = true;
  showNotice("Aplicativo instalado com sucesso.");
});

// Inicializa eventos e faz a primeira renderizacao da interface.
initEvents();
render();
hydrateSqliteState();
