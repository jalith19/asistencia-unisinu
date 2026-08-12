import { loadConfig } from './config.js';
import { state, saveCurrentRoute, restoreRoute, goToHome } from './navigation.js';
import { showView, activateFaseTab, toast } from './ui.js';
import { initAuth, setupAdminLogin, logout, aplicarPaletaColores } from './auth.js';
import { loadRegistro, loadCheckin, setupStudentForms } from './student.js';
import {
    loadProjectList,
    loadProjectListByOwner,
    loadProjectDetail,
    renderFaseParticipantesTable,
    setupEditParticipanteModal,
    setupFotoParticipanteModal,
    setupQRActions,
    crearSolicitudProyecto,
    cargarSolicitudes,
    crearFase,
    mostrarModalCrearEvaluacion,
    crearEvaluacionDesdeModal,
    renderEvaluacionesFase,
    verDetalleEvaluacion,
    agregarDimensionEnModal,
    openFaseDetail
} from './admin.js';

document.addEventListener("DOMContentLoaded", async () => {
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    await loadConfig();
    const hasSession = await initAuth();

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
        setTimeout(setupStudentForms, 100);
        return;
    }

    if (hasSession) {
        const restored = restoreRoute();
        if (!restored) {
            showView("admin-login");
        }
        actualizarMenuUI();
    } else {
        showView("admin-login");
        sessionStorage.removeItem("adminRoute");
    }

    setupEvents();
    setupPaletaPreview();
});

function setupPaletaPreview() {
    const colores = ['principal', 'fondo', 'acento'];

    colores.forEach(color => {
        const input = document.getElementById(`solicitud-color-${color}`);
        const preview = document.getElementById(`preview-${color}`);

        if (input && preview) {
            input.addEventListener('input', function () {
                preview.style.background = this.value;
                if (color === 'fondo') {
                    preview.style.color = getContrastColor(this.value);
                } else {
                    preview.style.color = '#fff';
                }
            });
        }
    });
}

function getContrastColor(hexcolor) {
    const r = parseInt(hexcolor.slice(1, 3), 16);
    const g = parseInt(hexcolor.slice(3, 5), 16);
    const b = parseInt(hexcolor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1a2535' : '#ffffff';
}

function actualizarMenuUI() {
    const btnSolicitar = document.getElementById("topbar-solicitar-link");
    const btnSolicitudes = document.getElementById("topbar-solicitudes-link");
    const btnLogout = document.getElementById("topbar-logout-link");
    const btnSolicitarProyecto = document.getElementById("btn-solicitar-proyecto");
    const btnSolicitarProyectoFooter = document.getElementById("btn-solicitar-proyecto-footer");

    if (!state.isAdmin) {
        if (btnSolicitar) btnSolicitar.style.display = "none";
        if (btnSolicitudes) btnSolicitudes.style.display = "none";
        if (btnLogout) btnLogout.style.display = "none";
        if (btnSolicitarProyecto) btnSolicitarProyecto.style.display = "none";
        if (btnSolicitarProyectoFooter) btnSolicitarProyectoFooter.style.display = "none";
        return;
    }

    if (btnSolicitar) {
        btnSolicitar.style.display = "inline-flex";
    }
    if (btnSolicitarProyecto) {
        btnSolicitarProyecto.style.display = "none";
    }
    if (btnSolicitarProyectoFooter) {
        btnSolicitarProyectoFooter.style.display = "none";
    }

    if (btnSolicitudes) {
        btnSolicitudes.style.display = state.isSuperUser ? "inline-flex" : "none";
    }

    if (btnLogout) {
        btnLogout.style.display = "inline-flex";
    }
}

function setupEvents() {
    const backToList = document.getElementById("back-to-list");
    if (backToList) {
        backToList.addEventListener("click", () => {
            state.currentProjectId = null;
            state.currentFaseIndex = null;
            showView("admin-list");
            if (state.isSuperUser) {
                loadProjectList();
            } else {
                loadProjectListByOwner(state.userId);
            }
            saveCurrentRoute();
            actualizarMenuUI();
        });
    }

    const backToProject = document.getElementById("back-to-project");
    if (backToProject) {
        backToProject.addEventListener("click", () => {
            if (state.currentProjectId !== null) {
                state.currentFaseIndex = null;
                loadProjectDetail(state.currentProjectId);
            } else {
                showView("admin-list");
                if (state.isSuperUser) {
                    loadProjectList();
                } else {
                    loadProjectListByOwner(state.userId);
                }
            }
            saveCurrentRoute();
            actualizarMenuUI();
        });
    }

    const homeLink = document.getElementById("topbar-home-link");
    if (homeLink) {
        homeLink.addEventListener("click", (e) => {
            e.preventDefault();
            goToHome();
        });
    }

    const btnSolicitar = document.getElementById("topbar-solicitar-link");
    if (btnSolicitar) {
        btnSolicitar.addEventListener("click", (e) => {
            e.preventDefault();
            if (!state.isAdmin) {
                showView("admin-login");
                return;
            }
            showView("solicitar-proyecto");
            saveCurrentRoute();
        });
    }

    const btnSolicitudes = document.getElementById("topbar-solicitudes-link");
    if (btnSolicitudes) {
        btnSolicitudes.addEventListener("click", (e) => {
            e.preventDefault();
            if (!state.isSuperUser) {
                toast("No tienes permisos para ver solicitudes");
                return;
            }
            showView("solicitudes");
            cargarSolicitudes();
            saveCurrentRoute();
        });
    }

    const btnLogout = document.getElementById("topbar-logout-link");
    if (btnLogout) {
        btnLogout.addEventListener("click", (e) => {
            e.preventDefault();
            logout();
        });
    }

    const linkCrearSolicitud = document.getElementById("link-crear-solicitud");
    if (linkCrearSolicitud) {
        linkCrearSolicitud.addEventListener("click", (e) => {
            e.preventDefault();
            showView("solicitar-proyecto");
            saveCurrentRoute();
        });
    }

    const backFromSolicitar = document.getElementById("back-to-list-from-solicitar");
    if (backFromSolicitar) {
        if (!state.isAdmin) {
            backFromSolicitar.style.display = "none";
        }
        backFromSolicitar.addEventListener("click", () => {
            showView("admin-list");
            if (state.isSuperUser) {
                loadProjectList();
            } else {
                loadProjectListByOwner(state.userId);
            }
            saveCurrentRoute();
            actualizarMenuUI();
        });
    }

    const backFromSolicitudes = document.getElementById("back-to-list-from-solicitudes");
    if (backFromSolicitudes) {
        backFromSolicitudes.addEventListener("click", () => {
            showView("admin-list");
            if (state.isSuperUser) {
                loadProjectList();
            } else {
                loadProjectListByOwner(state.userId);
            }
            saveCurrentRoute();
            actualizarMenuUI();
        });
    }

    document.querySelectorAll(".fase-tab-btn, .tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.faseTab || btn.dataset.tab;
            if (tab) {
                activateFaseTab(tab);
                if (tab === 'evaluaciones') {
                    renderEvaluacionesFase();
                }
                saveCurrentRoute();
            }
        });
    });

    const searchInput = document.getElementById("fase-asistencia-search");
    if (searchInput) {
        searchInput.addEventListener("input", renderFaseParticipantesTable);
    }

    const filterMode = document.getElementById("asistencia-filter-mode");
    if (filterMode) {
        filterMode.addEventListener("change", () => {
            const mode = filterMode.value;
            const rangoRow = document.getElementById("filtro-rango-row");
            if (rangoRow) rangoRow.classList.toggle("hidden", mode !== "rango");
            renderFaseParticipantesTable();
        });
    }

    const filtroDesde = document.getElementById("filtro-desde");
    if (filtroDesde) {
        filtroDesde.addEventListener("change", renderFaseParticipantesTable);
    }

    const filtroHasta = document.getElementById("filtro-hasta");
    if (filtroHasta) {
        filtroHasta.addEventListener("change", renderFaseParticipantesTable);
    }

    setupAdminLogin();
    setupQRActions();
    setupEditParticipanteModal();
    setupFotoParticipanteModal();
    setupSolicitarProyectoForm();

    // BOTÓN CREAR FASE
    const btnCrearFase = document.getElementById("btn-crear-fase");
    if (btnCrearFase) {
        btnCrearFase.addEventListener("click", () => {
            mostrarModalCrearFase();
        });
    }

    // MODALES
    setupCrearFaseModal();
    setupCrearEvaluacionModal();
    setupVerEvaluacionModal();
    setupCalificarEstrellasModal();
    setupSeleccionarEvaluacionModal();

    // AGREGAR DIMENSIÓN
    const btnAgregarDimension = document.getElementById("agregar-dimension-btn");
    if (btnAgregarDimension) {
        btnAgregarDimension.addEventListener("click", agregarDimensionEnModal);
    }

    const activeView = document.querySelector(".view.active");
    if (activeView && activeView.id === "view-student") {
        setupStudentForms();
    }
}

// ============================================================
// CONFIGURAR MODAL CREAR FASE
// ============================================================
function setupCrearFaseModal() {
    const overlay = document.getElementById("crear-fase-overlay");
    const closeBtn = document.getElementById("crear-fase-close");
    const cancelBtn = document.getElementById("crear-fase-cancel");
    const form = document.getElementById("crear-fase-form");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            overlay.classList.remove("show");
            form?.reset();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            overlay.classList.remove("show");
            form?.reset();
        });
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("show");
                form?.reset();
            }
        });
    }
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleCrearFase();
        });
    }
}

export function mostrarModalCrearFase() {
    const overlay = document.getElementById("crear-fase-overlay");
    const form = document.getElementById("crear-fase-form");
    const errorEl = document.getElementById("crear-fase-error");

    if (!overlay) {
        toast("El modal de creación de fases no está disponible");
        return;
    }

    if (form) form.reset();
    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }

    const fechaInput = document.getElementById("fase-fecha-hora");
    if (fechaInput) {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        const isoString = now.toISOString().slice(0, 16);
        fechaInput.value = isoString;
    }

    overlay.classList.add("show");
}

async function handleCrearFase() {
    const errorEl = document.getElementById("crear-fase-error");
    const guardarBtn = document.getElementById("crear-fase-guardar");

    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }

    const titulo = document.getElementById("fase-titulo")?.value.trim();
    const fechaHora = document.getElementById("fase-fecha-hora")?.value;
    const tiempoLimite = Number(document.getElementById("fase-tiempo-limite")?.value) || 60;
    const activa = document.getElementById("fase-activa")?.checked || false;

    if (!titulo) {
        if (errorEl) {
            errorEl.textContent = "El título de la fase es obligatorio";
            errorEl.style.display = "block";
        }
        return;
    }

    if (guardarBtn) {
        guardarBtn.disabled = true;
        guardarBtn.textContent = "Creando...";
    }

    try {
        const proyectoId = state.currentProjectId;
        if (!proyectoId) {
            throw new Error("No hay un proyecto seleccionado");
        }

        const resultado = await crearFase(proyectoId, {
            titulo,
            fechaHoraInicio: fechaHora || new Date().toISOString().slice(0, 16).replace('T', ' '),
            tiempoLimiteMin: tiempoLimite,
            activa
        });

        if (resultado.success) {
            const overlay = document.getElementById("crear-fase-overlay");
            if (overlay) overlay.classList.remove("show");

            await loadProjectDetail(proyectoId);
            toast("Fase creada correctamente");
        } else {
            if (errorEl) {
                errorEl.textContent = `Error: ${resultado.error}`;
                errorEl.style.display = "block";
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = `Error: ${err.message}`;
            errorEl.style.display = "block";
        }
    } finally {
        if (guardarBtn) {
            guardarBtn.disabled = false;
            guardarBtn.textContent = "Crear fase";
        }
    }
}

// ============================================================
// CONFIGURAR MODAL CREAR EVALUACIÓN
// ============================================================
function setupCrearEvaluacionModal() {
    const overlay = document.getElementById("crear-evaluacion-overlay");
    const closeBtn = document.getElementById("crear-evaluacion-close");
    const cancelBtn = document.getElementById("crear-evaluacion-cancel");
    const form = document.getElementById("crear-evaluacion-form");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            overlay.classList.remove("show");
            form?.reset();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            overlay.classList.remove("show");
            form?.reset();
        });
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.remove("show");
                form?.reset();
            }
        });
    }
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleCrearEvaluacion();
        });
    }
}

async function handleCrearEvaluacion() {
    const errorEl = document.getElementById("crear-evaluacion-error");
    const guardarBtn = document.getElementById("crear-evaluacion-guardar");

    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }

    const nombre = document.getElementById("evaluacion-nombre")?.value.trim();
    const descripcion = document.getElementById("evaluacion-descripcion")?.value.trim();

    if (!nombre) {
        if (errorEl) {
            errorEl.textContent = "El nombre de la evaluación es obligatorio";
            errorEl.style.display = "block";
        }
        return;
    }

    if (guardarBtn) {
        guardarBtn.disabled = true;
        guardarBtn.textContent = "Creando...";
    }

    try {
        const resultado = await crearEvaluacionDesdeModal(
            state.currentProjectId,
            state.currentFaseIndex
        );

        if (resultado.success) {
            toast("Evaluación creada y asignada a todos los participantes");
            if (state.currentProjectId && state.currentFaseIndex !== null) {
                await openFaseDetail(state.currentFaseIndex);
            }
        } else {
            if (errorEl) {
                errorEl.textContent = `Error: ${resultado.error}`;
                errorEl.style.display = "block";
            }
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = `Error: ${err.message}`;
            errorEl.style.display = "block";
        }
    } finally {
        if (guardarBtn) {
            guardarBtn.disabled = false;
            guardarBtn.textContent = "Crear y asignar";
        }
    }
}

// ============================================================
// CONFIGURAR MODAL VER EVALUACIÓN
// ============================================================
function setupVerEvaluacionModal() {
    const overlay = document.getElementById("ver-evaluacion-overlay");
    const closeBtn = document.getElementById("ver-evaluacion-close");
    const cerrarBtn = document.getElementById("ver-evaluacion-cerrar");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => overlay.classList.remove("show"));
    }
    if (cerrarBtn) {
        cerrarBtn.addEventListener("click", () => overlay.classList.remove("show"));
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("show");
        });
    }
}

// ============================================================
// CONFIGURAR MODAL CALIFICAR CON ESTRELLAS
// ============================================================
function setupCalificarEstrellasModal() {
    const overlay = document.getElementById("calificar-estrellas-overlay");
    const closeBtn = document.getElementById("calificar-estrellas-close");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => overlay.classList.remove("show"));
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("show");
        });
    }
}

// ============================================================
// CONFIGURAR MODAL SELECCIONAR EVALUACIÓN
// ============================================================
function setupSeleccionarEvaluacionModal() {
    const overlay = document.getElementById("seleccionar-evaluacion-overlay");
    const closeBtn = document.getElementById("seleccionar-evaluacion-close");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => overlay.classList.remove("show"));
    }
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("show");
        });
    }
}

// ============================================================
// FORMULARIO DE SOLICITUD DE PROYECTO
// ============================================================
function setupSolicitarProyectoForm() {
    const form = document.getElementById("solicitar-proyecto-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = document.getElementById("solicitud-nombre").value.trim();
        const descripcion = document.getElementById("solicitud-descripcion").value.trim();
        const propietarioNombre = document.getElementById("solicitud-propietario-nombre").value.trim();
        const propietarioCorreo = document.getElementById("solicitud-propietario-correo").value.trim();
        const propietarioTelefono = document.getElementById("solicitud-propietario-telefono").value.trim();

        const paletaColores = {
            principal: document.getElementById("solicitud-color-principal").value || "#1a365d",
            fondo: document.getElementById("solicitud-color-fondo").value || "#f8f9fa",
            acento: document.getElementById("solicitud-color-acento").value || "#c8102e"
        };

        const errorEl = document.getElementById("solicitud-error");
        const successEl = document.getElementById("solicitud-success");
        const submitBtn = document.getElementById("solicitud-submit-btn");

        if (errorEl) errorEl.style.display = "none";
        if (successEl) successEl.style.display = "none";

        if (!nombre || !descripcion || !propietarioNombre || !propietarioCorreo || !propietarioTelefono) {
            if (errorEl) {
                errorEl.textContent = "Todos los campos son obligatorios.";
                errorEl.style.display = "block";
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando...";

        try {
            const resultado = await crearSolicitudProyecto({
                nombre,
                descripcion,
                propietario: {
                    nombre: propietarioNombre,
                    correo: propietarioCorreo,
                    telefono: propietarioTelefono
                },
                paletaColores: paletaColores
            });

            if (resultado.success) {
                if (successEl) successEl.style.display = "block";
                form.reset();
                const successText = document.querySelector("#solicitud-success p:last-child");
                if (successText) {
                    successText.textContent = `ID de solicitud: ${resultado.id}. Te notificaremos cuando sea aprobada.`;
                }
                toast("Solicitud creada exitosamente");
            } else {
                if (errorEl) {
                    errorEl.textContent = `Error: ${resultado.error}`;
                    errorEl.style.display = "block";
                }
                toast("Error al crear la solicitud");
            }
        } catch (err) {
            console.error("Error al crear solicitud:", err);
            if (errorEl) {
                errorEl.textContent = `Error al crear la solicitud: ${err.message}`;
                errorEl.style.display = "block";
            }
            toast("Error al crear la solicitud");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Enviar solicitud";
        }
    });
}

window.actualizarMenuUI = actualizarMenuUI;
window.aplicarPaletaColores = aplicarPaletaColores;