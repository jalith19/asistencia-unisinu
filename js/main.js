import { loadConfig } from './config.js';
import { state, saveCurrentRoute, restoreRoute, resetToHome } from './navigation.js';
import { showView, activateFaseTab } from './ui.js';
import { initAuth, setupAdminLogin } from './auth.js';
import { loadRegistro, loadCheckin, setupStudentForms } from './student.js';
import {
    loadProjectList,
    loadProjectDetail,
    renderFaseParticipantesTable,
    setupEditParticipanteModal,
    setupQRActions
} from './admin.js';

// Cache de admin para limpiar
let adminCache = {
    proyectos: [],
    proyectoActual: null,
    faseActual: null,
    rosterProyecto: [],
    faseParticipantes: [],
    cargado: false,
    proyectoIdActual: null
};

document.addEventListener("DOMContentLoaded", async () => {
    // Actualizar año en el footer
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    await loadConfig();
    const hasSession = await initAuth();

    // Configurar eventos primero
    setupEvents();

    // Verificar si hay parámetros en la URL (desde QR o enlace)
    const params = new URLSearchParams(window.location.search);
    const proyectoParam = params.get("proyecto");
    const faseParam = params.get("fase");
    const modoParam = params.get("modo");
    const fechaParam = params.get("fecha");

    if (proyectoParam !== null && proyectoParam !== "" && faseParam !== null && faseParam !== "") {
        // Si hay parámetros, cargar la vista de estudiante
        if (modoParam === "asistencia") {
            loadCheckin(proyectoParam, faseParam, fechaParam || "");
        } else {
            loadRegistro(proyectoParam, faseParam);
        }
        return;
    }

    // Si no hay parámetros, intentar restaurar la ruta o mostrar login
    if (hasSession) {
        const restored = restoreRoute();
        if (!restored) {
            showView("admin-login");
        }
    } else {
        showView("admin-login");
        // Si hay una ruta guardada pero no hay sesión, limpiarla
        sessionStorage.removeItem("adminRoute");
    }
});

function setupEvents() {
    // Eventos de navegación
    const backToList = document.getElementById("back-to-list");
    if (backToList) {
        backToList.addEventListener("click", () => {
            // Limpiar el proyecto actual del cache
            if (typeof adminCache !== 'undefined') {
                adminCache.proyectoActual = null;
                adminCache.proyectoIdActual = null;
                adminCache.faseActual = null;
                adminCache.faseParticipantes = [];
                adminCache.rosterProyecto = [];
            }
            state.currentProjectId = null;
            state.currentFaseIndex = null;
            showView("admin-list");
            loadProjectList();
            saveCurrentRoute();
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
                loadProjectList();
            }
            saveCurrentRoute();
        });
    }

    document.querySelectorAll(".topbar__home").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            resetToHome();
        })
    );

    // Eventos de tabs
    document.querySelectorAll(".fase-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.faseTab;
            activateFaseTab(tab);
            saveCurrentRoute();
        });
    });

    // Eventos de filtros
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

    // Configurar formularios
    setupStudentForms();
    setupAdminLogin();
    setupQRActions();
    setupEditParticipanteModal();
}

// Exponer adminCache para que otros módulos puedan limpiarlo
window.adminCache = adminCache;