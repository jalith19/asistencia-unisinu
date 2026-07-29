const FIREBASE_BASE = "https://maraton-programacion-eff1a-default-rtdb.firebaseio.com";

/* ---------------- Configuración de correo ---------------- */
const MAIL_ENDPOINT = "https://backendserver.aplicaciones-web.online/servicio-correo-app/correo/enviar";
const MAIL_TOKEN = "travel2026";

async function enviarCorreo(to, subject, html) {
    if (!to) return false;
    try {
        await fetch(MAIL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, subject, body: html, token: MAIL_TOKEN }),
        });
        return true;
    } catch (e) {
        console.error("Error enviando correo:", e);
        return false;
    }
}

function plantillaBase({ titulo, etiqueta, cuerpoHtml }) {
    return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;">
    <div style="background:#171717;padding:24px 20px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">${titulo}</h1>
    </div>
    <div style="background:#c8102e;padding:14px 20px;text-align:center;">
      <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:1px;">${etiqueta}</span>
    </div>
    <div style="padding:30px 24px;font-size:14px;color:#374151;line-height:1.6;">
      ${cuerpoHtml}
    </div>
    <div style="background:#171717;padding:20px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Este correo es una notificación automática, por favor no respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>`;
}

function plantillaConfirmacionRegistro({ nombre, proyecto, fase }) {
    const cuerpoHtml = `
      <p>Hola ${nombre},</p>
      <p>Tu registro quedó confirmado correctamente.</p>
      <div style="background:#fafafa;border:1px solid #e4e4e4;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px 0;"><b>Proyecto:</b> ${proyecto}</p>
        <p style="margin:0;"><b>Fase:</b> ${fase}</p>
      </div>
      <p>Cuando tu profesor proyecte el código QR de asistencia, escanéalo e ingresa este mismo correo para marcar tu asistencia.</p>
    `;
    return plantillaBase({ titulo: "Registro confirmado", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}

function plantillaConfirmacionAsistencia({ nombre, proyecto, fase, fechaTexto, hora }) {
    const cuerpoHtml = `
      <p>Hola ${nombre},</p>
      <p>Confirmamos que tu asistencia quedó registrada correctamente.</p>
      <div style="background:#fafafa;border:1px solid #e4e4e4;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px 0;"><b>Proyecto:</b> ${proyecto}</p>
        <p style="margin:0 0 8px 0;"><b>Fase:</b> ${fase}</p>
        <p style="margin:0 0 8px 0;"><b>Fecha:</b> ${fechaTexto}</p>
        <p style="margin:0;"><b>Hora:</b> ${hora}</p>
      </div>
      <p>Gracias por participar.</p>
    `;
    return plantillaBase({ titulo: "Asistencia confirmada", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

const state = {
    projects: [],
    currentProjectId: null,
    currentProjectData: null,
    currentFases: [],
    currentRosterProyecto: [],
    currentFaseIndex: null,
    currentFaseData: null,
    currentFaseCombinados: [],
    mode: "registro",
    proyectoId: null,
    faseIndex: null,
    proyectoData: null,
    faseData: null,
    rosterProyecto: [],
    isStudentView: false,
    isAdmin: false,
    qrRegistroInstance: null,
    qrAsistenciaInstance: null,
    adminPassword: null,
    ubicacionVerificada: false,
};

/* ---------------- Configuración de geolocalización ---------------- */
//Unisinu
/*const GEO_CONFIG = {
    latitud: 10.390683,
    longitud: -75.496829,
    radioMetros: 300,
    timeout: 15000,
};*/

//mi casa
const GEO_CONFIG = {
    latitud: 10.374299,
    longitud: -75.484714,
    radioMetros: 300,
    timeout: 15000,
};



/* ---------------- Utilidades ---------------- */

function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

function todayParts() {
    const now = new Date();
    return {
        fecha: now.toISOString().slice(0, 10),
        dia: DIAS[now.getDay()],
        hora: now.toTimeString().slice(0, 8),
        timestamp: now.toISOString().slice(0, 19).replace("T", " "),
    };
}

function fechaLegible(fechaISO, diaSemana) {
    if (!fechaISO) return "";
    const [y, m, d] = fechaISO.split("-").map(Number);
    const dia = diaSemana || DIAS[new Date(y, m - 1, d).getDay()];
    return `${dia} ${d} de ${MESES[m - 1]} de ${y}`;
}

function fmtFechaHora(str) {
    if (!str) return "—";
    let cleaned = str.replace(/Z$/, "").replace("T", " ");
    if (cleaned.includes(".")) {
        cleaned = cleaned.split(".")[0];
    }
    return cleaned;
}

function fmtFechaHoraCorta(str) {
    if (!str) return "—";
    let cleaned = str.replace(/Z$/, "").replace("T", " ");
    if (cleaned.includes(".")) {
        cleaned = cleaned.split(".")[0];
    }
    if (cleaned.includes(" ") && cleaned.split(" ")[1] === "00:00:00") {
        return cleaned.split(" ")[0];
    }
    return cleaned;
}

function generarIdParticipante() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buscarPorCorreo(lista, correo) {
    const target = String(correo).trim().toLowerCase();
    if (!target) return null;
    const arr = Array.isArray(lista) ? lista : [];
    return arr.find((p) => p && String(p.email || "").trim().toLowerCase() === target) || null;
}

function mondayOfCurrentWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
}

let toastTimer = null;
function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ---------------- Leer config.json ---------------- */

async function leerConfig() {
    try {
        const response = await fetch('config.json');
        const config = await response.json();
        state.adminPassword = config.CREDENCIAL_ADMIN || "proAdmin123";
        return state.adminPassword;
    } catch (error) {
        console.error('Error al leer config.json:', error);
        state.adminPassword = "proAdmin123";
        return state.adminPassword;
    }
}

/* ---------------- Cliente Firebase REST ---------------- */

async function fbGet(path) {
    const res = await fetch(`${FIREBASE_BASE}/${path}.json`);
    if (!res.ok) throw new Error(`Error al leer ${path} (${res.status})`);
    return res.json();
}

async function fbPatch(path, data) {
    const res = await fetch(`${FIREBASE_BASE}/${path}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Error al actualizar ${path} (${res.status})`);
    return res.json();
}

async function fbPut(path, data) {
    const res = await fetch(`${FIREBASE_BASE}/${path}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Error al guardar ${path} (${res.status})`);
    return res.json();
}

/* ---------------- Navegación entre vistas ---------------- */

function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById(`view-${name}`);
    if (target) target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const homeLink = document.getElementById("topbar-home-link");
    if (name === "student") {
        homeLink.style.display = "none";
        state.isStudentView = true;
    } else {
        homeLink.style.display = "inline-flex";
        state.isStudentView = false;
    }
}

function saveCurrentRoute() {
    try {
        const route = {
            view: document.querySelector(".view.active")?.id?.replace("view-", "") || "home",
            projectId: state.currentProjectId,
            faseIndex: state.currentFaseIndex,
            tab: document.querySelector(".fase-tab-btn.active")?.dataset?.faseTab || "participantes",
        };
        sessionStorage.setItem("adminRoute", JSON.stringify(route));
    } catch (e) { }
}

function restoreRoute() {
    try {
        const data = sessionStorage.getItem("adminRoute");
        if (!data) return false;
        const route = JSON.parse(data);
        if (!route.view || route.view === "home" || route.view === "admin-login") return false;
        if (route.view === "admin-list") {
            showView("admin-list");
            loadProjectList();
            return true;
        }
        if (route.view === "admin-detail" && route.projectId !== null) {
            showView("admin-detail");
            loadProjectDetail(route.projectId, route.faseIndex);
            return true;
        }
        if (route.view === "fase-detail" && route.projectId !== null && route.faseIndex !== null) {
            showView("fase-detail");
            loadProjectDetail(route.projectId, route.faseIndex);
            return true;
        }
        return false;
    } catch (e) { return false; }
}

document.addEventListener("DOMContentLoaded", init);

async function init() {
    document.getElementById("year").textContent = new Date().getFullYear();

    await leerConfig();

    document.getElementById("btn-soy-profesor").addEventListener("click", () => {
        showView("admin-login");
        document.getElementById("admin-password-input").focus();
    });

    document.querySelectorAll(".role-card").forEach((card) => {
        card.addEventListener("keypress", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                card.click();
            }
        });
    });

    document.getElementById("back-to-list").addEventListener("click", () => {
        state.currentProjectId = null;
        state.currentFaseIndex = null;
        showView("admin-list");
        loadProjectList();
        saveCurrentRoute();
    });

    document.getElementById("back-to-project").addEventListener("click", () => {
        if (state.currentProjectId !== null) {
            state.currentFaseIndex = null;
            loadProjectDetail(state.currentProjectId);
        } else {
            showView("admin-list");
            loadProjectList();
        }
        saveCurrentRoute();
    });

    document.querySelectorAll(".topbar__home").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            resetToHome();
        })
    );

    document.querySelectorAll(".fase-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.faseTab;
            activateFaseTab(tab);
            saveCurrentRoute();
        });
    });

    document.getElementById("fase-asistencia-search").addEventListener("input", renderFaseParticipantesTable);
    document.getElementById("asistencia-filter-mode").addEventListener("change", () => {
        const mode = document.getElementById("asistencia-filter-mode").value;
        document.getElementById("filtro-rango-row").classList.toggle("hidden", mode !== "rango");
        renderFaseParticipantesTable();
    });
    document.getElementById("filtro-desde").addEventListener("change", renderFaseParticipantesTable);
    document.getElementById("filtro-hasta").addEventListener("change", renderFaseParticipantesTable);

    setupStudentForms();
    setupAdminLogin();
    setupQRActions();

    const params = new URLSearchParams(window.location.search);
    const proyectoParam = params.get("proyecto");
    const faseParam = params.get("fase");
    const modoParam = params.get("modo");
    const fechaParam = params.get("fecha");

    if (proyectoParam !== null && proyectoParam !== "" && faseParam !== null && faseParam !== "") {
        if (modoParam === "asistencia") {
            loadCheckin(proyectoParam, faseParam, fechaParam || "");
        } else {
            loadRegistro(proyectoParam, faseParam);
        }
    } else {
        const restored = restoreRoute();
        if (!restored) {
            showView("home");
        }
    }
}

function resetToHome() {
    history.replaceState(null, "", window.location.pathname);
    state.proyectoId = null;
    state.faseIndex = null;
    state.currentProjectId = null;
    state.currentFaseIndex = null;
    sessionStorage.removeItem("adminRoute");
    showView("home");
}

/* ---------------- Admin Login ---------------- */

function setupAdminLogin() {
    document.getElementById("admin-login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const password = document.getElementById("admin-password-input").value;
        const errorEl = document.getElementById("admin-login-error");
        errorEl.style.display = "none";

        if (password === state.adminPassword) {
            state.isAdmin = true;
            showView("admin-list");
            loadProjectList();
            saveCurrentRoute();
            document.getElementById("admin-password-input").value = "";
        } else {
            errorEl.style.display = "block";
            document.getElementById("admin-password-input").value = "";
            document.getElementById("admin-password-input").focus();
        }
    });
}

/* ================================================================
   ADMIN — listado de proyectos
   ================================================================ */

async function loadProjectList() {
    const grid = document.getElementById("project-grid");
    grid.innerHTML = `<div class="state-msg"><div class="spinner"></div>Cargando proyectos…</div>`;
    try {
        const data = await fbGet("");
        const projects = Array.isArray(data)
            ? data.map((p, idx) => ({ id: idx, ...p })).filter((p) => p && p.nombre !== undefined)
            : Object.entries(data || {}).map(([id, p]) => ({ id, ...p }));
        state.projects = projects;

        if (!projects.length) {
            grid.innerHTML = `<div class="state-msg">Aún no hay proyectos registrados en la base de datos.</div>`;
            return;
        }

        grid.innerHTML = projects
            .map((p) => {
                const participantes = p.participantes ? p.participantes.length : 0;
                const activa = (p.fases || []).some((f) => f && f.activa);
                return `
        <div class="event-card" data-id="${esc(p.id)}" tabindex="0" role="button">
          <div class="event-card__index">PROYECTO #${esc(p.id)}</div>
          <h3>${esc(p.nombre || "Sin nombre")}</h3>
          <p>${esc(p.descripcion || "Sin descripción")}</p>
          <div class="event-card__meta">
            <span class="badge">${participantes} registrado${participantes === 1 ? "" : "s"}</span>
            <span class="badge ${activa ? "badge--live" : ""}">${activa ? "Fase en curso" : "Sin fase activa"}</span>
          </div>
        </div>`;
            })
            .join("");

        grid.querySelectorAll(".event-card").forEach((card) => {
            const open = () => {
                state.currentProjectId = card.dataset.id;
                state.currentFaseIndex = null;
                loadProjectDetail(card.dataset.id);
            };
            card.addEventListener("click", open);
            card.addEventListener("keypress", (e) => {
                if (e.key === "Enter") open();
            });
        });
    } catch (err) {
        grid.innerHTML = `<div class="state-msg">No se pudo cargar la lista de proyectos.<br>${esc(err.message)}</div>`;
    }
}

/* ================================================================
   ADMIN — detalle de un proyecto
   ================================================================ */

async function loadProjectDetail(id, faseToOpen) {
    showView("admin-detail");
    state.currentProjectId = id;
    document.getElementById("detail-title").textContent = "Cargando…";
    document.getElementById("detail-sub").textContent = "";
    document.getElementById("detail-stats").innerHTML = "";

    try {
        const p = await fbGet(`${id}`);
        state.currentProjectData = p || {};
        state.currentFases = Array.isArray(p.fases) ? p.fases : [];
        state.currentRosterProyecto = Array.isArray(p.participantes) ? p.participantes : [];

        document.getElementById("detail-title").textContent = p.nombre || `Proyecto #${id}`;

        const fechaInicio = p.fechaInicio ? fmtFechaHoraCorta(p.fechaInicio) : "?";
        const fechaFin = p.fechaFin ? fmtFechaHoraCorta(p.fechaFin) : "?";
        document.getElementById("detail-sub").textContent = `PROYECTO #${id} · ${fechaInicio} → ${fechaFin}`;

        renderProjectStats(p);
        renderFasesList();

        document.getElementById("event-desc").textContent = p.descripcion || "Sin descripción.";

        if (faseToOpen !== undefined && faseToOpen !== null) {
            await openFaseDetail(Number(faseToOpen));
        }
        saveCurrentRoute();
    } catch (err) {
        document.getElementById("detail-title").textContent = "Error al cargar el proyecto";
        document.getElementById("detail-sub").textContent = err.message;
    }
}

function renderProjectStats(p) {
    const fases = Array.isArray(p.fases) ? p.fases : [];
    const fasesActivas = fases.filter((f) => f && f.activa).length;
    const roster = Array.isArray(p.participantes) ? p.participantes : [];
    const totalAsistencias = fases.reduce((sum, f) => {
        const fp = Array.isArray(f.participantes) ? f.participantes : [];
        return sum + fp.reduce((s, x) => s + (x && Array.isArray(x.asistencias) ? x.asistencias.length : 0), 0);
    }, 0);

    document.getElementById("detail-stats").innerHTML = `
        <div class="stat-mini">
            <span class="stat-mini__value">${roster.length}</span>
            <span class="stat-mini__label">Participantes</span>
        </div>
        <div class="stat-mini">
            <span class="stat-mini__value">${fases.length}</span>
            <span class="stat-mini__label">Fases</span>
        </div>
        <div class="stat-mini">
            <span class="stat-mini__value">${fasesActivas}</span>
            <span class="stat-mini__label">Activas</span>
        </div>
        <div class="stat-mini">
            <span class="stat-mini__value">${totalAsistencias}</span>
            <span class="stat-mini__label">Asistencias</span>
        </div>
    `;
}

function renderFasesList() {
    const fases = state.currentFases;
    const phaseList = document.getElementById("phase-list");
    if (!fases.length) {
        phaseList.innerHTML = `<div class="state-msg">Este proyecto no tiene fases configuradas.</div>`;
        return;
    }
    phaseList.innerHTML = fases
        .map((f, idx) => {
            const asignados = Array.isArray(f.participantes) ? f.participantes.length : 0;
            const fechaHora = f.fechaHoraInicio ? fmtFechaHoraCorta(f.fechaHoraInicio) : "sin fecha";
            return `
      <div class="phase-row phase-row--clickable" data-fase-idx="${idx}" tabindex="0" role="button">
        <div>
          <div class="phase-row__name">${esc(f.titulo || `Fase ${idx + 1}`)}</div>
          <div class="phase-row__meta">${esc(fechaHora)} · ${asignados} inscrito${asignados === 1 ? "" : "s"}</div>
        </div>
        <span class="badge ${f.activa ? "badge--live" : ""}">${f.activa ? "Activa" : "Inactiva"}</span>
      </div>`;
        })
        .join("");

    phaseList.querySelectorAll(".phase-row--clickable").forEach((row) => {
        const open = () => {
            const idx = Number(row.dataset.faseIdx);
            state.currentFaseIndex = idx;
            openFaseDetail(idx);
        };
        row.addEventListener("click", open);
        row.addEventListener("keypress", (e) => {
            if (e.key === "Enter") open();
        });
    });
}

/* ================================================================
   ADMIN — detalle de una fase (unificado)
   ================================================================ */

async function openFaseDetail(faseIndex) {
    showView("fase-detail");
    state.currentFaseIndex = faseIndex;
    document.getElementById("fase-detail-title").textContent = "Cargando…";
    document.getElementById("fase-detail-sub").textContent = "";

    try {
        const [fase, roster] = await Promise.all([
            fbGet(`${state.currentProjectId}/fases/${faseIndex}`),
            fbGet(`${state.currentProjectId}/participantes`),
        ]);
        state.currentFaseData = fase || {};
        state.currentRosterProyecto = Array.isArray(roster) ? roster : [];
        state.currentFaseCombinados = combineFaseParticipantes(state.currentFaseData, state.currentRosterProyecto);

        const proyectoNombre = state.currentProjectData?.nombre || `Proyecto #${state.currentProjectId}`;
        document.getElementById("fase-detail-title").textContent = fase.titulo || `Fase ${faseIndex + 1}`;

        const fechaHora = fase.fechaHoraInicio ? fmtFechaHoraCorta(fase.fechaHoraInicio) : "sin fecha";
        document.getElementById("fase-detail-sub").textContent =
            `${proyectoNombre} · ${fechaHora} · límite ${fase.tiempoLimiteMin ?? "?"} min · ${fase.activa ? "Activa" : "Inactiva"}`;

        document.getElementById("fase-asistencia-search").value = "";
        document.getElementById("asistencia-filter-mode").value = "todas";
        document.getElementById("filtro-rango-row").classList.add("hidden");
        document.getElementById("filtro-desde").value = "";
        document.getElementById("filtro-hasta").value = "";

        renderFaseParticipantesTable();
        renderFaseEnlaces();

        const savedTab = sessionStorage.getItem("faseTab") || "participantes";
        activateFaseTab(savedTab);
        saveCurrentRoute();
    } catch (err) {
        document.getElementById("fase-detail-title").textContent = "Error al cargar la fase";
        document.getElementById("fase-detail-sub").textContent = err.message;
    }
}

function combineFaseParticipantes(fase, roster) {
    const list = Array.isArray(fase.participantes) ? fase.participantes : [];
    return list.map((fp, idx) => {
        const persona = roster.find((r) => r && r.id === fp.id) || {};
        return {
            idxEnFase: idx,
            id: fp.id,
            nombre: persona.nombre || "—",
            email: persona.email || "",
            telefono: persona.telefono || "",
            fechaAsignacion: fp.fechaAsignacion,
            asistencias: Array.isArray(fp.asistencias) ? fp.asistencias : [],
        };
    });
}

function activateFaseTab(tab) {
    document.querySelectorAll(".fase-tab-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.faseTab === tab);
    });
    document.querySelectorAll(".fase-tab-panel").forEach((p) => {
        p.classList.toggle("active", p.id === `fase-tab-${tab}`);
    });
    sessionStorage.setItem("faseTab", tab);
}

function renderFaseParticipantesTable() {
    const tbody = document.getElementById("fase-participantes-tbody");
    const search = (document.getElementById("fase-asistencia-search").value || "").trim().toLowerCase();
    const { desde, hasta } = getFilterRange();
    const combinados = state.currentFaseCombinados || [];

    const filtered = combinados.filter((p) => {
        if (!search) return true;
        return p.nombre.toLowerCase().includes(search) || p.email.toLowerCase().includes(search);
    });

    document.getElementById("fase-participantes-count").textContent =
        `${filtered.length} de ${combinados.length} participante${combinados.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="state-msg">No hay participantes que coincidan con la búsqueda.</div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered
        .map((p) => {
            const asistenciasFiltradas = filtrarAsistenciasPorRango(p.asistencias, desde, hasta);
            const n = asistenciasFiltradas.length;
            const ultima = n ? asistenciasFiltradas[n - 1] : null;
            const fechas = asistenciasFiltradas.map((a) => fmtFechaHoraCorta(a.fecha)).filter(Boolean).join(" · ");
            return `
      <tr>
        <td>
          <div class="student-name">${esc(p.nombre)}</div>
          <div class="student-email">${esc(p.email)}</div>
          <div class="student-phone">${esc(p.telefono || "—")}</div>
        </td>
        <td class="student-id">${esc(fmtFechaHora(p.fechaAsignacion))}</td>
        <td><span class="count-pill ${n ? "count-pill--some" : "count-pill--zero"}">${n}</span></td>
        <td class="student-id">${ultima ? esc(fmtFechaHora(ultima.fecha) + " " + (ultima.hora || "")) : "—"}</td>
        <td class="dates-list">${fechas ? esc(fechas) : "—"}</td>
      </tr>`;
        })
        .join("");
}

function getFilterRange() {
    const mode = document.getElementById("asistencia-filter-mode").value;
    if (mode === "semana") {
        return { desde: mondayOfCurrentWeek(), hasta: todayParts().fecha };
    }
    if (mode === "rango") {
        return {
            desde: document.getElementById("filtro-desde").value || null,
            hasta: document.getElementById("filtro-hasta").value || null,
        };
    }
    return { desde: null, hasta: null };
}

function filtrarAsistenciasPorRango(asistencias, desde, hasta) {
    if (!desde && !hasta) return asistencias;
    return asistencias.filter((a) => (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta));
}

/* ---------------- Tab: Enlaces ---------------- */

function renderFaseEnlaces() {
    const registroUrl = buildRegistroUrl(state.currentProjectId, state.currentFaseIndex);
    document.getElementById("enlace-registro-input").value = registroUrl;

    const qrRegistroBox = document.getElementById("qr-registro-box");
    qrRegistroBox.innerHTML = "";
    try {
        state.qrRegistroInstance = new QRCode(qrRegistroBox, {
            text: registroUrl, width: 220, height: 220,
            colorDark: "#171717", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M,
        });
    } catch {
        qrRegistroBox.innerHTML = `<div class="state-msg">No se pudo generar el QR, pero puedes compartir el enlace de abajo.</div>`;
    }

    const hoy = todayParts().fecha;
    const asistenciaUrl = buildAsistenciaUrl(state.currentProjectId, state.currentFaseIndex, hoy);
    document.getElementById("enlace-asistencia-input").value = asistenciaUrl;
    document.getElementById("asistencia-hoy-fecha").textContent =
        `Válido solo hoy, ${fechaLegible(hoy)}. Proyecta este código para marcar la asistencia de la clase de hoy.`;

    const qrAsistenciaBox = document.getElementById("qr-asistencia-box");
    qrAsistenciaBox.innerHTML = "";
    try {
        state.qrAsistenciaInstance = new QRCode(qrAsistenciaBox, {
            text: asistenciaUrl, width: 220, height: 220,
            colorDark: "#171717", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M,
        });
    } catch {
        qrAsistenciaBox.innerHTML = `<div class="state-msg">No se pudo generar el QR, pero puedes compartir el enlace de abajo.</div>`;
    }
}

function buildRegistroUrl(proyectoId, faseIndex) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("proyecto", proyectoId);
    url.searchParams.set("fase", faseIndex);
    return url.toString();
}

function buildAsistenciaUrl(proyectoId, faseIndex, fecha) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("proyecto", proyectoId);
    url.searchParams.set("fase", faseIndex);
    url.searchParams.set("modo", "asistencia");
    url.searchParams.set("fecha", fecha);
    return url.toString();
}

async function copiarAlPortapapeles(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    try {
        await navigator.clipboard.writeText(input.value);
        toast("Enlace copiado al portapapeles");
    } catch {
        toast("Selecciona y copia el enlace manualmente");
    }
}

document.getElementById("copy-registro-btn").addEventListener("click", () => copiarAlPortapapeles("enlace-registro-input"));
document.getElementById("copy-asistencia-btn").addEventListener("click", () => copiarAlPortapapeles("enlace-asistencia-input"));

function setupQRActions() {
    document.getElementById("download-registro-qr").addEventListener("click", () => downloadQR("registro"));
    document.getElementById("download-asistencia-qr").addEventListener("click", () => downloadQR("asistencia"));
    document.getElementById("expand-registro-qr").addEventListener("click", () => expandQR("registro"));
    document.getElementById("expand-asistencia-qr").addEventListener("click", () => expandQR("asistencia"));
    document.getElementById("qr-expand-close").addEventListener("click", closeExpandQR);
    document.getElementById("qr-expand-overlay").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeExpandQR();
    });
}

function downloadQR(type) {
    const box = type === "registro" ? document.getElementById("qr-registro-box") : document.getElementById("qr-asistencia-box");
    const canvas = box.querySelector("canvas");
    if (!canvas) {
        toast("No se pudo descargar el QR. Intenta generarlo de nuevo.");
        return;
    }
    const link = document.createElement("a");
    link.download = `qr-${type}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast("QR descargado");
}

function expandQR(type) {
    const box = type === "registro" ? document.getElementById("qr-registro-box") : document.getElementById("qr-asistencia-box");
    const canvas = box.querySelector("canvas");
    if (!canvas) {
        toast("No se pudo ampliar el QR. Intenta generarlo de nuevo.");
        return;
    }
    const overlay = document.getElementById("qr-expand-overlay");
    const container = document.getElementById("qr-expand-box");
    container.innerHTML = "";
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    container.appendChild(img);
    overlay.style.display = "flex";
}

function closeExpandQR() {
    document.getElementById("qr-expand-overlay").style.display = "none";
}

/* ================================================================
   GEOLOCALIZACIÓN — AUTOMÁTICA
   ================================================================ */

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function obtenerUbicacion() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Tu navegador no soporta geolocalización.'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitud: position.coords.latitude,
                    longitud: position.coords.longitude,
                    precision: position.coords.accuracy,
                });
            },
            (error) => {
                let mensaje = 'No se pudo obtener tu ubicación. ';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensaje += 'Por favor, permite el acceso a tu ubicación.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensaje += 'La información de ubicación no está disponible.';
                        break;
                    case error.TIMEOUT:
                        mensaje += 'El tiempo de espera para obtener la ubicación expiró.';
                        break;
                    default:
                        mensaje += 'Intenta nuevamente.';
                }
                reject(new Error(mensaje));
            },
            {
                enableHighAccuracy: true,
                timeout: GEO_CONFIG.timeout,
                maximumAge: 60000,
            }
        );
    });
}

async function verificarUbicacionAutomatica() {
    const estadoEl = document.getElementById('estado-ubicacion');
    const btnSubmit = document.getElementById('checkin-submit-btn');
    const ubicacionVerificada = document.getElementById('ubicacion-verificada');

    estadoEl.textContent = 'Obteniendo tu ubicación...';
    estadoEl.className = 'field-hint cargando';

    try {
        const ubicacion = await obtenerUbicacion();
        const distancia = calcularDistancia(
            ubicacion.latitud,
            ubicacion.longitud,
            GEO_CONFIG.latitud,
            GEO_CONFIG.longitud
        );

        document.getElementById('latitud-usuario').value = ubicacion.latitud;
        document.getElementById('longitud-usuario').value = ubicacion.longitud;

        if (distancia <= GEO_CONFIG.radioMetros) {
            estadoEl.innerHTML = `Estás dentro del rango permitido (${Math.round(distancia)}m de distancia). ¡Puedes marcar asistencia!`;
            estadoEl.className = 'field-hint verificado';
            ubicacionVerificada.value = 'true';
            btnSubmit.disabled = false;
            toast('Ubicación verificada correctamente');
        } else {
            estadoEl.innerHTML = `Estás fuera del rango permitido (${Math.round(distancia)}m de distancia). Debes estar en la Universidad del Sinú - Sede Plaza Colón para marcar asistencia.`;
            estadoEl.className = 'field-hint error';
            ubicacionVerificada.value = 'false';
            btnSubmit.disabled = true;
            toast('No estás en la ubicación correcta');
        }
    } catch (error) {
        estadoEl.innerHTML = `${error.message}`;
        estadoEl.className = 'field-hint error';
        ubicacionVerificada.value = 'false';
        btnSubmit.disabled = true;
        toast('Error al verificar ubicación');
    }
}

/* ================================================================
   ESTUDIANTE
   ================================================================ */

async function loadRegistro(proyectoId, faseIndex) {
    state.mode = "registro";
    showView("student");

    const pillEl = document.getElementById("student-event-pill");
    const loadingEl = document.getElementById("student-loading");
    const errorBlock = document.getElementById("student-error-block");
    const activeBlock = document.getElementById("student-active-block");

    document.getElementById("student-verdict").classList.add("hidden");
    activeBlock.classList.add("hidden");
    errorBlock.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    pillEl.textContent = "Cargando…";
    document.getElementById("retry-evento-btn").classList.remove("hidden");

    try {
        const proyecto = await fbGet(`${proyectoId}`);
        if (!proyecto || typeof proyecto !== "object") {
            throw new Error("El proyecto no existe en la base de datos.");
        }
        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        const fase = fases[Number(faseIndex)];
        if (!fase) {
            throw new Error("La fase indicada no existe en este proyecto.");
        }

        state.proyectoId = proyectoId;
        state.faseIndex = Number(faseIndex);
        state.proyectoData = proyecto;
        state.faseData = fase;
        state.rosterProyecto = Array.isArray(proyecto.participantes) ? proyecto.participantes : [];

        pillEl.textContent = `${proyecto.nombre || "Proyecto"} · ${fase.titulo || "Fase"}`;
        history.replaceState(null, "", buildRegistroUrl(proyectoId, faseIndex));

        loadingEl.classList.add("hidden");
        activeBlock.classList.remove("hidden");
        showRegistroForm();
    } catch (err) {
        console.error("Error al cargar el registro:", err);
        pillEl.textContent = "No disponible";
        loadingEl.classList.add("hidden");
        errorBlock.classList.remove("hidden");
        document.getElementById("student-error-text").textContent =
            `No pudimos cargar este registro (${err.message}). Verifica que el enlace o código QR sean correctos.`;
    }
}

async function loadCheckin(proyectoId, faseIndex, fechaParam) {
    state.mode = "asistencia";
    showView("student");

    const pillEl = document.getElementById("student-event-pill");
    const loadingEl = document.getElementById("student-loading");
    const errorBlock = document.getElementById("student-error-block");
    const activeBlock = document.getElementById("student-active-block");

    document.getElementById("student-verdict").classList.add("hidden");
    activeBlock.classList.add("hidden");
    errorBlock.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    pillEl.textContent = "Cargando…";

    const hoy = todayParts().fecha;
    if (fechaParam !== hoy) {
        loadingEl.classList.add("hidden");
        errorBlock.classList.remove("hidden");
        document.getElementById("retry-evento-btn").classList.add("hidden");
        pillEl.textContent = "Código no disponible";
        document.getElementById("student-error-text").textContent = fechaParam
            ? `Este código de asistencia ya no es válido: era para el ${fechaLegible(fechaParam)}. Pide a tu profesor el código de hoy.`
            : "Este enlace de asistencia no es válido. Pide a tu profesor el código de hoy.";
        return;
    }

    try {
        const proyecto = await fbGet(`${proyectoId}`);
        if (!proyecto || typeof proyecto !== "object") {
            throw new Error("El proyecto no existe en la base de datos.");
        }
        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        const fase = fases[Number(faseIndex)];
        if (!fase) {
            throw new Error("La fase indicada no existe en este proyecto.");
        }

        state.proyectoId = proyectoId;
        state.faseIndex = Number(faseIndex);
        state.proyectoData = proyecto;
        state.faseData = fase;
        state.rosterProyecto = Array.isArray(proyecto.participantes) ? proyecto.participantes : [];

        pillEl.textContent = `${proyecto.nombre || "Proyecto"} · ${fase.titulo || "Fase"} · Asistencia de hoy`;
        history.replaceState(null, "", buildAsistenciaUrl(proyectoId, faseIndex, hoy));

        document.getElementById("retry-evento-btn").classList.remove("hidden");
        loadingEl.classList.add("hidden");
        activeBlock.classList.remove("hidden");
        showCheckinForm();

        // Iniciar verificación automática de ubicación
        setTimeout(() => {
            verificarUbicacionAutomatica();
        }, 500);
    } catch (err) {
        console.error("Error al cargar la asistencia:", err);
        pillEl.textContent = "No disponible";
        loadingEl.classList.add("hidden");
        errorBlock.classList.remove("hidden");
        document.getElementById("student-error-text").textContent =
            `No pudimos cargar esta asistencia (${err.message}). Verifica que el enlace o código QR sean correctos.`;
    }
}

function setupStudentForms() {
    document.getElementById("registro-form").addEventListener("submit", (e) => {
        e.preventDefault();
        handleRegistro();
    });

    document.getElementById("checkin-form").addEventListener("submit", (e) => {
        e.preventDefault();
        handleCheckin();
    });

    document.getElementById("btn-registrar-otro").addEventListener("click", () => {
        document.getElementById("student-verdict").classList.add("hidden");
        document.getElementById("student-panel").classList.remove("hidden");
        document.getElementById("student-active-block").classList.remove("hidden");
        if (state.mode === "asistencia") {
            showCheckinForm();
            // Reiniciar verificación automática
            setTimeout(() => {
                verificarUbicacionAutomatica();
            }, 500);
        } else {
            showRegistroForm();
        }
    });

    document.getElementById("retry-evento-btn").addEventListener("click", () => {
        if (state.proyectoId === null || state.faseIndex === null) return;
        if (state.mode === "asistencia") {
            loadCheckin(state.proyectoId, state.faseIndex, todayParts().fecha);
        } else {
            loadRegistro(state.proyectoId, state.faseIndex);
        }
    });
}

function showRegistroForm() {
    document.getElementById("student-active-title").textContent = "Registro de participantes";
    document.getElementById("student-active-sub").textContent =
        "Completa tus datos para registrarte en esta fase";
    document.getElementById("registro-form").classList.remove("hidden");
    document.getElementById("checkin-form").classList.add("hidden");
    document.getElementById("registro-form").reset();
    hideStudentMessage();
}

function showCheckinForm() {
    document.getElementById("student-active-title").textContent = "Marcar asistencia";
    document.getElementById("student-active-sub").textContent =
        "Ingresa el correo con el que te registraste. La ubicación se verificará automáticamente.";
    document.getElementById("checkin-form").classList.remove("hidden");
    document.getElementById("registro-form").classList.add("hidden");
    document.getElementById("checkin-form").reset();
    hideStudentMessage();

    // Resetear estado de ubicación
    document.getElementById('ubicacion-verificada').value = 'false';
    document.getElementById('latitud-usuario').value = '';
    document.getElementById('longitud-usuario').value = '';
    const estadoEl = document.getElementById('estado-ubicacion');
    estadoEl.innerHTML = 'Verificando ubicación automáticamente...';
    estadoEl.className = 'field-hint cargando';
    document.getElementById('checkin-submit-btn').disabled = true;
}

function showStudentMessage(type, text) {
    const el = document.getElementById("student-inline-msg");
    el.textContent = text;
    el.className = `inline-msg inline-msg--${type} show`;
}
function hideStudentMessage() {
    const el = document.getElementById("student-inline-msg");
    el.classList.remove("show");
}

async function handleRegistro() {
    const nombre1 = document.getElementById("full-nombre1-input").value.trim();
    const nombre2 = document.getElementById("full-nombre2-input").value.trim();
    const apellido1 = document.getElementById("full-apellido1-input").value.trim();
    const apellido2 = document.getElementById("full-apellido2-input").value.trim();
    const correo = document.getElementById("full-correo-input").value.trim();
    const telefono = document.getElementById("full-telefono-input").value.trim();

    if (!nombre1 || !apellido1) {
        showStudentMessage("error", "Nombre y apellido son obligatorios.");
        return;
    }

    const btn = document.getElementById("registro-submit-btn");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    hideStudentMessage();

    try {
        const nombreCompleto = [apellido1, apellido2, nombre1, nombre2].filter(Boolean).join(" ").trim();
        const entry = todayParts();

        const rosterFresh = await fbGet(`${state.proyectoId}/participantes`);
        const roster = Array.isArray(rosterFresh) ? rosterFresh : [];
        let participante = buscarPorCorreo(roster, correo);

        if (!participante) {
            participante = {
                id: generarIdParticipante(),
                nombre: nombreCompleto,
                email: correo,
                telefono: telefono,
                imagenPerfil: "",
                fechaRegistro: entry.timestamp,
            };
            const idx = roster.length;
            await fbPut(`${state.proyectoId}/participantes/${idx}`, participante);
            roster.push(participante);
        }

        const faseParticipantesFresh = await fbGet(`${state.proyectoId}/fases/${state.faseIndex}/participantes`);
        const faseList = Array.isArray(faseParticipantesFresh) ? faseParticipantesFresh : [];
        const yaAsignado = faseList.some((fp) => fp && fp.id === participante.id);

        if (!yaAsignado) {
            const asignacion = { id: participante.id, fechaAsignacion: entry.timestamp, puntaje: 0 };
            const idx2 = faseList.length;
            await fbPut(`${state.proyectoId}/fases/${state.faseIndex}/participantes/${idx2}`, asignacion);
        }

        enviarConfirmacionRegistro(correo, participante.nombre || nombreCompleto);
        showVerdictRegistro(participante.nombre || nombreCompleto, entry);
    } catch (err) {
        showStudentMessage("error", `No se pudo completar el registro: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = "Registrarme";
    }
}

function enviarConfirmacionRegistro(correo, nombre) {
    if (!correo) return;
    const proyecto = state.proyectoData?.nombre || `Proyecto #${state.proyectoId}`;
    const fase = state.faseData?.titulo || `Fase #${state.faseIndex}`;
    const html = plantillaConfirmacionRegistro({ nombre, proyecto, fase });
    enviarCorreo(correo, `Registro confirmado · ${fase}`, html);
}

async function handleCheckin() {
    // Verificar que la ubicación fue verificada
    const ubicacionVerificada = document.getElementById('ubicacion-verificada').value;

    if (ubicacionVerificada !== 'true') {
        showStudentMessage("error", "Debes estar dentro del rango permitido para marcar asistencia. Verifica tu ubicación.");
        return;
    }

    const correo = document.getElementById("checkin-correo-input").value.trim();
    if (!correo) {
        showStudentMessage("error", "Ingresa tu correo electrónico.");
        return;
    }

    const btn = document.getElementById("checkin-submit-btn");
    btn.disabled = true;
    btn.textContent = "Verificando…";
    hideStudentMessage();

    try {
        const rosterFresh = await fbGet(`${state.proyectoId}/participantes`);
        const roster = Array.isArray(rosterFresh) ? rosterFresh : [];
        const participante = buscarPorCorreo(roster, correo);

        if (!participante) {
            showStudentMessage("error", "No estás registrado en este proyecto. Pide a tu profesor el enlace de registro.");
            return;
        }

        const faseParticipantesFresh = await fbGet(`${state.proyectoId}/fases/${state.faseIndex}/participantes`);
        const faseList = Array.isArray(faseParticipantesFresh) ? faseParticipantesFresh : [];
        const idxEnFase = faseList.findIndex((fp) => fp && fp.id === participante.id);

        if (idxEnFase === -1) {
            showStudentMessage("error", "No estás inscrito en esta fase.");
            return;
        }

        const fpEntry = faseList[idxEnFase];
        const asistencias = Array.isArray(fpEntry.asistencias) ? [...fpEntry.asistencias] : [];
        const entry = todayParts();
        const yaHoy = asistencias.some((a) => a.fecha === entry.fecha);

        if (!yaHoy) {
            // Guardar la ubicación junto con la asistencia
            const latitud = document.getElementById('latitud-usuario').value;
            const longitud = document.getElementById('longitud-usuario').value;
            const distancia = calcularDistancia(
                parseFloat(latitud),
                parseFloat(longitud),
                GEO_CONFIG.latitud,
                GEO_CONFIG.longitud
            );

            const asistenciaConUbicacion = {
                ...entry,
                latitud: latitud,
                longitud: longitud,
                distancia: Math.round(distancia),
            };

            asistencias.push(asistenciaConUbicacion);
            await fbPatch(`${state.proyectoId}/fases/${state.faseIndex}/participantes/${idxEnFase}`, { asistencias });
        }

        enviarConfirmacionAsistencia(correo, participante.nombre, entry);
        showVerdictAsistencia(participante.nombre, entry);
    } catch (err) {
        showStudentMessage("error", `No se pudo marcar la asistencia: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = "Marcar asistencia";
    }
}

function enviarConfirmacionAsistencia(correo, nombre, entry) {
    if (!correo) return;
    const proyecto = state.proyectoData?.nombre || `Proyecto #${state.proyectoId}`;
    const fase = state.faseData?.titulo || `Fase #${state.faseIndex}`;
    const html = plantillaConfirmacionAsistencia({
        nombre,
        proyecto,
        fase,
        fechaTexto: fechaLegible(entry.fecha, entry.dia),
        hora: entry.hora,
    });
    enviarCorreo(correo, `Asistencia confirmada · ${fase}`, html);
}

function showVerdict() {
    document.getElementById("student-active-block").classList.add("hidden");
    document.getElementById("student-panel").classList.add("hidden");
    document.getElementById("student-verdict").classList.remove("hidden");
}

function showVerdictRegistro(nombre, entry) {
    showVerdict();
    const proyecto = state.proyectoData?.nombre || `Proyecto #${state.proyectoId}`;
    const fase = state.faseData?.titulo || `Fase #${state.faseIndex}`;

    document.getElementById("verdict-title").textContent = "Registro exitoso";
    document.getElementById("verdict-nombre").textContent = `¡Listo, ${nombre}! Quedaste registrado.`;
    document.getElementById("verdict-evento").textContent = `${proyecto} · ${fase}`;
    document.getElementById("verdict-fecha").textContent = entry.fecha;
    document.getElementById("verdict-hora").textContent = entry.hora;
    document.getElementById("btn-registrar-otro").textContent = "Registrar a otro participante";

    toast("Registro completado");
}

function showVerdictAsistencia(nombre, entry) {
    showVerdict();
    const proyecto = state.proyectoData?.nombre || `Proyecto #${state.proyectoId}`;
    const fase = state.faseData?.titulo || `Fase #${state.faseIndex}`;

    document.getElementById("verdict-title").textContent = "Asistencia registrada";
    document.getElementById("verdict-nombre").textContent = `Bienvenido/a, ${nombre}.`;
    document.getElementById("verdict-evento").textContent = `${proyecto} · ${fase}`;
    document.getElementById("verdict-fecha").textContent = entry.fecha;
    document.getElementById("verdict-hora").textContent = entry.hora;
    document.getElementById("btn-registrar-otro").textContent = "Marcar la asistencia de otro participante";

    toast("Asistencia registrada correctamente");
}