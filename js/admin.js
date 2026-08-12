import { state, saveCurrentRoute } from './navigation.js';
import { showView, activateFaseTab, toast } from './ui.js';
import { fbGet, fbPut, fbPatch, fbPost } from './firebase.js';
import { esc, fmtFechaHora, fmtFechaHoraCorta, todayParts, mondayOfCurrentWeek, generarIdParticipante, buscarPorCorreo, fechaLegible } from './utils.js';
import { enviarCorreo, plantillaConfirmacionRegistro, plantillaConfirmacionAsistencia, plantillaSolicitudCreada, plantillaSolicitudAprobada, plantillaSolicitudRechazada, plantillaColaboradorAgregado } from './email.js';
import { PUNTAJE_MAX, ROLES } from './config.js';

// Cache de datos para evitar múltiples peticiones
let adminCache = {
    proyectos: [],
    proyectoActual: null,
    faseActual: null,
    rosterProyecto: [],
    faseParticipantes: [],
    cargado: false,
    proyectoIdActual: null,
    ownerId: null,
    isSuperUser: false,
    usuarios: []
};

// Variable para controlar si se muestra el botón de eliminar
const MOSTRAR_BOTON_ELIMINAR = false;

// Variable para almacenar el tipo de QR actual
let qrActualTipo = 'registro';

// Variable para controlar el modo de edición
let modoEdicion = false;

// Variable para controlar el modo de generación de reportes
let modoReporte = false;

// Variable para almacenar el proyecto actual en el modal
let proyectoEnModal = null;

// Variable global para almacenar los puntajes seleccionados en el modal de calificación
let puntajesSeleccionados = {};

// ============================================================
// FUNCIONES AUXILIARES PARA URLS
// ============================================================

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

// ============================================================
// FUNCIONES PARA OBTENER DATOS DE USUARIOS
// ============================================================

async function getUsuarios() {
    if (adminCache.usuarios && adminCache.usuarios.length > 0) {
        return adminCache.usuarios;
    }
    try {
        const data = await fbGet("usuarios");
        if (data) {
            adminCache.usuarios = Object.entries(data).map(([key, u]) => ({
                firebaseKey: key,
                ...u
            }));
        } else {
            adminCache.usuarios = [];
        }
        return adminCache.usuarios;
    } catch (e) {
        console.error("Error al obtener usuarios:", e);
        return [];
    }
}

async function getUsuarioPorId(id) {
    const usuarios = await getUsuarios();
    return usuarios.find(u => u.id === id) || null;
}

// ============================================================
// FUNCIÓN PARA OBTENER NOMBRE DEL PROPIETARIO
// ============================================================

async function obtenerNombrePropietario(propietarioId) {
    if (!propietarioId) return "Desconocido";
    const usuario = await getUsuarioPorId(propietarioId);
    return usuario ? usuario.nombre : "Desconocido";
}

// ============================================================
// FUNCIÓN PARA VERIFICAR SI EL USUARIO ES COLABORADOR DEL PROYECTO
// ============================================================

function esColaborador(proyecto, userId) {
    if (!proyecto || !userId) return false;
    if (!Array.isArray(proyecto.colaboradores)) return false;
    return proyecto.colaboradores.some(col => col.idColaborador === userId);
}

function esPropietario(proyecto, userId) {
    if (!proyecto || !userId) return false;
    return proyecto.propietario && proyecto.propietario.idPropietario === userId;
}

function obtenerRolEnProyecto(proyecto, userId) {
    if (!proyecto || !userId) return null;
    if (esPropietario(proyecto, userId)) return 'propietario';
    if (esColaborador(proyecto, userId)) return 'colaborador';
    return null;
}

// ============================================================
// FUNCIONES PARA CARGA DE PROYECTOS
// ============================================================

export async function loadProjectList() {
    const grid = document.getElementById("project-grid");
    if (!grid) return;

    grid.innerHTML = `<div class="state-msg"><div class="spinner"></div>Cargando proyectos…</div>`;
    try {
        const data = await fbGet("proyectos");
        let projects = data ? Object.entries(data).map(([id, p]) => ({ id, ...p })) : [];

        if (!state.isSuperUser && state.userId) {
            projects = projects.filter(p =>
                p.estadoSolicitud === "aprobada" &&
                (
                    (p.propietario && p.propietario.idPropietario === state.userId) ||
                    (Array.isArray(p.colaboradores) && p.colaboradores.some(col => col.idColaborador === state.userId))
                )
            );
        }

        adminCache.proyectos = projects;
        adminCache.cargado = true;
        adminCache.proyectoIdActual = null;
        state.projects = projects;

        await getUsuarios();

        renderProjectGrid(projects, grid);
    } catch (err) {
        grid.innerHTML = `<div class="state-msg">No se pudo cargar la lista de proyectos.<br>${esc(err.message)}</div>`;
    }
}

export async function loadProjectListByOwner(ownerId) {
    const grid = document.getElementById("project-grid");
    if (!grid) return;

    grid.innerHTML = `<div class="state-msg"><div class="spinner"></div>Cargando tus proyectos…</div>`;
    try {
        const data = await fbGet("proyectos");
        let projects = data ? Object.entries(data).map(([id, p]) => ({ id, ...p })) : [];

        projects = projects.filter(p =>
            p.estadoSolicitud === "aprobada" &&
            (
                (p.propietario && p.propietario.idPropietario === ownerId) ||
                (Array.isArray(p.colaboradores) && p.colaboradores.some(col => col.idColaborador === ownerId))
            )
        );

        adminCache.proyectos = projects;
        adminCache.cargado = true;
        adminCache.ownerId = ownerId;
        state.projects = projects;
        state.proyectosPropios = projects.map(p => p.id);

        await getUsuarios();

        if (!projects.length) {
            grid.innerHTML = `<div class="state-msg">No tienes proyectos aprobados como propietario o colaborador. Crea una solicitud desde el menú "Solicitar proyecto".</div>`;
            return;
        }

        renderProjectGrid(projects, grid);
    } catch (err) {
        grid.innerHTML = `<div class="state-msg">No se pudo cargar la lista de proyectos.<br>${esc(err.message)}</div>`;
    }
}

function renderProjectGrid(projects, grid) {
    if (!projects || !projects.length) {
        grid.innerHTML = `<div class="state-msg">No tienes proyectos aprobados. Crea una solicitud desde el menú "Solicitar proyecto".</div>`;
        return;
    }

    const userId = state.userId;

    grid.innerHTML = projects
        .map((p) => {
            const participantes = p.participantes ? p.participantes.length : 0;
            const activa = (p.fases || []).some((f) => f && f.activa);

            const rol = obtenerRolEnProyecto(p, userId);
            const esProp = rol === 'propietario';
            const esColab = rol === 'colaborador';

            const propietarioNombre = p.propietario ?
                (adminCache.usuarios.find(u => u.id === p.propietario.idPropietario)?.nombre || `ID: ${p.propietario.idPropietario}`) :
                "Sin propietario";

            let rolBadge = '';
            if (esProp) {
                rolBadge = `<span class="badge badge--primary"><i class="fas fa-crown"></i> Propietario</span>`;
            } else if (esColab) {
                rolBadge = `<span class="badge badge--success"><i class="fas fa-user-friends"></i> Colaborador</span>`;
            }

            return `
        <div class="event-card" data-id="${esc(p.id)}" tabindex="0" role="button">
          <div class="event-card__index">PROYECTO #${esc(p.id)}</div>
          <h3>${esc(p.nombre || "Sin nombre")}</h3>
          <p>${esc(p.descripcion || "Sin descripción")}</p>
          <div class="event-card__meta">
            <span class="badge"><i class="fas fa-user"></i> ${esc(propietarioNombre)}</span>
            ${rolBadge}
            <span class="badge"><i class="fas fa-users"></i> ${participantes} registrado${participantes === 1 ? "" : "s"}</span>
            <span class="badge ${activa ? "badge--primary" : ""}">${activa ? '<i class="fas fa-play-circle"></i> Activa' : '<i class="fas fa-pause-circle"></i> Inactiva'}</span>
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

// ============================================================
// DETALLE DEL PROYECTO
// ============================================================

export async function loadProjectDetail(id, faseToOpen) {
    const detailView = document.getElementById("view-admin-detail");
    if (!detailView) return;

    showView("admin-detail");
    state.currentProjectId = id;

    const title = document.getElementById("detail-title");
    const sub = document.getElementById("detail-sub");
    const stats = document.getElementById("detail-stats");
    const desc = document.getElementById("event-desc");
    const rolInfo = document.getElementById("detail-rol-info");

    if (title) title.textContent = "Cargando…";
    if (sub) sub.textContent = "";
    if (stats) stats.innerHTML = "";
    if (rolInfo) rolInfo.innerHTML = "";

    try {
        let p = adminCache.proyectos.find(proj => String(proj.id) === String(id));

        if (!p) {
            p = await fbGet(`proyectos/${id}`);
            if (!p) {
                throw new Error("Proyecto no encontrado");
            }
            const existIdx = adminCache.proyectos.findIndex(proj => String(proj.id) === String(id));
            if (existIdx !== -1) {
                adminCache.proyectos[existIdx] = { id, ...p };
            } else {
                adminCache.proyectos.push({ id, ...p });
            }
        }

        if (!Array.isArray(p.colaboradores)) {
            p.colaboradores = [];
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

        await renderRolInfo(p);

        renderProjectStats(p);
        renderFasesList();

        if (desc) desc.textContent = p.descripcion || "Sin descripción.";

        if (faseToOpen !== undefined && faseToOpen !== null) {
            await openFaseDetail(Number(faseToOpen));
        }
        saveCurrentRoute();
    } catch (err) {
        console.error("Error cargando proyecto:", err);
        if (title) title.textContent = "Error al cargar el proyecto";
        if (sub) sub.textContent = err.message;
    }
}

// ============================================================
// FUNCIÓN PARA MOSTRAR INFORMACIÓN DE ROL EN DETALLE
// ============================================================

async function renderRolInfo(proyecto) {
    const container = document.getElementById("detail-rol-info");
    if (!container) return;

    const userId = state.userId;
    const esProp = esPropietario(proyecto, userId);
    const esColab = esColaborador(proyecto, userId);

    const propietario = await getUsuarioPorId(proyecto.propietario?.idPropietario);
    const propietarioNombre = propietario ? propietario.nombre : "Desconocido";

    let colaboradoresLista = [];

    if (Array.isArray(proyecto.colaboradores) && proyecto.colaboradores.length > 0) {
        for (const col of proyecto.colaboradores) {
            const usuario = await getUsuarioPorId(col.idColaborador);
            if (usuario) {
                colaboradoresLista.push({
                    nombre: usuario.nombre,
                    email: usuario.correo || 'Sin correo'
                });
            }
        }
    }

    let rolBadge = '';
    if (esProp) {
        rolBadge = '<span class="badge badge--primary"><i class="fas fa-crown"></i> Propietario</span>';
    } else if (esColab) {
        rolBadge = '<span class="badge badge--success"><i class="fas fa-user-friends"></i> Colaborador</span>';
    } else {
        rolBadge = '<span class="badge">Sin rol</span>';
    }

    const puedeAgregarColaborador = esProp || state.isSuperUser;
    const colaboradoresCount = colaboradoresLista.length;

    let colaboradoresHTML = '';
    if (colaboradoresCount > 0) {
        const tooltipContent = colaboradoresLista.map(c => `
            <div class="colaborador-tooltip-item">
                <span class="colab-nombre">${esc(c.nombre)}</span>
                <span class="colab-email"><i class="fas fa-envelope"></i> ${esc(c.email)}</span>
            </div>
        `).join('');

        colaboradoresHTML = `
            <span class="colaboradores-wrapper" id="colaboradores-wrapper">
                <span class="colaboradores-trigger" id="colaboradores-trigger">
                    <i class="fas fa-user-friends"></i> ${colaboradoresCount} colaborador${colaboradoresCount > 1 ? 'es' : ''}
                    <span class="tooltip-indicator">ⓘ</span>
                </span>
                <div class="colaboradores-tooltip" id="colaboradores-tooltip">
                    <div class="colaboradores-tooltip__header">
                        <i class="fas fa-user-friends"></i> Colaboradores
                    </div>
                    <div class="colaboradores-tooltip__list">
                        ${tooltipContent}
                    </div>
                </div>
            </span>
        `;
    } else {
        colaboradoresHTML = `
            <span style="font-size:11px;color:var(--gray-400);">
                <i class="fas fa-user-friends"></i> Sin colaboradores
            </span>
        `;
    }

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--gray-50);padding:10px 16px;border-radius:var(--radius-sm);border:1px solid var(--gray-200);position:relative;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:12px;font-weight:600;color:var(--gray-600);">
                    <i class="fas fa-user"></i> Propietario: ${esc(propietarioNombre)}
                </span>
                ${rolBadge}
                ${colaboradoresHTML}
            </div>
            ${puedeAgregarColaborador ? `
                <button class="btn btn-outline btn-sm" id="btn-agregar-colaborador" style="margin-left:auto;font-size:12px;padding:6px 14px;">
                    <i class="fas fa-user-plus"></i> + Colaborador
                </button>
            ` : ''}
        </div>
    `;

    const wrapper = document.getElementById("colaboradores-wrapper");
    const trigger = document.getElementById("colaboradores-trigger");
    const tooltip = document.getElementById("colaboradores-tooltip");

    if (trigger && tooltip && wrapper) {
        function posicionarTooltip() {
            const wrapperRect = wrapper.getBoundingClientRect();
            const triggerRect = trigger.getBoundingClientRect();
            const left = triggerRect.left - wrapperRect.left + (triggerRect.width / 2);
            const top = triggerRect.bottom - wrapperRect.top + 4;

            tooltip.style.position = 'absolute';
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.transform = 'translateX(-50%)';
            tooltip.style.margin = '0';
        }

        function mostrarTooltip(e) {
            posicionarTooltip();
            tooltip.classList.add('show');
        }

        function ocultarTooltip() {
            tooltip.classList.remove('show');
        }

        trigger.addEventListener("mouseenter", mostrarTooltip);
        trigger.addEventListener("mouseleave", () => {
            setTimeout(() => {
                if (!tooltip.matches(':hover')) {
                    ocultarTooltip();
                }
            }, 200);
        });

        tooltip.addEventListener("mouseenter", () => {
            tooltip.classList.add('show');
        });

        tooltip.addEventListener("mouseleave", ocultarTooltip);

        const reposition = () => {
            if (tooltip.classList.contains('show')) {
                posicionarTooltip();
            }
        };
        window.addEventListener('scroll', reposition, { passive: true });
        window.addEventListener('resize', reposition, { passive: true });

        let touchTimeout = null;
        trigger.addEventListener("touchstart", (e) => {
            e.preventDefault();
            e.stopPropagation();

            posicionarTooltip();

            if (tooltip.classList.contains("show")) {
                tooltip.classList.remove("show");
                clearTimeout(touchTimeout);
            } else {
                tooltip.classList.add("show");
                clearTimeout(touchTimeout);
                touchTimeout = setTimeout(() => {
                    tooltip.classList.remove("show");
                }, 5000);
            }
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target) && !tooltip.contains(e.target)) {
                ocultarTooltip();
            }
        });
    }

    const btnAgregar = document.getElementById("btn-agregar-colaborador");
    if (btnAgregar) {
        btnAgregar.addEventListener("click", () => {
            abrirModalAgregarColaborador(proyecto);
        });
    }
}

// ============================================================
// MODAL PARA AGREGAR COLABORADORES
// ============================================================

async function abrirModalAgregarColaborador(proyecto) {
    proyectoEnModal = proyecto;

    const overlay = document.getElementById("agregar-colaborador-overlay");
    const listContainer = document.getElementById("agregar-colaborador-lista");
    const searchInput = document.getElementById("agregar-colaborador-buscar");
    const selectedContainer = document.getElementById("agregar-colaborador-seleccionados");
    const btnAgregar = document.getElementById("agregar-colaborador-btn-agregar");
    const errorEl = document.getElementById("agregar-colaborador-error");

    if (!overlay || !listContainer) return;

    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }
    if (selectedContainer) selectedContainer.innerHTML = '';
    if (searchInput) searchInput.value = '';

    const usuarios = await getUsuarios();

    const colaboradoresIds = new Set();
    if (Array.isArray(proyecto.colaboradores)) {
        proyecto.colaboradores.forEach(col => colaboradoresIds.add(col.idColaborador));
    }
    if (proyecto.propietario?.idPropietario) {
        colaboradoresIds.add(proyecto.propietario.idPropietario);
    }

    const usuariosDisponibles = usuarios.filter(u =>
        !colaboradoresIds.has(u.id) &&
        u.rol !== ROLES.ADMIN
    );

    if (usuariosDisponibles.length === 0) {
        listContainer.innerHTML = `<div class="state-msg" style="padding:20px;">No hay usuarios disponibles para agregar como colaboradores.</div>`;
        if (btnAgregar) btnAgregar.disabled = true;
        overlay.classList.add("show");
        return;
    }

    let seleccionados = new Set();

    function renderLista(filtro = '') {
        const filtroLower = filtro.toLowerCase().trim();
        const filtrados = usuariosDisponibles.filter(u => {
            const nombre = (u.nombre || '').toLowerCase();
            const correo = (u.correo || '').toLowerCase();
            return nombre.includes(filtroLower) || correo.includes(filtroLower);
        });

        if (filtrados.length === 0) {
            listContainer.innerHTML = `<div class="state-msg" style="padding:20px;font-size:13px;">No se encontraron usuarios que coincidan con la búsqueda.</div>`;
            return;
        }

        listContainer.innerHTML = filtrados.map(u => {
            const isSelected = seleccionados.has(u.id);
            return `
                <div class="colaborador-item ${isSelected ? 'selected' : ''}" data-userid="${u.id}">
                    <div class="colaborador-item__info">
                        <div class="colaborador-item__nombre">${esc(u.nombre || 'Sin nombre')}</div>
                        <div class="colaborador-item__email"><i class="fas fa-envelope"></i> ${esc(u.correo || 'Sin correo')}</div>
                        <div class="colaborador-item__telefono"><i class="fas fa-phone"></i> ${esc(u.telefono || 'Sin teléfono')}</div>
                    </div>
                    <div class="colaborador-item__checkbox">
                        <input type="checkbox" class="colaborador-checkbox" data-userid="${u.id}" ${isSelected ? 'checked' : ''} />
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.colaborador-checkbox').forEach(cb => {
            cb.addEventListener('change', function () {
                const userId = this.dataset.userid;
                if (this.checked) {
                    seleccionados.add(userId);
                } else {
                    seleccionados.delete(userId);
                }
                const item = this.closest('.colaborador-item');
                if (item) {
                    item.classList.toggle('selected', this.checked);
                }
                actualizarSeleccionados();
            });
        });

        listContainer.querySelectorAll('.colaborador-item').forEach(item => {
            item.addEventListener('click', function (e) {
                if (e.target.closest('.colaborador-checkbox')) return;
                const cb = this.querySelector('.colaborador-checkbox');
                if (cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    function actualizarSeleccionados() {
        if (!selectedContainer) return;
        const count = seleccionados.size;
        if (count === 0) {
            selectedContainer.innerHTML = `<span style="color:var(--gray-400);font-size:12px;">No hay usuarios seleccionados</span>`;
        } else {
            const nombres = Array.from(seleccionados).map(id => {
                const u = usuariosDisponibles.find(us => us.id === id);
                return u ? u.nombre : id;
            });
            selectedContainer.innerHTML = `
                <span style="font-size:12px;font-weight:600;color:var(--gray-600);">
                    <i class="fas fa-user-check"></i> ${count} usuario${count > 1 ? 's' : ''} seleccionado${count > 1 ? 's' : ''}
                </span>
                <span style="font-size:11px;color:var(--gray-500);">${nombres.join(', ')}</span>
            `;
        }
        if (btnAgregar) {
            btnAgregar.disabled = seleccionados.size === 0;
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            renderLista(this.value);
        });
        searchInput.focus();
    }

    renderLista();
    actualizarSeleccionados();

    if (btnAgregar) {
        btnAgregar.disabled = true;
        btnAgregar.onclick = async () => {
            await agregarColaboradores(proyectoEnModal, Array.from(seleccionados));
        };
    }

    const closeBtn = document.getElementById("agregar-colaborador-close");
    const cancelBtn = document.getElementById("agregar-colaborador-cancel");
    if (closeBtn) closeBtn.onclick = () => {
        overlay.classList.remove("show");
        proyectoEnModal = null;
    };
    if (cancelBtn) cancelBtn.onclick = () => {
        overlay.classList.remove("show");
        proyectoEnModal = null;
    };

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.classList.remove("show");
            proyectoEnModal = null;
        }
    };

    overlay.classList.add("show");
}

// ============================================================
// FUNCIÓN PARA AGREGAR COLABORADORES
// ============================================================

async function agregarColaboradores(proyecto, userIds) {
    if (!userIds || userIds.length === 0) return;
    if (!proyecto || !proyecto.id) {
        toast("Error: No se encontró el proyecto. Intenta nuevamente.");
        return;
    }

    const overlay = document.getElementById("agregar-colaborador-overlay");
    const errorEl = document.getElementById("agregar-colaborador-error");
    const btnAgregar = document.getElementById("agregar-colaborador-btn-agregar");

    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }

    if (btnAgregar) {
        btnAgregar.disabled = true;
        btnAgregar.textContent = "Agregando...";
    }

    try {
        const proyectoActualizado = await fbGet(`proyectos/${proyecto.id}`);
        if (!proyectoActualizado) {
            throw new Error("No se pudo obtener el proyecto actualizado");
        }

        let colaboradoresActuales = Array.isArray(proyectoActualizado.colaboradores) ? [...proyectoActualizado.colaboradores] : [];
        const idsExistentes = new Set(colaboradoresActuales.map(col => col.idColaborador));

        const nuevosColaboradores = [];
        const usuariosAgregados = [];

        for (const userId of userIds) {
            if (!idsExistentes.has(userId)) {
                nuevosColaboradores.push({ idColaborador: userId });
                idsExistentes.add(userId);
                const usuario = await getUsuarioPorId(userId);
                if (usuario) {
                    usuariosAgregados.push(usuario);
                }
            }
        }

        if (nuevosColaboradores.length === 0) {
            if (errorEl) {
                errorEl.textContent = "Los usuarios seleccionados ya son colaboradores.";
                errorEl.style.display = "block";
            }
            if (btnAgregar) {
                btnAgregar.disabled = false;
                btnAgregar.textContent = "Agregar colaboradores";
            }
            return;
        }

        const colaboradoresFinal = [...colaboradoresActuales, ...nuevosColaboradores];

        await fbPatch(`proyectos/${proyecto.id}`, { colaboradores: colaboradoresFinal });

        const idx = adminCache.proyectos.findIndex(p => String(p.id) === String(proyecto.id));
        if (idx !== -1) {
            adminCache.proyectos[idx].colaboradores = colaboradoresFinal;
            if (adminCache.proyectoActual && String(adminCache.proyectoActual.id) === String(proyecto.id)) {
                adminCache.proyectoActual.colaboradores = colaboradoresFinal;
            }
        }

        const propietarioNombre = await obtenerNombrePropietario(proyecto.propietario?.idPropietario);
        for (const usuario of usuariosAgregados) {
            const html = plantillaColaboradorAgregado({
                nombre: usuario.nombre || 'Usuario',
                proyecto: proyecto.nombre || `Proyecto #${proyecto.id}`,
                propietario: propietarioNombre
            });
            await enviarCorreo(
                usuario.correo,
                `📋 Has sido agregado como colaborador al proyecto ${proyecto.nombre}`,
                html
            );
        }

        overlay.classList.remove("show");
        proyectoEnModal = null;

        await loadProjectDetail(proyecto.id);

        toast(`${usuariosAgregados.length} colaborador${usuariosAgregados.length > 1 ? 'es' : ''} agregado${usuariosAgregados.length > 1 ? 's' : ''} correctamente`);

    } catch (err) {
        console.error("Error al agregar colaboradores:", err);
        if (errorEl) {
            errorEl.textContent = `Error al agregar colaboradores: ${err.message}`;
            errorEl.style.display = "block";
        }
        toast(`Error: ${err.message}`);
    } finally {
        if (btnAgregar) {
            btnAgregar.disabled = false;
            btnAgregar.textContent = "Agregar colaboradores";
        }
    }
}

// ============================================================
// FUNCIÓN PARA ACTUALIZAR EL CACHE DE USUARIOS
// ============================================================

export async function actualizarCacheUsuarios() {
    adminCache.usuarios = [];
    await getUsuarios();
}

// ============================================================
// RESTO DE FUNCIONES
// ============================================================

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
            <span class="stat-mini__label"><i class="fas fa-users"></i> Participantes</span>
        </div>
        <div class="stat-mini">
            <span class="stat-mini__value">${fases.length}</span>
            <span class="stat-mini__label"><i class="fas fa-layer-group"></i> Fases</span>
        </div>
        <div class="stat-mini">
            <span class="stat-mini__value">${fasesActivas}</span>
            <span class="stat-mini__label"><i class="fas fa-play-circle"></i> Activas</span>
        </div>
        <div class="stat-mini">
            <span class="stat-mini__value">${totalAsistencias}</span>
            <span class="stat-mini__label"><i class="fas fa-check-circle"></i> Asistencias</span>
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
        <span class="badge ${f.activa ? "badge--primary" : ""}">${f.activa ? '<i class="fas fa-play-circle"></i> Activa' : '<i class="fas fa-stop-circle"></i> Inactiva'}</span>
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

// ============================================================
// FUNCIÓN PARA CREAR FASES
// ============================================================

export async function crearFase(proyectoId, datosFase) {
    try {
        const { titulo, fechaHoraInicio, tiempoLimiteMin, activa } = datosFase;

        const proyecto = await fbGet(`proyectos/${proyectoId}`);
        if (!proyecto) {
            throw new Error("Proyecto no encontrado");
        }

        const fases = Array.isArray(proyecto.fases) ? [...proyecto.fases] : [];

        const nuevaFase = {
            titulo: titulo || `Fase ${fases.length + 1}`,
            fechaHoraInicio: fechaHoraInicio || new Date().toISOString().slice(0, 16).replace('T', ' '),
            tiempoLimiteMin: tiempoLimiteMin || 60,
            activa: activa !== undefined ? activa : true,
            participantes: []
        };

        fases.push(nuevaFase);

        await fbPatch(`proyectos/${proyectoId}`, { fases });

        const idx = adminCache.proyectos.findIndex(p => String(p.id) === String(proyectoId));
        if (idx !== -1) {
            adminCache.proyectos[idx].fases = fases;
            if (adminCache.proyectoActual && String(adminCache.proyectoActual.id) === String(proyectoId)) {
                adminCache.proyectoActual.fases = fases;
                state.currentFases = fases;
            }
        }

        toast("Fase creada correctamente");
        return { success: true, fase: nuevaFase, index: fases.length - 1 };
    } catch (err) {
        console.error("Error al crear fase:", err);
        toast(`Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// ============================================================
// FUNCIONES PARA GESTIÓN DE EVALUACIONES
// ============================================================

export async function mostrarModalCrearEvaluacion() {
    const overlay = document.getElementById("crear-evaluacion-overlay");
    if (!overlay) {
        toast("El modal de evaluación no está disponible");
        return;
    }

    const nombreInput = document.getElementById("evaluacion-nombre");
    const descripcionInput = document.getElementById("evaluacion-descripcion");
    const dimensionesContainer = document.getElementById("evaluacion-dimensiones-container");

    if (nombreInput) nombreInput.value = "";
    if (descripcionInput) descripcionInput.value = "";

    if (dimensionesContainer) {
        dimensionesContainer.innerHTML = `
            <div class="dimension-row" data-dimension-id="0">
                <div class="field" style="flex:2;">
                    <label>Nombre de la dimensión</label>
                    <input type="text" class="dimension-nombre" value="Dimensión 1" placeholder="Ej: Conocimiento" />
                </div>
                <div class="field" style="flex:3;">
                    <label>Descripción</label>
                    <input type="text" class="dimension-descripcion" value="" placeholder="Descripción de la dimensión" />
                </div>
                <button type="button" class="btn btn-danger btn-sm eliminar-dimension" style="margin-top:22px;flex-shrink:0;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }

    overlay.classList.add("show");
}

// ============================================================
// Refresca desde Firebase los datos de la fase actual (participantes,
// asistencias, evaluaciones asignadas) SIN resetear toda la vista
// (búsqueda, filtros, pestaña activa, etc.).
//
// Se usa después de crear una evaluación o de calificar a un
// participante: ambas operaciones modifican el nodo
// "proyectos/{id}/fases/{idx}/participantes" directamente en Firebase,
// pero el caché local (adminCache.proyectoActual / adminCache.faseParticipantes)
// no se enteraba de ese cambio. Eso causaba que, justo después de crear
// una evaluación, al intentar calificarla apareciera el error
// "Evaluación no encontrada para este participante" (porque el caché
// todavía no tenía la evaluación recién asignada), y que después de
// calificar el informe/tabla siguiera mostrando el puntaje anterior.
// ============================================================
async function refreshFaseParticipantesFromServer(faseIndex) {
    try {
        if (!state.currentProjectId || faseIndex === null || faseIndex === undefined) return null;

        const fase = await fbGet(`proyectos/${state.currentProjectId}/fases/${faseIndex}`);
        if (!fase) return null;

        if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
            adminCache.proyectoActual.fases[faseIndex] = fase;
        }
        adminCache.faseActual = fase;
        adminCache.faseParticipantes = Array.isArray(fase.participantes) ? fase.participantes : [];

        state.currentFaseData = fase;
        state.currentFaseCombinados = combineFaseParticipantes(fase, adminCache.rosterProyecto);

        return fase;
    } catch (err) {
        console.error("Error al refrescar participantes de la fase:", err);
        return null;
    }
}

export async function crearEvaluacionDesdeModal(proyectoId, faseIndex) {
    try {
        const nombreInput = document.getElementById("evaluacion-nombre");
        const descripcionInput = document.getElementById("evaluacion-descripcion");
        const dimensionesRows = document.querySelectorAll(".dimension-row");

        const nombre = nombreInput?.value.trim() || "Evaluación sin nombre";
        const descripcion = descripcionInput?.value.trim() || "";

        const dimensiones = [];
        dimensionesRows.forEach((row, index) => {
            const nombreDim = row.querySelector(".dimension-nombre")?.value.trim() || `Dimensión ${index + 1}`;
            const descDim = row.querySelector(".dimension-descripcion")?.value.trim() || "";
            dimensiones.push({
                dimensionId: index,
                nombreDimension: nombreDim,
                descripcion: descDim
            });
        });

        if (dimensiones.length === 0) {
            dimensiones.push({
                dimensionId: 0,
                nombreDimension: "Dimensión 1",
                descripcion: ""
            });
        }

        const datosEvaluacion = {
            nombreEvaluacion: nombre,
            descripcion: descripcion,
            dimensiones: dimensiones,
            proyectoId: proyectoId || state.currentProjectId,
            faseId: faseIndex !== undefined ? faseIndex : state.currentFaseIndex,
            usuarioId: state.userId,
            periodo: "",
            observacion: ""
        };

        const { crearEvaluacion } = await import('./evaluaciones.js');
        const resultado = await crearEvaluacion(datosEvaluacion);

        if (resultado.success) {
            const overlay = document.getElementById("crear-evaluacion-overlay");
            if (overlay) overlay.classList.remove("show");

            if (state.currentProjectId && state.currentFaseIndex !== null) {
                // Refrescamos el caché desde Firebase ANTES de reabrir la
                // vista, para que la evaluación recién creada (ya asignada
                // a cada participante) esté disponible de inmediato y no
                // se produzcan errores al intentar calificarla.
                await refreshFaseParticipantesFromServer(state.currentFaseIndex);
                await openFaseDetail(state.currentFaseIndex);
            }
        }

        return resultado;
    } catch (err) {
        console.error("Error al crear evaluación:", err);
        toast(`Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

export function agregarDimensionEnModal() {
    const container = document.getElementById("evaluacion-dimensiones-container");
    if (!container) return;

    const rows = container.querySelectorAll(".dimension-row");
    const newId = rows.length;

    const newRow = document.createElement("div");
    newRow.className = "dimension-row";
    newRow.dataset.dimensionId = newId;
    newRow.innerHTML = `
        <div class="field" style="flex:2;">
            <label>Nombre de la dimensión</label>
            <input type="text" class="dimension-nombre" value="Dimensión ${newId + 1}" placeholder="Ej: Conocimiento" />
        </div>
        <div class="field" style="flex:3;">
            <label>Descripción</label>
            <input type="text" class="dimension-descripcion" value="" placeholder="Descripción de la dimensión" />
        </div>
        <button type="button" class="btn btn-danger btn-sm eliminar-dimension" style="margin-top:22px;flex-shrink:0;">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(newRow);

    const eliminarBtn = newRow.querySelector(".eliminar-dimension");
    if (eliminarBtn) {
        eliminarBtn.addEventListener("click", () => {
            if (container.querySelectorAll(".dimension-row").length > 1) {
                newRow.remove();
            } else {
                toast("Debe haber al menos una dimensión");
            }
        });
    }
}

// ============================================================
// FUNCIONES PARA VER EVALUACIONES EN UNA FASE
// ============================================================

export async function renderEvaluacionesFase() {
    const container = document.getElementById("fase-evaluaciones-container");
    if (!container) return;

    try {
        const { obtenerEvaluaciones } = await import('./evaluaciones.js');
        const evaluaciones = await obtenerEvaluaciones(
            state.currentProjectId,
            state.currentFaseIndex
        );

        if (!evaluaciones || evaluaciones.length === 0) {
            container.innerHTML = `
                <div class="state-msg" style="padding:20px;">
                    <p style="margin:0;">No hay evaluaciones asignadas a esta fase.</p>
                    <button class="btn btn-primary btn-sm" id="btn-crear-evaluacion-desde-fase" style="margin-top:12px;">
                        <i class="fas fa-plus-circle"></i> Crear evaluación
                    </button>
                </div>
            `;
            const btn = container.querySelector("#btn-crear-evaluacion-desde-fase");
            if (btn) {
                btn.addEventListener("click", () => {
                    mostrarModalCrearEvaluacion();
                });
            }
            return;
        }

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="margin:0;font-size:14px;color:var(--gray-700);">
                    <i class="fas fa-clipboard-list"></i> Evaluaciones (${evaluaciones.length})
                </h4>
                <button class="btn btn-primary btn-sm" id="btn-crear-evaluacion-desde-fase">
                    <i class="fas fa-plus-circle"></i> Crear
                </button>
            </div>
            <div class="evaluaciones-grid">
                ${evaluaciones.map((evalData, idx) => `
                    <div class="evaluacion-card" data-eval-id="${evalData.evaluacionId}" data-firebase-key="${evalData.firebaseKey}">
                        <div class="evaluacion-card__header">
                            <h5>${esc(evalData.nombreEvaluacion || `Evaluación ${idx + 1}`)}</h5>
                            <span class="badge badge--primary">${evalData.estado || "Activa"}</span>
                        </div>
                        <p class="evaluacion-card__desc">${esc(evalData.descripcion || "Sin descripción")}</p>
                        <div class="evaluacion-card__dimensiones">
                            ${(evalData.dimensiones || []).map(dim => `
                                <span class="dimension-tag">${esc(dim.nombreDimension)}</span>
                            `).join('')}
                        </div>
                        ${evalData.periodo ? `<div style="font-size:11px;color:var(--gray-500);margin-bottom:8px;"><strong>Periodo:</strong> ${esc(evalData.periodo)}</div>` : ''}
                        <div class="evaluacion-card__actions">
                            <button class="btn btn-outline btn-sm ver-evaluacion-btn" data-eval-id="${evalData.evaluacionId}">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                            <button class="btn btn-danger btn-sm eliminar-evaluacion-btn" 
                                    data-firebase-key="${evalData.firebaseKey}"
                                    data-eval-id="${evalData.evaluacionId}"
                                    data-nombre="${esc(evalData.nombreEvaluacion)}">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        const btnCrear = container.querySelector("#btn-crear-evaluacion-desde-fase");
        if (btnCrear) {
            btnCrear.addEventListener("click", mostrarModalCrearEvaluacion);
        }

        container.querySelectorAll(".ver-evaluacion-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const evalId = Number(btn.dataset.evalId);
                verDetalleEvaluacion(evalId);
            });
        });

        container.querySelectorAll(".eliminar-evaluacion-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const firebaseKey = btn.dataset.firebaseKey;
                const evalId = Number(btn.dataset.evalId);
                const nombre = btn.dataset.nombre;
                eliminarEvaluacionHandler(firebaseKey, evalId, nombre);
            });
        });

    } catch (err) {
        console.error("Error al renderizar evaluaciones:", err);
        container.innerHTML = `<div class="state-msg">Error al cargar evaluaciones: ${esc(err.message)}</div>`;
    }
}

// ============================================================
// FUNCIÓN VER DETALLE DE EVALUACIÓN
// ============================================================

export async function verDetalleEvaluacion(evaluacionId) {
    try {
        const { obtenerEvaluaciones } = await import('./evaluaciones.js');
        const evaluaciones = await obtenerEvaluaciones(
            state.currentProjectId,
            state.currentFaseIndex
        );

        const evaluacion = evaluaciones.find(e => e.evaluacionId === evaluacionId);
        if (!evaluacion) {
            toast("Evaluación no encontrada");
            return;
        }

        const overlay = document.getElementById("ver-evaluacion-overlay");
        const contenido = document.getElementById("ver-evaluacion-contenido");
        const titulo = document.getElementById("ver-evaluacion-titulo");

        if (!overlay || !contenido) return;

        titulo.textContent = evaluacion.nombreEvaluacion || "Detalle de evaluación";

        const dimensiones = evaluacion.dimensiones || [];

        contenido.innerHTML = `
            <div style="margin-bottom:16px;">
                <p><strong>Descripción:</strong> ${esc(evaluacion.descripcion || "Sin descripción")}</p>
                <p><strong>Estado:</strong> <span class="badge badge--primary">${esc(evaluacion.estado || "Activa")}</span></p>
                <p><strong>Fecha creación:</strong> ${esc(evaluacion.fechaCreacion || "—")}</p>
                ${evaluacion.periodo ? `<p><strong>Periodo:</strong> ${esc(evaluacion.periodo)}</p>` : ''}
                ${evaluacion.observacion ? `<p><strong>Observación general:</strong> ${esc(evaluacion.observacion)}</p>` : ''}
            </div>
            <h4 style="margin:0 0 8px 0;font-size:13px;">Dimensiones</h4>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${dimensiones.map(dim => `
                    <div style="background:var(--gray-50);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--gray-200);">
                        <strong>${esc(dim.nombreDimension)}</strong>
                        ${dim.descripcion ? `<p style="margin:4px 0 0 0;font-size:12px;color:var(--gray-500);">${esc(dim.descripcion)}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        overlay.classList.add("show");
    } catch (err) {
        console.error("Error al ver detalle de evaluación:", err);
        toast(`Error: ${err.message}`);
    }
}

// ============================================================
// FUNCIONES PARA ELIMINAR EVALUACIÓN
// ============================================================

export async function eliminarEvaluacionHandler(firebaseKey, evaluacionId, nombreEvaluacion) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la evaluación "${nombreEvaluacion}"?\n\nEsto también eliminará las calificaciones de todos los participantes.`)) {
        return;
    }

    try {
        const { eliminarEvaluacion } = await import('./evaluaciones.js');
        const resultado = await eliminarEvaluacion(firebaseKey, evaluacionId);

        if (resultado.success) {
            await renderEvaluacionesFase();
        }
    } catch (err) {
        console.error("Error al eliminar evaluación:", err);
        toast(`Error: ${err.message}`);
    }
}

// ============================================================
// FUNCIONES PARA CALIFICAR CON ESTRELLAS
// ============================================================

export async function mostrarModalSeleccionarEvaluacion(idxRoster, idxEnFase, participante) {
    try {
        const participanteData = adminCache.rosterProyecto[idxRoster];
        if (!participanteData) {
            toast("No se encontró el participante");
            return;
        }

        const faseParticipante = adminCache.faseParticipantes[idxEnFase];
        if (!faseParticipante) {
            toast("No se encontró la información del participante en la fase");
            return;
        }

        const evaluacionesParticipante = Array.isArray(faseParticipante.evaluaciones) ? faseParticipante.evaluaciones : [];

        if (evaluacionesParticipante.length === 0) {
            toast("Este participante no tiene evaluaciones asignadas");
            return;
        }

        const { obtenerEvaluaciones } = await import('./evaluaciones.js');
        const todasEvaluaciones = await obtenerEvaluaciones(
            state.currentProjectId,
            state.currentFaseIndex
        );

        const evalMap = {};
        todasEvaluaciones.forEach(e => {
            evalMap[e.evaluacionId] = e;
        });

        const evaluacionesDisponibles = evaluacionesParticipante
            .filter(e => evalMap[e.evaluacionId])
            .map(e => ({
                ...e,
                nombre: evalMap[e.evaluacionId].nombreEvaluacion || `Evaluación ${e.evaluacionId}`,
                dimensiones: evalMap[e.evaluacionId].dimensiones || []
            }));

        if (evaluacionesDisponibles.length === 0) {
            toast("No hay evaluaciones disponibles para calificar (las evaluaciones pueden haber sido eliminadas)");
            return;
        }

        if (evaluacionesDisponibles.length === 1) {
            mostrarModalCalificarConEstrellas(idxRoster, idxEnFase, participanteData, evaluacionesDisponibles[0]);
            return;
        }

        const overlay = document.getElementById("seleccionar-evaluacion-overlay");
        const contenido = document.getElementById("seleccionar-evaluacion-contenido");

        if (!overlay || !contenido) {
            toast("Modal de selección no disponible");
            return;
        }

        contenido.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                <p style="font-size:13px;color:var(--gray-500);margin:0 0 8px 0;">
                    Selecciona la evaluación que deseas calificar para <strong>${esc(participanteData.nombre || 'el participante')}</strong>
                </p>
                ${evaluacionesDisponibles.map(e => `
                    <button class="btn btn-outline btn-block seleccionar-eval-btn" 
                            data-eval-id="${e.evaluacionId}"
                            style="justify-content:flex-start;text-align:left;padding:12px 16px;">
                        <div>
                            <div style="font-weight:600;">${esc(e.nombre)}</div>
                            ${e.periodo ? `<div style="font-size:11px;color:var(--gray-500);">Periodo: ${esc(e.periodo)}</div>` : ''}
                            <div style="font-size:10px;color:var(--gray-400);margin-top:2px;">
                                ${e.dimensiones.length} dimensión(es)
                            </div>
                        </div>
                        <i class="fas fa-chevron-right" style="margin-left:auto;color:var(--gray-400);"></i>
                    </button>
                `).join('')}
            </div>
        `;

        overlay.classList.add("show");

        contenido.querySelectorAll(".seleccionar-eval-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const evalId = Number(btn.dataset.evalId);
                const evalData = evaluacionesDisponibles.find(e => e.evaluacionId === evalId);
                overlay.classList.remove("show");
                if (evalData) {
                    mostrarModalCalificarConEstrellas(idxRoster, idxEnFase, participanteData, evalData);
                }
            });
        });

        const closeBtn = document.getElementById("seleccionar-evaluacion-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => overlay.classList.remove("show"));
        }

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("show");
        });

    } catch (err) {
        console.error("Error al mostrar selección de evaluación:", err);
        toast(`Error: ${err.message}`);
    }
}

// ============================================================
// FUNCIONES PARA CALIFICAR CON ESTRELLAS - VERSIÓN CORREGIDA
// ============================================================

export async function mostrarModalCalificarConEstrellas(idxRoster, idxEnFase, participante, evalData) {
    try {
        if (!evalData) {
            toast("No se encontró la evaluación");
            return;
        }

        const evaluacionId = evalData.evaluacionId;
        const dimensiones = evalData.dimensiones || [];
        const calificaciones = evalData.calificaciones || [];

        // Reiniciar el objeto de puntajes
        window.puntajesSeleccionados = {};

        const tieneCalificacionesPrevias = calificaciones.some(c => c.puntaje > 0);

        const calificacionesPorDim = {};
        calificaciones.forEach(c => {
            calificacionesPorDim[c.dimensionId] = c.puntaje || 0;
        });

        const overlay = document.getElementById("calificar-estrellas-overlay");
        const contenido = document.getElementById("calificar-estrellas-contenido");
        const titulo = document.getElementById("calificar-estrellas-titulo");
        const participanteNombre = document.getElementById("calificar-estrellas-participante");

        if (!overlay || !contenido) return;

        titulo.textContent = `Calificar: ${evalData.nombre || "Evaluación"}`;
        participanteNombre.textContent = participante.nombre || "Participante";

        let advertenciaHTML = '';
        if (tieneCalificacionesPrevias) {
            advertenciaHTML = `
                <div style="background:var(--warning-bg);border:1px solid #eddba6;border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
                    <i class="fas fa-exclamation-triangle" style="color:var(--warning);font-size:18px;"></i>
                    <div>
                        <strong style="color:var(--warning);">Este participante ya tiene calificaciones previas.</strong>
                        <p style="margin:2px 0 0 0;font-size:12px;color:var(--gray-600);">Si guardas nuevas calificaciones, se sobrescribirán las anteriores.</p>
                    </div>
                </div>
            `;
        }

        let html = `
            ${advertenciaHTML}
            <div style="margin-bottom:16px;">
                <div style="background:var(--gray-50);padding:12px 16px;border-radius:var(--radius-sm);border:1px solid var(--gray-200);">
                    <p style="margin:0 0 4px 0;"><strong>Participante:</strong> ${esc(participante.nombre || "—")}</p>
                    <p style="margin:0;"><strong>Email:</strong> ${esc(participante.email || "—")}</p>
                    <p style="margin:4px 0 0 0;font-size:12px;color:var(--gray-500);">
                        <strong>Evaluación:</strong> ${esc(evalData.nombre || "—")}
                    </p>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <div class="field">
                    <label for="calificar-periodo">Periodo</label>
                    <input type="text" id="calificar-periodo" value="${esc(evalData.periodo || '')}" placeholder="Ej: Semana 1, Periodo 2025-1" />
                </div>
                <div class="field">
                    <label for="calificar-observacion">Observaciones</label>
                    <textarea id="calificar-observacion" placeholder="Observaciones sobre la evaluación" style="width:100%;padding:10px 14px;border:1.5px solid var(--gray-300);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font-body);resize:vertical;min-height:60px;">${esc(evalData.observacion || '')}</textarea>
                </div>
            </div>
            <div style="margin-top:12px;">
                <h4 style="font-size:13px;color:var(--gray-700);margin:0 0 12px 0;">Dimensiones</h4>
                <div style="display:flex;flex-direction:column;gap:12px;">
        `;

        dimensiones.forEach(dim => {
            const puntajeActual = calificacionesPorDim[dim.dimensionId] || 0;
            // Inicializar el puntaje seleccionado en el objeto global
            window.puntajesSeleccionados[dim.dimensionId] = puntajeActual;

            html += `
                <div style="background:var(--gray-50);padding:12px 16px;border-radius:var(--radius-sm);border:1px solid var(--gray-200);">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                        <div>
                            <strong style="font-size:14px;">${esc(dim.nombreDimension)}</strong>
                            ${dim.descripcion ? `<p style="margin:2px 0 0 0;font-size:11px;color:var(--gray-500);">${esc(dim.descripcion)}</p>` : ''}
                        </div>
                        <div class="star-rating" data-dimension-id="${dim.dimensionId}">
                            ${[1, 2, 3, 4, 5].map(star => `
                                <span class="star ${star <= puntajeActual ? 'active' : ''}" data-value="${star}" 
                                      onclick="window.seleccionarPuntaje(${dim.dimensionId}, ${star})">
                                    <i class="fas fa-star"></i>
                                </span>
                            `).join('')}
                            <span class="puntaje-label" id="puntaje-label-${dim.dimensionId}">${puntajeActual}/5</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
                <button class="btn btn-outline" id="calificar-estrellas-cancelar">Cancelar</button>
                <button class="btn btn-primary" id="calificar-estrellas-guardar">
                    <i class="fas fa-save"></i> ${tieneCalificacionesPrevias ? 'Actualizar calificaciones' : 'Guardar calificaciones'}
                </button>
            </div>
        `;

        contenido.innerHTML = html;

        // Función global para seleccionar puntaje
        window.seleccionarPuntaje = function (dimensionId, value) {
            console.log(`⭐ Seleccionando puntaje: Dimensión ${dimensionId} = ${value}`);

            // Actualizar el objeto global
            window.puntajesSeleccionados[dimensionId] = value;

            // Actualizar visualmente las estrellas
            const container = document.querySelector(`.star-rating[data-dimension-id="${dimensionId}"]`);
            if (container) {
                const stars = container.querySelectorAll('.star');
                stars.forEach(s => {
                    const starValue = Number(s.dataset.value);
                    if (starValue <= value) {
                        s.classList.add('active');
                    } else {
                        s.classList.remove('active');
                    }
                });

                const label = document.getElementById(`puntaje-label-${dimensionId}`);
                if (label) {
                    label.textContent = `${value}/5`;
                }
            }

            console.log(`📝 Puntajes actuales:`, JSON.stringify(window.puntajesSeleccionados));
        };

        overlay.classList.add("show");

        // Eventos de botones
        const cancelarBtn = document.getElementById("calificar-estrellas-cancelar");
        if (cancelarBtn) {
            cancelarBtn.addEventListener("click", () => {
                overlay.classList.remove("show");
                window.puntajesSeleccionados = {};
            });
        }

        const cerrarBtn = document.getElementById("calificar-estrellas-close");
        if (cerrarBtn) {
            cerrarBtn.addEventListener("click", () => {
                overlay.classList.remove("show");
                window.puntajesSeleccionados = {};
            });
        }

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("show");
                window.puntajesSeleccionados = {};
            }
        });

        const guardarBtn = document.getElementById("calificar-estrellas-guardar");
        if (guardarBtn) {
            guardarBtn.addEventListener("click", async () => {
                console.log("💾 Botón guardar clickeado");
                console.log("📝 Puntajes a guardar:", JSON.stringify(window.puntajesSeleccionados));

                if (tieneCalificacionesPrevias) {
                    const confirmar = confirm(
                        `⚠️ Este participante ya tiene calificaciones previas.\n\n` +
                        `¿Estás seguro de que deseas ACTUALIZAR las calificaciones?\n` +
                        `Las calificaciones anteriores serán SOBREESCRITAS.`
                    );
                    if (!confirmar) {
                        return;
                    }
                }
                await guardarCalificacionesEstrellas(idxRoster, idxEnFase, evaluacionId);
            });
        }

    } catch (err) {
        console.error("Error al mostrar modal de calificación:", err);
        toast(`Error: ${err.message}`);
    }
}

async function guardarCalificacionesEstrellas(idxRoster, idxEnFase, evaluacionId) {
    try {
        const { actualizarEvaluacionParticipante } = await import('./evaluaciones.js');

        console.log("=== GUARDANDO CALIFICACIONES ===");
        console.log("Evaluación ID:", evaluacionId);
        console.log("Idx en fase:", idxEnFase);
        console.log("Puntajes seleccionados:", JSON.stringify(window.puntajesSeleccionados));

        // Verificar que hay puntajes para guardar
        const puntajesKeys = Object.keys(window.puntajesSeleccionados);
        if (puntajesKeys.length === 0) {
            toast("No hay puntajes seleccionados para guardar");
            return;
        }

        // Verificar que el participante existe en la fase
        const faseParticipante = adminCache.faseParticipantes[idxEnFase];
        if (!faseParticipante) {
            toast("Error: No se encontró el participante en la fase");
            return;
        }

        // Verificar si ya tenía calificaciones previas
        const evaluacionesParticipante = Array.isArray(faseParticipante.evaluaciones) ? faseParticipante.evaluaciones : [];
        const evalData = evaluacionesParticipante.find(e => e.evaluacionId === evaluacionId);
        const tieneCalificacionesPrevias = evalData && Array.isArray(evalData.calificaciones) &&
            evalData.calificaciones.some(c => c.puntaje > 0);

        const periodoInput = document.getElementById("calificar-periodo");
        const observacionInput = document.getElementById("calificar-observacion");
        const periodo = periodoInput ? periodoInput.value.trim() : "";
        const observacion = observacionInput ? observacionInput.value.trim() : "";

        console.log("Periodo:", periodo);
        console.log("Observación:", observacion);

        // IMPORTANTE: se guardan TODAS las dimensiones + periodo + observación
        // en UNA sola llamada/PATCH (no en paralelo) para evitar que se
        // pisen entre sí (antes, cada dimensión y el periodo/observación
        // hacían su propio GET->PATCH del mismo nodo en paralelo, y el
        // último en terminar sobrescribía los puntajes de los demás).
        const resultado = await actualizarEvaluacionParticipante(
            state.currentProjectId,
            state.currentFaseIndex,
            idxEnFase,
            evaluacionId,
            window.puntajesSeleccionados,
            periodo,
            observacion
        );

        console.log("✅ Resultado:", resultado);

        const allSuccess = resultado && resultado.success !== false;
        if (!allSuccess) {
            console.warn("⚠️ La calificación no se guardó correctamente");
        }

        const overlay = document.getElementById("calificar-estrellas-overlay");
        if (overlay) overlay.classList.remove("show");

        // Limpiar puntajes seleccionados
        window.puntajesSeleccionados = {};

        // Refrescar el caché local desde Firebase para que la tabla y el
        // informe reflejen el puntaje/periodo/observación recién guardados
        // (sin esto, adminCache.faseParticipantes quedaba desactualizado
        // y el informe/tabla podían mostrar datos viejos).
        await refreshFaseParticipantesFromServer(state.currentFaseIndex);

        // Recargar la tabla de participantes
        renderFaseParticipantesTable();
        // Recargar evaluaciones
        await renderEvaluacionesFase();

        if (tieneCalificacionesPrevias) {
            toast("✅ Calificaciones actualizadas correctamente");
        } else {
            toast("✅ Calificaciones guardadas correctamente");
        }
    } catch (err) {
        console.error("❌ Error al guardar calificaciones:", err);
        toast(`Error: ${err.message}`);
    }
}

// ============================================================
// FUNCIÓN PARA ABRIR FASE DETAIL
// ============================================================

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
        let fase = null;

        if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
            fase = adminCache.proyectoActual.fases[faseIndex];
        }

        if (!fase) {
            fase = await fbGet(`proyectos/${state.currentProjectId}/fases/${faseIndex}`);
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

        const checkEdicion = document.getElementById("toggle-edicion-check");
        if (checkEdicion) {
            modoEdicion = checkEdicion.checked;
        }
        const checkReporte = document.getElementById("toggle-reporte-check");
        if (checkReporte) {
            modoReporte = checkReporte.checked;
        }

        renderFaseParticipantesTable();
        renderFaseEnlaces();
        renderEvaluacionesFase();

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
            imagenPerfil: persona.imagenPerfil || '',
            fechaAsignacion: fp.fechaAsignacion || '',
            asistencias: Array.isArray(fp.asistencias) ? fp.asistencias : [],
        };
    });
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

// ============================================================
// FUNCIÓN: renderFaseParticipantesTable
// ============================================================
export function renderFaseParticipantesTable() {
    const tbody = document.getElementById("fase-participantes-tbody");
    if (!tbody) return;

    if (adminCache.faseParticipantes && adminCache.rosterProyecto) {
        state.currentFaseCombinados = combineFaseParticipantes(
            { participantes: adminCache.faseParticipantes },
            adminCache.rosterProyecto
        );
    }

    const search = (document.getElementById("fase-asistencia-search")?.value || "").trim().toLowerCase();
    const { desde, hasta } = getFilterRange();
    const combinados = state.currentFaseCombinados || [];

    const todasLasFechas = new Set();
    combinados.forEach((p) => {
        filtrarAsistenciasPorRango(p.asistencias, desde, hasta).forEach((a) => {
            if (a && a.fecha) todasLasFechas.add(a.fecha);
        });
    });
    const totalSesiones = todasLasFechas.size;
    const fechasOrdenadas = Array.from(todasLasFechas).sort();

    const filtered = combinados
        .filter((p) => {
            if (!search) return true;
            return p.nombre.toLowerCase().includes(search) || p.email.toLowerCase().includes(search);
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const countEl = document.getElementById("fase-participantes-count");
    if (countEl) {
        const periodoTexto = desde && hasta ? `(${desde} al ${hasta})` :
            desde ? `(desde ${desde})` :
                hasta ? `(hasta ${hasta})` : "(todas las fechas)";
        countEl.textContent = `${filtered.length} de ${combinados.length} participantes · ${totalSesiones} sesiones ${periodoTexto}`;
    }

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="state-msg">No hay participantes que coincidan con la búsqueda.</div></td></tr>`;
        return;
    }

    const fechasPeriodoJson = JSON.stringify(fechasOrdenadas);

    const checkEdicion = document.getElementById("toggle-edicion-check");
    if (checkEdicion && checkEdicion.checked !== modoEdicion) {
        modoEdicion = checkEdicion.checked;
    }
    const checkReporte = document.getElementById("toggle-reporte-check");
    if (checkReporte && checkReporte.checked !== modoReporte) {
        modoReporte = checkReporte.checked;
    }

    tbody.innerHTML = filtered
        .map((p, index) => {
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
            const imagenPerfil = p.imagenPerfil || '';

            const modoActivo = modoEdicion ? 'editar' : (modoReporte ? 'reporte' : null);
            const rowClass = modoActivo ? 'fila-editable' : '';
            const rowClickAttr = modoActivo
                ? `data-idxroster="${esc(p.idxRoster)}" data-idxenfase="${esc(p.idxEnFase)}" data-modo="${modoActivo}"`
                : '';
            const rowStyle = modoActivo ? 'cursor:pointer;' : '';

            const fotoHTML = imagenPerfil
                ? `<img src="${esc(imagenPerfil)}" alt="Foto de ${esc(nombreMostrar)}" loading="lazy" />`
                : `<i class="fas fa-user"></i>`;
            const btnFotoHTML = `
                <button type="button" class="btn-foto-participante" 
                        data-imagen="${esc(imagenPerfil)}" 
                        data-nombre="${esc(nombreMostrar)}"
                        title="Ver foto de ${esc(nombreMostrar)}">
                    ${fotoHTML}
                </button>
            `;

            let accionesHTML = `
                <button type="button" class="btn-detalle" 
                        data-email="${esc(p.email)}" 
                        data-nombre="${esc(nombreMostrar)}" 
                        data-asistencias='${asistenciasJson}'
                        data-fechas-periodo='${fechasPeriodoJson}'
                        data-total-sesiones="${totalSesiones}"
                        data-idxroster="${esc(p.idxRoster)}"
                        data-idxenfase="${esc(p.idxEnFase)}">
                    <i class="fas fa-eye"></i> Ver Detalles
                </button>
                <button type="button" class="btn-calificar-estrella" 
                        data-idxroster="${esc(p.idxRoster)}"
                        data-idxenfase="${esc(p.idxEnFase)}"
                        data-nombre="${esc(nombreMostrar)}"
                        title="Calificar evaluación">
                    <i class="fas fa-star"></i>
                </button>
            `;

            if (MOSTRAR_BOTON_ELIMINAR) {
                accionesHTML += `
                    <button type="button" class="btn-eliminar-participante" 
                            data-idxroster="${esc(p.idxRoster)}"
                            data-idxenfase="${esc(p.idxEnFase)}"
                            data-nombre="${esc(nombreMostrar)}"
                            title="Eliminar participante">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            }

            return `
        <tr class="${rowClass}" ${rowClickAttr} style="${rowStyle}">
            <td class="col-num">${index + 1}</td>
            <td style="text-align:center;">${btnFotoHTML}</td>
            <td>
                <div class="student-name">${esc(nombreMostrar)}</div>
                <div class="student-email"><i class="fas fa-envelope"></i> ${esc(emailMostrar)}</div>
                <div class="student-phone"><i class="fas fa-phone"></i> ${esc(telefonoMostrar)}</div>
            </td>
            <td>
                <div class="fecha-asignacion">
                    <div class="fecha">${esc(fechaStr)}</div>
                    ${horaStr ? `<div class="hora"><i class="fas fa-clock"></i> ${esc(horaStr)}</div>` : ""}
                </div>
            </td>
            <td style="text-align:center;"><span class="count-pill ${n ? "count-pill--some" : "count-pill--zero"}">${n}</span></td>
            <td style="text-align:center;"><span class="faltas-pill ${faltas ? "faltas-pill--some" : "faltas-pill--zero"}">${faltas}</span></td>
            <td style="text-align:center;"><span class="puntaje-pill">${puntaje === null ? "—" : `${puntaje.toFixed(1)} / ${PUNTAJE_MAX.toFixed(1)}`}</span></td>
            <td style="text-align:center;display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:wrap;">
                ${accionesHTML}
            </td>
        </tr>`;
        })
        .join("");

    if (modoEdicion || modoReporte) {
        tbody.querySelectorAll('.fila-editable').forEach((row) => {
            row.addEventListener('click', () => {
                const idxRoster = Number(row.dataset.idxroster);
                const idxEnFase = Number(row.dataset.idxenfase);
                const modo = row.dataset.modo;

                if (modo === 'editar') {
                    if (!isNaN(idxRoster) && idxRoster !== -1) {
                        openEditParticipante(idxRoster);
                    }
                } else if (modo === 'reporte') {
                    if (!isNaN(idxEnFase)) {
                        abrirModalInformeParticipante(idxEnFase);
                    }
                }
            });
        });
    }

    tbody.querySelectorAll(".btn-detalle").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const nombre = btn.dataset.nombre;
            const email = btn.dataset.email;
            const asistencias = JSON.parse(btn.dataset.asistencias);
            const fechasPeriodo = JSON.parse(btn.dataset.fechasPeriodo);
            const totalSesiones = parseInt(btn.dataset.totalSesiones);
            const idxRoster = Number(btn.dataset.idxroster);
            abrirModalDetalles(nombre, email, asistencias, fechasPeriodo, totalSesiones, idxRoster);
        });
    });

    tbody.querySelectorAll(".btn-foto-participante").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            abrirModalFotoParticipante(btn.dataset.imagen, btn.dataset.nombre);
        });
    });

    tbody.querySelectorAll(".btn-calificar-estrella").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idxRoster = Number(btn.dataset.idxroster);
            const idxEnFase = Number(btn.dataset.idxenfase);

            if (isNaN(idxRoster) || isNaN(idxEnFase)) {
                toast("Error: Índices de participante inválidos");
                return;
            }

            const participante = adminCache.rosterProyecto[idxRoster];
            if (!participante) {
                toast("No se encontró el participante");
                return;
            }

            const faseParticipante = adminCache.faseParticipantes[idxEnFase];
            if (!faseParticipante) {
                toast("No se encontró la información del participante en la fase");
                return;
            }

            const evaluaciones = Array.isArray(faseParticipante.evaluaciones) ? faseParticipante.evaluaciones : [];
            if (evaluaciones.length === 0) {
                toast("Este participante no tiene evaluaciones asignadas");
                return;
            }

            mostrarModalSeleccionarEvaluacion(idxRoster, idxEnFase, participante);
        });
    });

    if (MOSTRAR_BOTON_ELIMINAR) {
        tbody.querySelectorAll(".btn-eliminar-participante").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const idxRoster = Number(btn.dataset.idxroster);
                const idxEnFase = Number(btn.dataset.idxenfase);
                const nombre = btn.dataset.nombre;
                eliminarParticipante(idxRoster, idxEnFase, nombre);
            });
        });
    }
}

export function toggleModoEdicion() {
    const check = document.getElementById("toggle-edicion-check");
    const checkReporte = document.getElementById("toggle-reporte-check");
    if (check) {
        modoEdicion = check.checked;
        // Modo edición y modo reporte son mutuamente excluyentes: al
        // activar uno se desactiva el otro para que el clic en una fila
        // no sea ambiguo.
        if (modoEdicion && checkReporte && checkReporte.checked) {
            checkReporte.checked = false;
            modoReporte = false;
        }
        if (modoEdicion) {
            toast('Modo edición activado - Haz clic en cualquier fila para editar');
        } else {
            toast('Modo edición desactivado');
        }
        renderFaseParticipantesTable();
    }
}

export function toggleModoReporte() {
    const check = document.getElementById("toggle-reporte-check");
    const checkEdicion = document.getElementById("toggle-edicion-check");
    if (check) {
        modoReporte = check.checked;
        // Modo edición y modo reporte son mutuamente excluyentes.
        if (modoReporte && checkEdicion && checkEdicion.checked) {
            checkEdicion.checked = false;
            modoEdicion = false;
        }
        if (modoReporte) {
            toast('Modo reportes activado - Haz clic en cualquier fila para ver su informe');
        } else {
            toast('Modo reportes desactivado');
        }
        renderFaseParticipantesTable();
    }
}

// ============================================================
// FUNCIONES AUXILIARES PARA MODALES
// ============================================================

function abrirModalDetalles(nombre, email, asistencias, fechasPeriodo, totalSesiones, idxRoster) {
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
            const manual = asistenciaData && asistenciaData.manual ? ' (manual)' : '';

            if (asistio) {
                return `<li class="asistio" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #f0f0f0;">
                    <span>
                        <i class="fas fa-check-circle" style="color:#2e7d32;"></i> 
                        ${fecha} - ${hora}${manual}
                    </span>
                    <span style="color:#2e7d32;font-size:12px;font-weight:600;">Asistió</span>
                </li>`;
            } else {
                return `<li class="falta" data-fecha="${fecha}" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #f0f0f0;">
                    <span>
                        <i class="fas fa-times-circle" style="color:#c62828;"></i> 
                        ${fecha} - No asistió
                    </span>
                    <button type="button" class="btn-marcar-asistencia" 
                            data-fecha="${fecha}" 
                            data-idxroster="${idxRoster}"
                            title="Marcar asistencia para esta fecha">
                        <i class="fas fa-user-check"></i>
                    </button>
                </li>`;
            }
        }).join('');
    } else {
        sesionesList = '<li class="empty-msg">No hay sesiones en el período seleccionado</li>';
    }

    const asistenciasList = asistencias && asistencias.length > 0
        ? asistencias.map(a => {
            const manual = a.manual ? ' (manual)' : '';
            return `<li style="padding:4px 10px;border-bottom:1px solid #f0f0f0;"><i class="fas fa-check-circle" style="color:#2e7d32;"></i> ${fmtFechaHoraCorta(a.fecha)} - ${a.hora || "—"}${manual}</li>`;
        }).join("")
        : '<li class="empty-msg">No tiene asistencias registradas</li>';

    const asistenciasCount = fechasAsistencia.size;
    const faltasCount = totalSesiones - asistenciasCount;

    // Obtener calificaciones del participante si existen
    let calificacionesHTML = '';
    if (idxRoster !== undefined && idxRoster !== -1) {
        const participante = adminCache.rosterProyecto[idxRoster];
        if (participante && Array.isArray(participante.evaluaciones) && participante.evaluaciones.length > 0) {
            calificacionesHTML = `
                <div style="margin-top:16px;border-top:1px solid var(--gray-200);padding-top:16px;">
                    <h4 style="font-size:13px;color:var(--gray-700);margin:0 0 8px 0;">
                        <i class="fas fa-star" style="color:#f5b342;"></i> Calificaciones
                    </h4>
                    ${participante.evaluaciones.map(evalData => {
                const califs = evalData.calificaciones || [];
                const total = califs.reduce((sum, c) => sum + c.puntaje, 0);
                const promedio = califs.length > 0 ? (total / califs.length).toFixed(1) : '—';
                return `
                            <div style="background:var(--gray-50);padding:8px 12px;border-radius:var(--radius-sm);margin-bottom:6px;border:1px solid var(--gray-200);">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-weight:600;font-size:12px;">Evaluación ID: ${evalData.evaluacionId}</span>
                                    <span style="font-size:12px;color:var(--primary);font-weight:600;">Promedio: ${promedio}/5</span>
                                </div>
                                <div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;">
                                    ${califs.map(c => `
                                        <span style="font-size:11px;color:var(--gray-600);">
                                            Dimensión ${c.dimensionId + 1}: <strong>${c.puntaje}/5</strong>
                                        </span>
                                    `).join('')}
                                </div>
                                ${evalData.periodo ? `<div style="font-size:10px;color:var(--gray-400);margin-top:2px;">Periodo: ${esc(evalData.periodo)}</div>` : ''}
                                ${evalData.observacion ? `<div style="font-size:10px;color:var(--gray-400);">Obs: ${esc(evalData.observacion)}</div>` : ''}
                            </div>
                        `;
            }).join('')}
                </div>
            `;
        }
    }

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
                <ul style="list-style:none;padding:0;margin:0;">${sesionesList}</ul>
            </div>
            <div class="asistencia-detalle-col">
                <h4><i class="fas fa-check-circle"></i> Asistencias registradas (${asistenciasCount})</h4>
                <ul style="list-style:none;padding:0;margin:0;">${asistenciasList}</ul>
            </div>
        </div>
        ${calificacionesHTML}
    `;

    overlay.classList.add("show");

    contenido.querySelectorAll('.btn-marcar-asistencia').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const fecha = btn.dataset.fecha;
            const idx = Number(btn.dataset.idxroster);
            await marcarAsistenciaDesdeDetalle(idx, fecha);
        });
    });
}

async function marcarAsistenciaDesdeDetalle(idxRoster, fecha) {
    try {
        if (idxRoster === -1 || Number.isNaN(idxRoster) || !fecha) {
            toast("No se encontró la información del participante.");
            return;
        }

        const persona = (adminCache.rosterProyecto || [])[idxRoster];
        if (!persona) {
            toast("No se encontró la información del participante.");
            return;
        }

        const faseList = Array.isArray(adminCache.faseParticipantes) ? adminCache.faseParticipantes : [];
        const idxEnFase = faseList.findIndex((fp) => fp && fp.id === persona.id);

        if (idxEnFase === -1) {
            toast("El participante no está inscrito en esta fase.");
            return;
        }

        const fpEntry = faseList[idxEnFase];
        const asistencias = Array.isArray(fpEntry.asistencias) ? [...fpEntry.asistencias] : [];

        const yaTieneAsistencia = asistencias.some((a) => a.fecha === fecha);
        if (yaTieneAsistencia) {
            toast(`${persona.nombre} ya tiene asistencia registrada para el ${fecha}.`);
            const overlay = document.getElementById("asistencia-detalle-overlay");
            if (overlay) overlay.classList.remove("show");
            renderFaseParticipantesTable();
            return;
        }

        const ahora = new Date();
        const hora = ahora.toTimeString().slice(0, 5);

        const nuevaAsistencia = {
            fecha: fecha,
            hora: hora,
            timestamp: `${fecha} ${hora}`,
            manual: true,
            latitud: "0",
            longitud: "0",
            distancia: 0,
        };

        asistencias.push(nuevaAsistencia);

        await fbPatch(`proyectos/${state.currentProjectId}/fases/${state.currentFaseIndex}/participantes/${idxEnFase}`, { asistencias });

        adminCache.faseParticipantes[idxEnFase].asistencias = asistencias;
        if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
            adminCache.proyectoActual.fases[state.currentFaseIndex].participantes = adminCache.faseParticipantes;
        }

        state.currentFaseCombinados = combineFaseParticipantes(
            { participantes: adminCache.faseParticipantes },
            adminCache.rosterProyecto
        );
        renderFaseParticipantesTable();

        toast(`${persona.nombre} marcó asistencia para el ${fecha} - ${hora}`);

        const overlay = document.getElementById("asistencia-detalle-overlay");
        if (overlay) overlay.classList.remove("show");

    } catch (err) {
        console.error('Error al marcar asistencia desde detalle:', err);
        toast(`Error: ${err.message}`);
    }
}

function setupAsistenciaDetalleModal() {
    const closeBtn = document.getElementById("asistencia-detalle-close");
    const cerrarBtn = document.getElementById("asistencia-detalle-cerrar");
    const overlay = document.getElementById("asistencia-detalle-overlay");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            if (overlay) {
                overlay.classList.remove("show");
                renderFaseParticipantesTable();
            }
        });
    }
    if (cerrarBtn) {
        cerrarBtn.remove();
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) {
                overlay.classList.remove("show");
                renderFaseParticipantesTable();
            }
        });
    }
}

// ============================================================
// MODAL FLOTANTE - FOTO DE PERFIL DEL PARTICIPANTE
// ============================================================
const IMAGEN_PERFIL_PLACEHOLDER = "https://ui-avatars.com/api/?background=e2e6ea&color=5a6a7a&size=256&name=";

function abrirModalFotoParticipante(imagenUrl, nombre) {
    const overlay = document.getElementById("foto-participante-overlay");
    const img = document.getElementById("foto-participante-img");
    const nombreEl = document.getElementById("foto-participante-nombre");

    if (!overlay || !img) return;

    const nombreFinal = nombre || "Participante";
    img.src = imagenUrl && imagenUrl.trim()
        ? imagenUrl
        : `${IMAGEN_PERFIL_PLACEHOLDER}${encodeURIComponent(nombreFinal)}`;
    img.alt = `Foto de ${nombreFinal}`;
    if (nombreEl) nombreEl.textContent = nombreFinal;

    overlay.classList.add("show");
}

function cerrarModalFotoParticipante() {
    const overlay = document.getElementById("foto-participante-overlay");
    if (overlay) overlay.classList.remove("show");
}

export function setupFotoParticipanteModal() {
    const closeBtn = document.getElementById("foto-participante-close");
    const overlay = document.getElementById("foto-participante-overlay");

    if (closeBtn) {
        closeBtn.addEventListener("click", cerrarModalFotoParticipante);
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) cerrarModalFotoParticipante();
        });
    }
}

// ============================================================
// MODAL: INFORME DEL PARTICIPANTE ("Generar Reportes")
// ============================================================
// Muestra, en un modal, un informe con la asistencia y las
// evaluaciones (con nombre de cada dimensión y puntaje) del
// participante correspondiente a la fila que se haya tocado, de forma
// análoga al modo edición pero mostrando información en vez de un
// formulario editable.
// ============================================================
async function abrirModalInformeParticipante(idxEnFase) {
    const overlay = document.getElementById("informe-participante-overlay");
    const titulo = document.getElementById("informe-participante-titulo");
    const contenido = document.getElementById("informe-participante-contenido");
    if (!overlay || !contenido) {
        toast("El modal de informe no está disponible");
        return;
    }

    const faseParticipante = (adminCache.faseParticipantes || [])[idxEnFase];
    if (!faseParticipante) {
        toast("No se encontró la información del participante en la fase");
        return;
    }

    const roster = adminCache.rosterProyecto || [];
    const persona = roster.find((r) => r && r.id === faseParticipante.id) || {};
    const nombreMostrar = persona.nombre || "—";

    if (titulo) titulo.textContent = `Informe de ${nombreMostrar}`;
    contenido.innerHTML = `<div class="state-msg"><div class="spinner"></div>Generando informe…</div>`;
    overlay.classList.add("show");

    try {
        const { obtenerEvaluaciones } = await import('./evaluaciones.js');
        const evaluacionesFase = await obtenerEvaluaciones(state.currentProjectId, state.currentFaseIndex);

        const asistencias = Array.isArray(faseParticipante.asistencias) ? faseParticipante.asistencias : [];
        const evaluacionesParticipante = Array.isArray(faseParticipante.evaluaciones) ? faseParticipante.evaluaciones : [];

        const imagenPerfil = persona.imagenPerfil || '';
        const fotoHTML = imagenPerfil
            ? `<img src="${esc(imagenPerfil)}" alt="Foto de ${esc(nombreMostrar)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
            : `<div style="width:64px;height:64px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-user" style="font-size:24px;color:var(--gray-500);"></i></div>`;

        const asistenciasHTML = asistencias.length
            ? `<ul style="list-style:none;padding:0;margin:0;max-height:160px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:var(--radius-sm);">
                ${asistencias.map((a) => `
                    <li style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">
                        <i class="fas fa-check-circle" style="color:#2e7d32;"></i>
                        ${esc(fmtFechaHoraCorta(a.fecha))} ${a.hora ? '· ' + esc(a.hora) : ''} ${a.manual ? ' <span style="color:var(--gray-400);">(manual)</span>' : ''}
                    </li>
                `).join('')}
               </ul>`
            : `<p class="empty-msg" style="font-size:12px;">Sin asistencias registradas</p>`;

        let evaluacionesHTML = '';
        if (evaluacionesParticipante.length === 0) {
            evaluacionesHTML = `<p class="empty-msg" style="font-size:12px;">Este participante no tiene evaluaciones asignadas en esta fase.</p>`;
        } else {
            evaluacionesHTML = evaluacionesParticipante.map((evalP) => {
                const evalDef = evaluacionesFase.find((e) => e.evaluacionId === evalP.evaluacionId);
                const nombreEval = evalDef ? (evalDef.nombreEvaluacion || `Evaluación ${evalP.evaluacionId}`) : `Evaluación ${evalP.evaluacionId}`;
                const dimensiones = evalDef && Array.isArray(evalDef.dimensiones) ? evalDef.dimensiones : [];
                const califs = Array.isArray(evalP.calificaciones) ? evalP.calificaciones : [];
                const total = califs.reduce((s, c) => s + (Number(c.puntaje) || 0), 0);
                const promedio = califs.length ? (total / califs.length).toFixed(1) : '—';

                const filasDim = califs.map((c) => {
                    const dim = dimensiones.find((d) => d.dimensionId === c.dimensionId);
                    const nombreDim = dim ? dim.nombreDimension : `Dimensión ${c.dimensionId + 1}`;
                    return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px dashed #eee;">
                        <span>${esc(nombreDim)}</span>
                        <strong>${c.puntaje}/${PUNTAJE_MAX}</strong>
                    </div>`;
                }).join('');

                return `
                    <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <span style="font-weight:600;font-size:13px;">${esc(nombreEval)}</span>
                            <span style="font-size:12px;color:var(--primary);font-weight:700;white-space:nowrap;">Promedio: ${promedio}/${PUNTAJE_MAX}</span>
                        </div>
                        ${filasDim}
                        ${evalP.periodo ? `<div style="font-size:11px;color:var(--gray-500);margin-top:6px;"><strong>Periodo:</strong> ${esc(evalP.periodo)}</div>` : ''}
                        ${evalP.observacion ? `<div style="font-size:11px;color:var(--gray-500);"><strong>Observación:</strong> ${esc(evalP.observacion)}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        contenido.innerHTML = `
            <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px;">
                ${fotoHTML}
                <div>
                    <div style="font-weight:700;font-size:15px;">${esc(nombreMostrar)}</div>
                    <div style="font-size:12px;color:var(--gray-500);"><i class="fas fa-envelope"></i> ${esc(persona.email || '—')}</div>
                    <div style="font-size:12px;color:var(--gray-500);"><i class="fas fa-phone"></i> ${esc(persona.telefono || '—')}</div>
                </div>
            </div>

            <h4 style="font-size:13px;color:var(--gray-700);margin:14px 0 6px;"><i class="fas fa-calendar-check"></i> Asistencias (${asistencias.length})</h4>
            ${asistenciasHTML}

            <h4 style="font-size:13px;color:var(--gray-700);margin:16px 0 6px;"><i class="fas fa-star" style="color:#f5b342;"></i> Evaluaciones</h4>
            ${evaluacionesHTML}
        `;
    } catch (err) {
        console.error("Error al generar informe del participante:", err);
        contenido.innerHTML = `<div class="state-msg">No se pudo generar el informe.<br>${esc(err.message)}</div>`;
    }
}

function cerrarModalInformeParticipante() {
    const overlay = document.getElementById("informe-participante-overlay");
    if (overlay) overlay.classList.remove("show");
}

export function setupInformeParticipanteModal() {
    const closeBtn = document.getElementById("informe-participante-close");
    const cerrarBtn = document.getElementById("informe-participante-cerrar");
    const imprimirBtn = document.getElementById("informe-participante-imprimir");
    const overlay = document.getElementById("informe-participante-overlay");

    if (closeBtn) closeBtn.addEventListener("click", cerrarModalInformeParticipante);
    if (cerrarBtn) cerrarBtn.addEventListener("click", cerrarModalInformeParticipante);
    if (imprimirBtn) imprimirBtn.addEventListener("click", () => window.print());
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) cerrarModalInformeParticipante();
        });
    }

    const checkReporte = document.getElementById("toggle-reporte-check");
    if (checkReporte) {
        checkReporte.addEventListener("change", toggleModoReporte);
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
        await fbPut(`proyectos/${state.currentProjectId}/participantes/${idxRoster}`, actualizado);

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
    setupAsistenciaManualModal();
    setupAgregarColaboradorModal();
    setupInformeParticipanteModal();

    const checkEdicion = document.getElementById("toggle-edicion-check");
    if (checkEdicion) {
        checkEdicion.addEventListener("change", toggleModoEdicion);
    }
}

function setupAgregarColaboradorModal() {
    const overlay = document.getElementById("agregar-colaborador-overlay");
    const closeBtn = document.getElementById("agregar-colaborador-close");
    const cancelBtn = document.getElementById("agregar-colaborador-cancel");
    const searchInput = document.getElementById("agregar-colaborador-buscar");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            overlay.classList.remove("show");
            proyectoEnModal = null;
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            overlay.classList.remove("show");
            proyectoEnModal = null;
        });
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("show");
                proyectoEnModal = null;
            }
        });
    }
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                overlay.classList.remove("show");
                proyectoEnModal = null;
            }
        });
    }
}

// ============================================================
// FUNCIONES PARA ENLACES
// ============================================================

export function renderFaseEnlaces() { }

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

// ============================================================
// FUNCIÓN PARA ACTUALIZAR CACHE DESDE ESTUDIANTE
// ============================================================

export async function actualizarCacheAdminDesdeEstudiante(proyectoId, faseIndex) {
    try {
        const proyectoActualizado = await fbGet(`proyectos/${proyectoId}`);
        if (!proyectoActualizado) return;

        const existingIdx = adminCache.proyectos.findIndex(p => String(p.id) === String(proyectoId));
        if (existingIdx !== -1) {
            adminCache.proyectos[existingIdx] = { id: proyectoId, ...proyectoActualizado };
        } else {
            adminCache.proyectos.push({ id: proyectoId, ...proyectoActualizado });
        }

        if (adminCache.proyectoIdActual === String(proyectoId)) {
            adminCache.proyectoActual = proyectoActualizado;
            adminCache.rosterProyecto = Array.isArray(proyectoActualizado.participantes)
                ? proyectoActualizado.participantes
                : [];

            if (faseIndex !== null && faseIndex !== undefined) {
                const fases = Array.isArray(proyectoActualizado.fases) ? proyectoActualizado.fases : [];
                const faseData = fases[Number(faseIndex)];
                if (faseData) {
                    adminCache.faseActual = faseData;
                    adminCache.faseParticipantes = Array.isArray(faseData.participantes)
                        ? faseData.participantes
                        : [];

                    state.currentFaseData = faseData;
                    state.currentFaseCombinados = combineFaseParticipantes(
                        { participantes: adminCache.faseParticipantes },
                        adminCache.rosterProyecto
                    );

                    const faseDetailView = document.getElementById("view-fase-detail");
                    if (faseDetailView && faseDetailView.classList.contains("active")) {
                        renderFaseParticipantesTable();
                    }
                }
            }
        }
    } catch (e) {
        console.warn("No se pudo actualizar el cache de admin desde estudiante:", e);
    }
}

async function eliminarParticipante(idxRoster, idxEnFase, nombre) {
    if (!confirm(`¿Estás seguro de que deseas eliminar a "${nombre}" de este proyecto?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    const btn = document.querySelector(`.btn-eliminar-participante[data-idxroster="${idxRoster}"][data-idxenfase="${idxEnFase}"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        if (idxRoster !== -1 && idxRoster !== undefined) {
            let rosterActual = [...adminCache.rosterProyecto];
            if (idxRoster >= 0 && idxRoster < rosterActual.length) {
                rosterActual[idxRoster] = null;
                const rosterFiltrado = rosterActual.filter(r => r !== null);
                await fbPut(`proyectos/${state.currentProjectId}/participantes`, rosterFiltrado);
                adminCache.rosterProyecto = rosterFiltrado;
                state.currentRosterProyecto = rosterFiltrado;
            }
        }

        if (idxEnFase !== -1 && idxEnFase !== undefined) {
            let faseParticipantes = [...adminCache.faseParticipantes];
            if (idxEnFase >= 0 && idxEnFase < faseParticipantes.length) {
                faseParticipantes.splice(idxEnFase, 1);
                await fbPut(`proyectos/${state.currentProjectId}/fases/${state.currentFaseIndex}/participantes`, faseParticipantes);
                adminCache.faseParticipantes = faseParticipantes;

                if (adminCache.proyectoActual && Array.isArray(adminCache.proyectoActual.fases)) {
                    adminCache.proyectoActual.fases[state.currentFaseIndex].participantes = faseParticipantes;
                }
            }
        }

        state.currentFaseCombinados = combineFaseParticipantes(
            { participantes: adminCache.faseParticipantes },
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

// ============================================================
// FUNCIONES PARA GESTIÓN DE SOLICITUDES
// ============================================================

export async function crearSolicitudProyecto(datos) {
    try {
        const { nombre, descripcion, propietario, paletaColores } = datos;

        const ahora = new Date();
        const fechaInicio = ahora.toISOString().slice(0, 16).replace('T', ' ');

        const seisMesesDespues = new Date(ahora);
        seisMesesDespues.setMonth(seisMesesDespues.getMonth() + 6);
        const fechaFin = seisMesesDespues.toISOString().slice(0, 16).replace('T', ' ');

        const usuariosData = await fbGet("usuarios");
        let propietarioId = null;
        let usuarioEncontrado = null;
        let firebaseKey = null;

        if (usuariosData) {
            const usuarios = Object.entries(usuariosData).map(([key, u]) => ({
                firebaseKey: key,
                ...u
            }));
            usuarioEncontrado = usuarios.find(u => u.correo && u.correo.toLowerCase() === propietario.correo.toLowerCase());
            if (usuarioEncontrado) {
                propietarioId = usuarioEncontrado.id;
                firebaseKey = usuarioEncontrado.firebaseKey;
            }
        }

        if (!propietarioId) {
            const nuevoId = Date.now().toString();
            const nuevoUsuario = {
                nombre: propietario.nombre,
                correo: propietario.correo,
                telefono: propietario.telefono,
                rol: ROLES.COLABORADOR,
                id: nuevoId
            };
            const result = await fbPost("usuarios", nuevoUsuario);
            propietarioId = nuevoId;
            firebaseKey = result.name;
        }

        const paletaFinal = paletaColores || {
            principal: "#1a365d",
            acento: "#c8102e",
            fondo: "#f8f9fa"
        };

        const solicitud = {
            nombre,
            descripcion,
            fechaInicio,
            fechaFin,
            fechaSolicitud: todayParts().timestamp,
            propietario: {
                idPropietario: propietarioId
            },
            estadoSolicitud: "pendiente",
            fases: [],
            participantes: [],
            paletaColores: paletaFinal,
            colaboradores: []
        };

        const result = await fbPost("proyectos", solicitud);
        const id = result.name;

        if (firebaseKey) {
            await fbPatch(`usuarios/${firebaseKey}`, { paletaColores: paletaFinal });
        }

        let adminCorreos = [];
        if (usuariosData) {
            const usuarios = Object.entries(usuariosData).map(([key, u]) => ({ firebaseKey: key, ...u }));
            adminCorreos = usuarios.filter(u => u.rol === "admin").map(u => u.correo);
        }

        if (adminCorreos.length > 0) {
            const htmlSuper = plantillaSolicitudCreada({
                proyecto: nombre,
                propietario: propietario.nombre,
                correoPropietario: propietario.correo,
                telefonoPropietario: propietario.telefono,
                descripcion,
                fechaInicio,
                fechaFin,
                id
            });
            for (const adminEmail of adminCorreos) {
                await enviarCorreo(adminEmail, `Nueva solicitud de proyecto: ${nombre}`, htmlSuper);
            }
        }

        const htmlPropietario = `
            <h2>Solicitud de proyecto creada</h2>
            <p>Hola ${propietario.nombre},</p>
            <p>Tu solicitud para el proyecto "<strong>${nombre}</strong>" ha sido creada exitosamente.</p>
            <p><strong>Fecha de inicio:</strong> ${fechaInicio}</p>
            <p><strong>Fecha de fin:</strong> ${fechaFin}</p>
            <p>Estaremos revisando tu solicitud y te notificaremos cuando sea aprobada.</p>
            <p><strong>ID de solicitud:</strong> ${id}</p>
            <p>Gracias por confiar en nosotros.</p>
        `;
        await enviarCorreo(propietario.correo, `Solicitud de proyecto creada: ${nombre}`, htmlPropietario);

        return { success: true, id };
    } catch (err) {
        console.error("Error al crear solicitud:", err);
        return { success: false, error: err.message };
    }
}

export async function cargarSolicitudes() {
    const grid = document.getElementById("solicitudes-grid");
    if (!grid) return;

    grid.innerHTML = `<div class="state-msg"><div class="spinner"></div>Cargando solicitudes…</div>`;
    try {
        const [proyectosData, usuariosData] = await Promise.all([
            fbGet("proyectos"),
            fbGet("usuarios")
        ]);

        let projects = proyectosData ? Object.entries(proyectosData).map(([id, p]) => ({ id, ...p })) : [];
        let usuarios = usuariosData ? Object.entries(usuariosData).map(([key, u]) => ({
            firebaseKey: key,
            ...u
        })) : [];

        const solicitudes = projects.filter(p => p.estadoSolicitud === "pendiente");

        if (!solicitudes.length) {
            grid.innerHTML = `<div class="state-msg">No hay solicitudes pendientes.</div>`;
            return;
        }

        grid.innerHTML = solicitudes
            .map((p) => {
                const usuario = usuarios.find(u => u.id === p.propietario?.idPropietario);
                const propietario = usuario ? usuario.nombre : "Usuario no encontrado";
                const correoPropietario = usuario ? usuario.correo : "Sin correo";
                const telefonoPropietario = usuario ? usuario.telefono : "Sin teléfono";

                const paleta = p.paletaColores || usuario?.paletaColores || null;
                const previewColores = paleta ?
                    `<div style="display:flex;gap:4px;margin-top:4px;">
                        <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${paleta.principal};border:1px solid #ddd;" title="Principal"></span>
                        <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${paleta.acento};border:1px solid #ddd;" title="Acento"></span>
                        <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${paleta.fondo};border:1px solid #ddd;" title="Fondo"></span>
                    </div>` : '';

                return `
        <div class="event-card solicitud-card" data-id="${esc(p.id)}">
          <div class="event-card__index">SOLICITUD #${esc(p.id)}</div>
          <h3>${esc(p.nombre || "Sin nombre")}</h3>
          <p>${esc(p.descripcion || "Sin descripción")}</p>
          <div class="event-card__meta">
            <span class="badge badge--warning"><i class="fas fa-clock"></i> Pendiente</span>
            <span class="badge"><i class="fas fa-user"></i> ${esc(propietario)}</span>
            <span class="badge"><i class="fas fa-envelope"></i> ${esc(correoPropietario)}</span>
            <span class="badge"><i class="fas fa-phone"></i> ${esc(telefonoPropietario)}</span>
          </div>
          ${paleta ? `<div style="margin-top:4px;font-size:11px;color:var(--gray-500);display:flex;align-items:center;gap:6px;">
            <i class="fas fa-palette"></i> Paleta: ${previewColores}
          </div>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-success" style="flex:1;padding:8px 12px;font-size:12px;" onclick="window.aprobarSolicitud('${p.id}')">
              <i class="fas fa-check"></i> Aprobar
            </button>
            <button class="btn btn-danger" style="flex:1;padding:8px 12px;font-size:12px;" onclick="window.rechazarSolicitud('${p.id}')">
              <i class="fas fa-times"></i> Rechazar
            </button>
          </div>
        </div>`;
            })
            .join("");

        const viewHeader = document.querySelector("#view-solicitudes .view-header h1");
        if (viewHeader) {
            viewHeader.textContent = `Gestionar solicitudes (${solicitudes.length} pendientes)`;
        }
    } catch (err) {
        grid.innerHTML = `<div class="state-msg">No se pudo cargar las solicitudes.<br>${esc(err.message)}</div>`;
    }
}

export async function aprobarSolicitud(id) {
    if (!confirm(`¿Estás seguro de que deseas aprobar esta solicitud?`)) return;

    try {
        const solicitud = await fbGet(`proyectos/${id}`);
        if (!solicitud) {
            toast("No se encontró la solicitud.");
            return;
        }

        await fbPatch(`proyectos/${id}`, {
            estadoSolicitud: "aprobada"
        });

        const usuariosData = await fbGet("usuarios");
        let usuarioPropietario = null;
        if (usuariosData) {
            const usuarios = Object.entries(usuariosData).map(([key, u]) => ({
                firebaseKey: key,
                ...u
            }));
            usuarioPropietario = usuarios.find(u => u.id === solicitud.propietario?.idPropietario);
        }

        if (usuarioPropietario && usuarioPropietario.correo) {
            const html = plantillaSolicitudAprobada({
                proyecto: solicitud.nombre,
                propietario: usuarioPropietario.nombre,
                id: id
            });
            await enviarCorreo(usuarioPropietario.correo, `✅ Solicitud aprobada: ${solicitud.nombre}`, html);
        }

        toast("Solicitud aprobada correctamente");
        await cargarSolicitudes();

        const activeView = document.querySelector(".view.active");
        if (activeView && activeView.id === "view-admin-list") {
            loadProjectList();
        }
    } catch (err) {
        console.error("Error al aprobar solicitud:", err);
        toast(`Error al aprobar: ${err.message}`);
    }
}

export async function rechazarSolicitud(id) {
    const motivo = prompt("Ingresa el motivo del rechazo (opcional):");

    try {
        const solicitud = await fbGet(`proyectos/${id}`);
        if (!solicitud) {
            toast("No se encontró la solicitud.");
            return;
        }

        await fbPatch(`proyectos/${id}`, {
            estadoSolicitud: "rechazada"
        });

        const usuariosData = await fbGet("usuarios");
        let usuarioPropietario = null;
        if (usuariosData) {
            const usuarios = Object.entries(usuariosData).map(([key, u]) => ({
                firebaseKey: key,
                ...u
            }));
            usuarioPropietario = usuarios.find(u => u.id === solicitud.propietario?.idPropietario);
        }

        if (usuarioPropietario && usuarioPropietario.correo) {
            const html = plantillaSolicitudRechazada({
                proyecto: solicitud.nombre,
                propietario: usuarioPropietario.nombre,
                motivo: motivo || "No se especificó motivo"
            });
            await enviarCorreo(usuarioPropietario.correo, `❌ Solicitud rechazada: ${solicitud.nombre}`, html);
        }

        toast("Solicitud rechazada");
        await cargarSolicitudes();
    } catch (err) {
        console.error("Error al rechazar solicitud:", err);
        toast(`Error al rechazar: ${err.message}`);
    }
}

window.aprobarSolicitud = aprobarSolicitud;
window.rechazarSolicitud = rechazarSolicitud;
window.cargarSolicitudes = cargarSolicitudes;
window.actualizarCacheAdminDesdeEstudiante = actualizarCacheAdminDesdeEstudiante;
window.actualizarCacheUsuarios = actualizarCacheUsuarios;

// ============================================================
// FUNCIÓN: Modal para marcar asistencia manualmente (mantenida por compatibilidad)
// ============================================================
function abrirModalAsistenciaManual(idxRoster, nombre, email) {
    toast("Usa el botón 'Detalles' para marcar asistencia en fechas específicas.");
}

function cerrarModalAsistenciaManual() {
    const overlay = document.getElementById("asistencia-manual-overlay");
    if (overlay) overlay.classList.remove("show");
}

async function handleMarcarAsistenciaManual() {
    toast("Usa el botón 'Detalles' para marcar asistencia en fechas específicas.");
    cerrarModalAsistenciaManual();
}

function mostrarErrorAsistenciaManual(msg) {
    const errorEl = document.getElementById("asistencia-manual-error");
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.classList.add("show");
    }
}

export function setupAsistenciaManualModal() {
    const closeBtn = document.getElementById("asistencia-manual-close");
    const cancelBtn = document.getElementById("asistencia-manual-cancel");
    const overlay = document.getElementById("asistencia-manual-overlay");
    const form = document.getElementById("asistencia-manual-form");

    if (closeBtn) closeBtn.addEventListener("click", cerrarModalAsistenciaManual);
    if (cancelBtn) cancelBtn.addEventListener("click", cerrarModalAsistenciaManual);
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) cerrarModalAsistenciaManual();
        });
    }
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            handleMarcarAsistenciaManual();
        });
    }
}