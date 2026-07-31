import { showView } from './ui.js';

export let state = {
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

export function saveCurrentRoute() {
    try {
        const activeView = document.querySelector(".view.active");
        if (!activeView) return;
        
        const viewName = activeView.id?.replace("view-", "") || "admin-login";
        
        const route = {
            view: viewName,
            projectId: state.currentProjectId,
            faseIndex: state.currentFaseIndex,
            tab: document.querySelector(".fase-tab-btn.active")?.dataset?.faseTab || "participantes",
            isAdmin: state.isAdmin || false,
        };
        sessionStorage.setItem("adminRoute", JSON.stringify(route));
    } catch (e) { }
}

export function restoreRoute() {
    try {
        const data = sessionStorage.getItem("adminRoute");
        if (!data) return false;
        const route = JSON.parse(data);
        
        state.isAdmin = route.isAdmin || false;
        
        if (!route.view || route.view === "home" || route.view === "admin-login") {
            if (!state.isAdmin) {
                showView("admin-login");
                return false;
            }
            return false;
        }
        
        if (route.view === "admin-list") {
            showView("admin-list");
            import('./admin.js').then(module => {
                module.loadProjectList();
            });
            return true;
        }
        if (route.view === "admin-detail" && route.projectId !== null && route.projectId !== undefined) {
            state.currentProjectId = route.projectId;
            showView("admin-detail");
            import('./admin.js').then(module => {
                module.loadProjectDetail(route.projectId, route.faseIndex);
            });
            return true;
        }
        if (route.view === "fase-detail" && route.projectId !== null && route.projectId !== undefined && route.faseIndex !== null) {
            state.currentProjectId = route.projectId;
            state.currentFaseIndex = route.faseIndex;
            showView("fase-detail");
            import('./admin.js').then(module => {
                module.loadProjectDetail(route.projectId, route.faseIndex);
            });
            return true;
        }
        if (route.view === "qr-detail") {
            showView("admin-login");
            return false;
        }
        if (route.view === "student") {
            showView("admin-login");
            return false;
        }
        
        return false;
    } catch (e) { 
        console.error("Error restaurando ruta:", e);
        return false; 
    }
}

export function resetToHome() {
    // Limpiar cache de admin
    if (typeof window.adminCache !== 'undefined') {
        window.adminCache.proyectos = [];
        window.adminCache.proyectoActual = null;
        window.adminCache.cargado = false;
        window.adminCache.proyectoIdActual = null;
    }
    
    sessionStorage.removeItem("adminRoute");
    state.isAdmin = false;
    state.currentProjectId = null;
    state.currentFaseIndex = null;
    state.proyectoId = null;
    state.faseIndex = null;
    
    window.location.href = '/';
}