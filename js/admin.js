import { state, saveCurrentRoute } from './navigation.js';
import { showView, activateFaseTab, toast } from './ui.js';
import { fbGet, fbPut, fbPatch } from './firebase.js';
import { esc, fmtFechaHora, fmtFechaHoraCorta, todayParts, mondayOfCurrentWeek, generarIdParticipante, buscarPorCorreo, fechaLegible } from './utils.js';
import { enviarCorreo, plantillaConfirmacionRegistro, plantillaConfirmacionAsistencia } from './email.js';
import { PUNTAJE_MAX } from './config.js';

// Cache de datos para evitar múltiples peticiones
let adminCache = {
    proyectos: [],
    proyectoActual: null,
    faseActual: null,
    rosterProyecto: [],
    faseParticipantes: [],
    cargado: false,
    proyectoIdActual: null
};

// Variable para controlar si se muestra el botón de eliminar
const MOSTRAR_BOTON_ELIMINAR = false;

// Variable para almacenar el tipo de QR actual
let qrActualTipo = 'registro';

export async function loadProjectList() {
    const grid = document.getElementById("project-grid");
    if (!grid) return;

    // Si ya tenemos los proyectos en cache y estamos en la vista correcta, mostrarlos directamente
    if (adminCache.proyectos.length > 0 && adminCache.cargado) {
        renderProjectGrid(adminCache.proyectos, grid);
        return;
    }

    grid.innerHTML = `<div class="state-msg"><div class="spinner"></div>Cargando proyectos…</div>`;
    try {
        const data = await fbGet("");
        const projects = Array.isArray(data)
            ? data.map((p, idx) => ({ id: idx, ...p })).filter((p) => p && p.nombre !== undefined)
            : Object.entries(data || {}).map(([id, p]) => ({ id, ...p }));

        // Limpiar cache antes de guardar nuevos proyectos
        adminCache.proyectos = [];
        adminCache.proyectos = projects;
        adminCache.cargado = true;
        adminCache.proyectoIdActual = null;
        state.projects = projects;

        renderProjectGrid(projects, grid);
    } catch (err) {
        grid.innerHTML = `<div class="state-msg">No se pudo cargar la lista de proyectos.<br>${esc(err.message)}</div>`;
    }
}

function renderProjectGrid(projects, grid) {
    if (!projects || !projects.length) {
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
}

export async function loadProjectDetail(id, faseToOpen) {
    const detailView = document.getElementById("view-admin-detail");
    if (!detailView) return;

    showView("admin-detail");
    state.currentProjectId = id;

    const title = document.getElementById("detail-title");
    const sub = document.getElementById("detail-sub");
    const stats = document.getElementById("detail-stats");
    const desc = document.getElementById("event-desc");

    if (title) title.textContent = "Cargando…";
    if (sub) sub.textContent = "";
    if (stats) stats.innerHTML = "";

    try {
        // Buscar en cache o cargar
        let p = adminCache.proyectos.find(proj => String(proj.id) === String(id));

        if (!p) {
            p = await fbGet(`${id}`);
            // Verificar si ya existe en cache para evitar duplicados
            const existIdx = adminCache.proyectos.findIndex(proj => String(proj.id) === String(id));
            if (existIdx !== -1) {
                adminCache.proyectos[existIdx] = { id, ...p };
            } else {
                adminCache.proyectos.push({ id, ...p });
            }
        }

        adminCache.proyectoActual = p;
        adminCache.proyectoIdActual = id;
        adminCache.rosterProyecto = Array.isArray(p.participantes) ? p.participantes : [];
        adminCache.faseActual = null;
        adminCache.faseParticipantes = [];

        state.currentProjectData = p || {};
        state.currentFases = Array.isArray(p.fases) ? p.fases : [];
        state.currentRosterProyecto = adminCache.rosterProyecto;

        if (title) title.textContent = p.nombre || `Proyecto #${id}`;

        const fechaInicio = p.fechaInicio ? fmtFechaHoraCorta(p.fechaInicio) : "?";
        const fechaFin = p.fechaFin ? fmtFechaHoraCorta(p.fechaFin) : "?";
        if (sub) sub.textContent = `PROYECTO #${id} · ${fechaInicio} → ${fechaFin}`;

        renderProjectStats(p);
        renderFasesList();

        if (desc) desc.textContent = p.descripcion || "Sin descripción.";

        if (faseToOpen !== undefined && faseToOpen !== null) {
            await openFaseDetail(Number(faseToOpen));
        }
        saveCurrentRoute();
    } catch (err) {
        if (title) title.textContent = "Error al cargar el proyecto";
        if (sub) sub.textContent = err.message;
    }
}

function renderProjectStats(p) {
    const stats = document.getElementById("detail-stats");
    if (!stats) return;

    const fases = Array.isArray(p.fases) ? p.fases : [];
    const fasesActivas = fases.filter((f) => f && f.activa).length;
    const roster = Array.isArray(p.participantes) ? p.participantes : [];
    const totalAsistencias = fases.reduce((sum, f) => {
        const fp = Array.isArray(f.participantes) ? f.participantes : [];
        return sum + fp.reduce((s, x) => s + (x && Array.isArray(x.asistencias) ? x.asistencias.length : 0), 0);
    }, 0);

    stats.innerHTML = `
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
    if (!phaseList) return;

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

export async function openFaseDetail(faseIndex) {
    const faseView = document.getElementById("view-fase-detail");
    if (!faseView) return;

    showView("fase-detail");
    state.currentFaseIndex = faseIndex;

    const title = document.getElementById("fase-detail-title");
    const sub = document.getElementById("fase-detail-sub");

    if (title) title.textContent = "Cargando…";
    if (sub) sub.textContent = "";

    try {
        // Buscar en cache o cargar
        let fase = null;

        // Si tenemos el proyecto actual, buscar la fase en sus datos
        if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
            fase = adminCache.proyectoActual.fases[faseIndex];
        }

        // Si no está en cache, cargar desde Firebase
        if (!fase) {
            fase = await fbGet(`${state.currentProjectId}/fases/${faseIndex}`);
            // Actualizar cache del proyecto
            if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
                adminCache.proyectoActual.fases[faseIndex] = fase;
            }
        }

        adminCache.faseActual = fase;
        adminCache.faseParticipantes = Array.isArray(fase.participantes) ? fase.participantes : [];

        state.currentFaseData = fase || {};
        state.currentFaseCombinados = combineFaseParticipantes(fase, adminCache.rosterProyecto);

        const proyectoNombre = adminCache.proyectoActual?.nombre || `Proyecto #${state.currentProjectId}`;
        if (title) title.textContent = fase.titulo || `Fase ${faseIndex + 1}`;

        const fechaHora = fase.fechaHoraInicio ? fmtFechaHoraCorta(fase.fechaHoraInicio) : "sin fecha";
        if (sub) sub.textContent = `${proyectoNombre} · ${fechaHora} · límite ${fase.tiempoLimiteMin ?? "?"} min · ${fase.activa ? "Activa" : "Inactiva"}`;

        const searchInput = document.getElementById("fase-asistencia-search");
        const filterMode = document.getElementById("asistencia-filter-mode");
        const rangoRow = document.getElementById("filtro-rango-row");
        const filtroDesde = document.getElementById("filtro-desde");
        const filtroHasta = document.getElementById("filtro-hasta");

        if (searchInput) searchInput.value = "";
        if (filterMode) filterMode.value = "todas";
        if (rangoRow) rangoRow.classList.add("hidden");
        if (filtroDesde) filtroDesde.value = "";
        if (filtroHasta) filtroHasta.value = "";

        renderFaseParticipantesTable();
        renderFaseEnlaces();

        const savedTab = sessionStorage.getItem("faseTab") || "participantes";
        activateFaseTab(savedTab);
        saveCurrentRoute();
    } catch (err) {
        if (title) title.textContent = "Error al cargar la fase";
        if (sub) sub.textContent = err.message;
    }
}

function combineFaseParticipantes(fase, roster) {
    const list = Array.isArray(fase?.participantes) ? fase.participantes : [];
    return list.map((fp, idx) => {
        const idxRoster = roster.findIndex((r) => r && r.id === fp.id);
        const persona = idxRoster !== -1 ? roster[idxRoster] : {};
        return {
            idxEnFase: idx,
            idxRoster: idxRoster,
            id: fp.id || '',
            nombre: persona.nombre || '—',
            email: persona.email || '',
            telefono: persona.telefono || '',
            fechaAsignacion: fp.fechaAsignacion || '',
            asistencias: Array.isArray(fp.asistencias) ? fp.asistencias : [],
        };
    });
}

function contarSesionesTotales(combinados, desde, hasta) {
    const fechas = new Set();
    combinados.forEach((p) => {
        filtrarAsistenciasPorRango(p.asistencias, desde, hasta).forEach((a) => {
            if (a && a.fecha) fechas.add(a.fecha);
        });
    });
    return fechas.size;
}

function getFilterRange() {
    const mode = document.getElementById("asistencia-filter-mode");
    if (!mode) return { desde: null, hasta: null };

    const value = mode.value;
    if (value === "semana") {
        const desde = mondayOfCurrentWeek();
        const hasta = todayParts().fecha;
        return { desde, hasta };
    }
    if (value === "rango") {
        const desdeInput = document.getElementById("filtro-desde");
        const hastaInput = document.getElementById("filtro-hasta");
        return {
            desde: desdeInput ? desdeInput.value || null : null,
            hasta: hastaInput ? hastaInput.value || null : null,
        };
    }
    return { desde: null, hasta: null };
}

function filtrarAsistenciasPorRango(asistencias, desde, hasta) {
    if (!desde && !hasta) return asistencias;
    return asistencias.filter((a) => (!desde || a.fecha >= desde) && (!hasta || a.fecha <= hasta));
}

export function renderFaseParticipantesTable() {
    const tbody = document.getElementById("fase-participantes-tbody");
    if (!tbody) return;

    const search = (document.getElementById("fase-asistencia-search")?.value || "").trim().toLowerCase();
    const { desde, hasta } = getFilterRange();
    const combinados = state.currentFaseCombinados || [];

    // Obtener todas las fechas de asistencia únicas del período seleccionado
    const todasLasFechas = new Set();
    combinados.forEach((p) => {
        filtrarAsistenciasPorRango(p.asistencias, desde, hasta).forEach((a) => {
            if (a && a.fecha) todasLasFechas.add(a.fecha);
        });
    });
    const totalSesiones = todasLasFechas.size;
    const fechasOrdenadas = Array.from(todasLasFechas).sort();

    // Filtrar participantes
    const filtered = combinados
        .filter((p) => {
            if (!search) return true;
            return p.nombre.toLowerCase().includes(search) || p.email.toLowerCase().includes(search);
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    // Actualizar el contador con la información de sesiones
    const countEl = document.getElementById("fase-participantes-count");
    if (countEl) {
        const periodoTexto = desde && hasta ? `(${desde} al ${hasta})` :
            desde ? `(desde ${desde})` :
                hasta ? `(hasta ${hasta})` : "(todas las fechas)";
        countEl.textContent = `${filtered.length} de ${combinados.length} participantes · ${totalSesiones} sesiones ${periodoTexto}`;
    }

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="state-msg">No hay participantes que coincidan con la búsqueda.</div></td></tr>`;
        return;
    }

    const fechasPeriodoJson = JSON.stringify(fechasOrdenadas);

    tbody.innerHTML = filtered
        .map((p) => {
            const asistenciasFiltradas = filtrarAsistenciasPorRango(p.asistencias, desde, hasta);
            const n = asistenciasFiltradas.length;
            const faltas = Math.max(totalSesiones - n, 0);
            const puntaje = totalSesiones > 0 ? ((n / totalSesiones) * PUNTAJE_MAX) : null;

            const fechaAsignacion = p.fechaAsignacion || "";
            const fechaPartes = fechaAsignacion ? fmtFechaHoraCorta(fechaAsignacion).split(" ") : ["—", ""];
            const fechaStr = fechaPartes[0] || "—";
            const horaStr = fechaPartes[1] || "";

            const asistenciasJson = JSON.stringify(p.asistencias || []);

            const nombreMostrar = p.nombre && p.nombre !== '—' ? p.nombre : '—';
            const emailMostrar = p.email || '—';
            const telefonoMostrar = p.telefono || '—';

            const botonEliminar = MOSTRAR_BOTON_ELIMINAR ?
                `<button type="button" class="delete-btn" data-idxroster="${esc(p.idxRoster)}" data-nombre="${esc(nombreMostrar)}"><i class="fas fa-trash"></i></button>` : '';

            const accionesColumna = `
                <td>
                    <div class="acciones-container">
                        <button type="button" class="edit-btn" data-idxroster="${esc(p.idxRoster)}"><i class="fas fa-edit"></i> Editar</button>
                        ${botonEliminar}
                    </div>
                </td>
            `;

            return `
        <tr>
            <td>
                <div class="student-name">${esc(nombreMostrar)}</div>
                <div class="student-email">${esc(emailMostrar)}</div>
                <div class="student-phone">${esc(telefonoMostrar)}</div>
            </td>
            <td>
                <div class="fecha-asignacion">
                    <div class="fecha">${esc(fechaStr)}</div>
                    ${horaStr ? `<div class="hora">${esc(horaStr)}</div>` : ""}
                </div>
            </td>
            <td style="text-align:center;"><span class="count-pill ${n ? "count-pill--some" : "count-pill--zero"}">${n}</span></td>
            <td style="text-align:center;"><span class="faltas-pill ${faltas ? "faltas-pill--some" : "faltas-pill--zero"}">${faltas}</span></td>
            <td style="text-align:center;"><span class="puntaje-pill">${puntaje === null ? "—" : `${puntaje.toFixed(1)} / ${PUNTAJE_MAX.toFixed(1)}`}</span></td>
            <td style="text-align:center;">
                <button type="button" class="btn-detalle" 
                        data-email="${esc(p.email)}" 
                        data-nombre="${esc(nombreMostrar)}" 
                        data-asistencias='${asistenciasJson}'
                        data-fechas-periodo='${fechasPeriodoJson}'
                        data-total-sesiones="${totalSesiones}">
                    <i class="fas fa-eye"></i> Ver detalles
                </button>
            </td>
            ${accionesColumna}
        </tr>`;
        })
        .join("");

    tbody.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => openEditParticipante(Number(btn.dataset.idxroster)));
    });

    tbody.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const idxRoster = Number(btn.dataset.idxroster);
            const nombre = btn.dataset.nombre;
            eliminarParticipante(idxRoster, nombre);
        });
    });

    tbody.querySelectorAll(".btn-detalle").forEach((btn) => {
        btn.addEventListener("click", () => {
            const nombre = btn.dataset.nombre;
            const email = btn.dataset.email;
            const asistencias = JSON.parse(btn.dataset.asistencias);
            const fechasPeriodo = JSON.parse(btn.dataset.fechasPeriodo);
            const totalSesiones = parseInt(btn.dataset.totalSesiones);
            abrirModalDetalles(nombre, email, asistencias, fechasPeriodo, totalSesiones);
        });
    });
}

async function eliminarParticipante(idxRoster, nombre) {
    if (!confirm(`¿Estás seguro de que deseas eliminar a "${nombre}" de este proyecto?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    const btn = document.querySelector(`.delete-btn[data-idxroster="${idxRoster}"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // Actualizar roster en cache y Firebase
        let rosterActual = [...adminCache.rosterProyecto];
        if (idxRoster >= 0 && idxRoster < rosterActual.length) {
            rosterActual[idxRoster] = null;
            const rosterFiltrado = rosterActual.filter(r => r !== null);
            await fbPut(`${state.currentProjectId}/participantes`, rosterFiltrado);
            adminCache.rosterProyecto = rosterFiltrado;
            state.currentRosterProyecto = rosterFiltrado;
        }

        // Actualizar fase en cache y Firebase
        let faseParticipantes = [...adminCache.faseParticipantes];
        const idxEnFase = faseParticipantes.findIndex((fp, idx) => {
            const combinados = state.currentFaseCombinados;
            return combinados[idx] && combinados[idx].idxRoster === idxRoster;
        });

        if (idxEnFase !== -1) {
            faseParticipantes.splice(idxEnFase, 1);
            await fbPut(`${state.currentProjectId}/fases/${state.currentFaseIndex}/participantes`, faseParticipantes);
            adminCache.faseParticipantes = faseParticipantes;

            // Actualizar la fase en el proyecto cache
            if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
                adminCache.proyectoActual.fases[state.currentFaseIndex].participantes = faseParticipantes;
            }
        }

        state.currentFaseCombinados = combineFaseParticipantes(
            { participantes: faseParticipantes },
            adminCache.rosterProyecto
        );
        renderFaseParticipantesTable();

        toast(`Participante "${nombre}" eliminado correctamente`);
    } catch (err) {
        console.error('Error al eliminar participante:', err);
        toast(`Error al eliminar: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash"></i>';
        }
    }
}

function abrirModalDetalles(nombre, email, asistencias, fechasPeriodo, totalSesiones) {
    const overlay = document.getElementById("asistencia-detalle-overlay");
    const titulo = document.getElementById("asistencia-detalle-titulo");
    const contenido = document.getElementById("asistencia-detalle-contenido");

    if (!overlay || !titulo || !contenido) return;

    titulo.textContent = `Detalles de asistencia - ${nombre}`;

    const fechasAsistencia = new Set();
    asistencias.forEach(a => {
        if (a && a.fecha) fechasAsistencia.add(a.fecha);
    });

    let sesionesList = '';
    if (fechasPeriodo && fechasPeriodo.length > 0) {
        sesionesList = fechasPeriodo.map(fecha => {
            const asistio = fechasAsistencia.has(fecha);
            const asistenciaData = asistencias.find(a => a.fecha === fecha);
            const hora = asistenciaData ? asistenciaData.hora : '—';
            const icono = asistio ? '<i class="fas fa-check-circle" style="color:#2e7d32;"></i>' : '<i class="fas fa-times-circle" style="color:#c62828;"></i>';
            const clase = asistio ? 'asistio' : 'falta';
            return `<li class="${clase}">${icono} ${fecha} ${asistio ? `- ${hora}` : '- No asistió'}</li>`;
        }).join('');
    } else {
        sesionesList = '<li class="empty-msg">No hay sesiones en el período seleccionado</li>';
    }

    const asistenciasList = asistencias && asistencias.length > 0
        ? asistencias.map(a => `<li><i class="fas fa-check-circle" style="color:#2e7d32;"></i> ${fmtFechaHoraCorta(a.fecha)} - ${a.hora || "—"}</li>`).join("")
        : '<li class="empty-msg">No tiene asistencias registradas</li>';

    const asistenciasCount = fechasAsistencia.size;
    const faltasCount = totalSesiones - asistenciasCount;

    contenido.innerHTML = `
        <div style="margin-bottom:12px;">
            <strong><i class="fas fa-envelope"></i> Email:</strong> ${esc(email)}
        </div>
        <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
            <div style="background:#e8f5e9;padding:8px 16px;border-radius:8px;">
                <strong><i class="fas fa-check-circle" style="color:#2e7d32;"></i> Asistencias:</strong> ${asistenciasCount}
            </div>
            <div style="background:#ffebee;padding:8px 16px;border-radius:8px;">
                <strong><i class="fas fa-times-circle" style="color:#c62828;"></i> Faltas:</strong> ${faltasCount}
            </div>
            <div style="background:#e3f2fd;padding:8px 16px;border-radius:8px;">
                <strong><i class="fas fa-calendar-alt"></i> Total sesiones:</strong> ${totalSesiones}
            </div>
        </div>
        <div class="asistencia-detalle-grid">
            <div class="asistencia-detalle-col">
                <h4><i class="fas fa-list"></i> Todas las sesiones del período</h4>
                <ul>${sesionesList}</ul>
            </div>
            <div class="asistencia-detalle-col">
                <h4><i class="fas fa-check-circle"></i> Asistencias registradas (${asistenciasCount})</h4>
                <ul>${asistenciasList}</ul>
            </div>
        </div>
    `;

    overlay.classList.add("show");
}

function setupAsistenciaDetalleModal() {
    const closeBtn = document.getElementById("asistencia-detalle-close");
    const cerrarBtn = document.getElementById("asistencia-detalle-cerrar");
    const overlay = document.getElementById("asistencia-detalle-overlay");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            if (overlay) overlay.classList.remove("show");
        });
    }
    if (cerrarBtn) {
        cerrarBtn.addEventListener("click", () => {
            if (overlay) overlay.classList.remove("show");
        });
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) {
                overlay.classList.remove("show");
            }
        });
    }
}

export function openEditParticipante(idxRoster) {
    if (idxRoster === -1 || Number.isNaN(idxRoster)) {
        toast("No se encontró la información del participante.");
        return;
    }
    const persona = (adminCache.rosterProyecto || [])[idxRoster];
    if (!persona) {
        toast("No se encontró la información del participante.");
        return;
    }

    const idxInput = document.getElementById("edit-participante-idxroster");
    const nombreInput = document.getElementById("edit-participante-nombre");
    const correoInput = document.getElementById("edit-participante-correo");
    const telefonoInput = document.getElementById("edit-participante-telefono");
    const overlay = document.getElementById("edit-participante-overlay");

    if (idxInput) idxInput.value = idxRoster;
    if (nombreInput) nombreInput.value = persona.nombre || "";
    if (correoInput) correoInput.value = persona.email || "";
    if (telefonoInput) telefonoInput.value = persona.telefono || "";

    hideEditParticipanteError();
    if (overlay) overlay.classList.add("show");
}

function closeEditParticipante() {
    const overlay = document.getElementById("edit-participante-overlay");
    const form = document.getElementById("edit-participante-form");
    if (overlay) overlay.classList.remove("show");
    if (form) form.reset();
    hideEditParticipanteError();
}

function showEditParticipanteError(msg) {
    const el = document.getElementById("edit-participante-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
}

function hideEditParticipanteError() {
    const el = document.getElementById("edit-participante-error");
    if (!el) return;
    el.classList.remove("show");
    el.textContent = "";
}

async function handleSaveEditParticipante() {
    const idxRoster = Number(document.getElementById("edit-participante-idxroster")?.value || -1);
    const nombre = document.getElementById("edit-participante-nombre")?.value.trim() || "";
    const correo = document.getElementById("edit-participante-correo")?.value.trim() || "";
    const telefono = document.getElementById("edit-participante-telefono")?.value.trim() || "";

    hideEditParticipanteError();

    if (!nombre || !correo || !telefono) {
        showEditParticipanteError("Todos los campos son obligatorios.");
        return;
    }

    const persona = (adminCache.rosterProyecto || [])[idxRoster];
    if (!persona) {
        showEditParticipanteError("No se encontró la información del participante.");
        return;
    }

    const duplicado = (adminCache.rosterProyecto || []).some(
        (r, idx) => idx !== idxRoster && r && String(r.email || "").trim().toLowerCase() === correo.toLowerCase()
    );
    if (duplicado) {
        showEditParticipanteError("Ya existe otro participante registrado con ese correo.");
        return;
    }

    const btn = document.getElementById("edit-participante-save");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Guardando…";
    }

    try {
        const actualizado = { ...persona, nombre, email: correo, telefono };
        await fbPut(`${state.currentProjectId}/participantes/${idxRoster}`, actualizado);

        adminCache.rosterProyecto[idxRoster] = actualizado;
        state.currentRosterProyecto = adminCache.rosterProyecto;
        state.currentFaseCombinados = combineFaseParticipantes(
            { participantes: adminCache.faseParticipantes },
            adminCache.rosterProyecto
        );
        renderFaseParticipantesTable();

        closeEditParticipante();
        toast("Participante actualizado correctamente");
    } catch (err) {
        showEditParticipanteError(`No se pudo guardar: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Guardar cambios";
        }
    }
}

export function setupEditParticipanteModal() {
    const closeBtn = document.getElementById("edit-participante-close");
    const cancelBtn = document.getElementById("edit-participante-cancel");
    const overlay = document.getElementById("edit-participante-overlay");
    const form = document.getElementById("edit-participante-form");

    if (closeBtn) closeBtn.addEventListener("click", closeEditParticipante);
    if (cancelBtn) cancelBtn.addEventListener("click", closeEditParticipante);
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeEditParticipante();
        });
    }
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            handleSaveEditParticipante();
        });
    }

    setupAsistenciaDetalleModal();
}

// ============================================================
// FUNCIONES PARA ENLACES
// ============================================================

export function renderFaseEnlaces() {
    // No se necesita cargar nada, solo preparar la vista
}

export function generarEnlaceRegistro() {
    if (state.currentProjectId === null || state.currentFaseIndex === null) {
        toast("No hay una fase seleccionada.");
        return;
    }

    qrActualTipo = 'registro';
    const registroUrl = buildRegistroUrl(state.currentProjectId, state.currentFaseIndex);

    configurarVistaQR('registro', registroUrl);
    showView('qr-detail');
    toast("Enlace de registro generado");
}

export function generarEnlaceAsistencia() {
    if (state.currentProjectId === null || state.currentFaseIndex === null) {
        toast("No hay una fase seleccionada.");
        return;
    }

    qrActualTipo = 'asistencia';
    const hoy = todayParts().fecha;
    const asistenciaUrl = buildAsistenciaUrl(state.currentProjectId, state.currentFaseIndex, hoy);

    configurarVistaQR('asistencia', asistenciaUrl);
    showView('qr-detail');
    toast("Enlace de asistencia generado");
}

function configurarVistaQR(tipo, url) {
    const icon = document.getElementById('qr-detail-icon');
    const title = document.getElementById('qr-detail-title');
    const subtitle = document.getElementById('qr-detail-subtitle');
    const input = document.getElementById('qr-detail-input');
    const hint = document.getElementById('qr-detail-hint');
    const box = document.getElementById('qr-detail-box');

    if (tipo === 'registro') {
        if (icon) icon.innerHTML = '<i class="fas fa-user-plus"></i>';
        if (title) title.textContent = 'Enlace de Registro';
        if (subtitle) subtitle.textContent = 'Comparte este enlace para que los estudiantes se registren en esta fase';
        if (hint) hint.innerHTML = '<i class="fas fa-info-circle"></i> Este enlace no vence. Cualquier persona que lo use quedará registrada en el proyecto y asignada a esta fase.';
    } else {
        if (icon) icon.innerHTML = '<i class="fas fa-clipboard-check"></i>';
        if (title) title.textContent = 'Enlace de Asistencia';
        if (subtitle) subtitle.textContent = 'Comparte este enlace para que los estudiantes marquen asistencia hoy';
        const hoy = todayParts().fecha;
        if (hint) hint.innerHTML = `<i class="fas fa-info-circle"></i> Válido solo hoy (${fechaLegible(hoy)}). Proyecta este código para marcar la asistencia de la clase de hoy.`;
    }

    if (input) input.value = url;

    if (box) {
        box.innerHTML = '';
        try {
            new QRCode(box, {
                text: url, width: 280, height: 280,
                colorDark: "#171717", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M,
            });
        } catch {
            box.innerHTML = `<div class="state-msg" style="padding:20px;">No se pudo generar el QR</div>`;
        }
    }
}

export function volverAEnlaces() {
    showView('fase-detail');
    activateFaseTab('enlaces');
    saveCurrentRoute();
}

export function setupQRActions() {
    const btnGenerarRegistro = document.getElementById("btn-generar-registro");
    const btnGenerarAsistencia = document.getElementById("btn-generar-asistencia");

    if (btnGenerarRegistro) {
        btnGenerarRegistro.addEventListener("click", generarEnlaceRegistro);
    }
    if (btnGenerarAsistencia) {
        btnGenerarAsistencia.addEventListener("click", generarEnlaceAsistencia);
    }

    const backBtn = document.getElementById("back-to-fase-enlaces");
    if (backBtn) {
        backBtn.addEventListener("click", volverAEnlaces);
    }

    const copyBtn = document.getElementById("qr-detail-copy");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const input = document.getElementById("qr-detail-input");
            if (input) {
                input.select();
                try {
                    navigator.clipboard.writeText(input.value);
                    toast("Enlace copiado al portapapeles");
                } catch {
                    toast("Selecciona y copia el enlace manualmente");
                }
            }
        });
    }

    const downloadBtn = document.getElementById("qr-detail-download");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            const box = document.getElementById("qr-detail-box");
            if (!box) return;
            const canvas = box.querySelector("canvas");
            if (!canvas) {
                toast("No se pudo descargar el QR. Intenta generarlo de nuevo.");
                return;
            }
            const link = document.createElement("a");
            link.download = `qr-${qrActualTipo}-${Date.now()}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            toast("QR descargado");
        });
    }

    const expandBtn = document.getElementById("qr-detail-expand");
    if (expandBtn) {
        expandBtn.addEventListener("click", () => {
            const box = document.getElementById("qr-detail-box");
            if (!box) return;
            const canvas = box.querySelector("canvas");
            if (!canvas) {
                toast("No se pudo ampliar el QR. Intenta generarlo de nuevo.");
                return;
            }
            const overlay = document.getElementById("qr-expand-overlay");
            const container = document.getElementById("qr-expand-box");
            if (!overlay || !container) return;

            container.innerHTML = "";
            const img = document.createElement("img");
            img.src = canvas.toDataURL("image/png");
            img.style.maxWidth = "100%";
            img.style.maxHeight = "100%";
            container.appendChild(img);
            overlay.style.display = "flex";
        });
    }

    const closeExpand = document.getElementById("qr-expand-close");
    const expandOverlay = document.getElementById("qr-expand-overlay");

    if (closeExpand) closeExpand.addEventListener("click", closeExpandQR);
    if (expandOverlay) {
        expandOverlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeExpandQR();
        });
    }
}

function closeExpandQR() {
    const overlay = document.getElementById("qr-expand-overlay");
    if (overlay) overlay.style.display = "none";
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