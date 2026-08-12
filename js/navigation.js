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
    isSuperUser: false,
    userEmail: null,
    userId: null,
    userRol: null,
    proyectosPropios: [],
    proyectosColaborador: [],
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

        const activeTab = document.querySelector(".tab-btn.active, .fase-tab-btn.active");
        const tabName = activeTab?.dataset?.tab || activeTab?.dataset?.faseTab || "participantes";

        const route = {
            view: viewName,
            projectId: state.currentProjectId,
            faseIndex: state.currentFaseIndex,
            tab: tabName,
            isAdmin: state.isAdmin || false,
            isSuperUser: state.isSuperUser || false,
            userEmail: state.userEmail || null,
            userId: state.userId || null,
            userRol: state.userRol || null,
            proyectosPropios: state.proyectosPropios || [],
            proyectosColaborador: state.proyectosColaborador || [],
        };
        sessionStorage.setItem("adminRoute", JSON.stringify(route));
    } catch (e) {
        console.error("Error guardando ruta:", e);
    }
}

export function restoreRoute() {
    try {
        const data = sessionStorage.getItem("adminRoute");
        if (!data) return false;
        const route = JSON.parse(data);

        state.isAdmin = route.isAdmin || false;
        state.isSuperUser = route.isSuperUser || false;
        state.userEmail = route.userEmail || null;
        state.userId = route.userId || null;
        state.userRol = route.userRol || null;
        state.proyectosPropios = route.proyectosPropios || [];
        state.proyectosColaborador = route.proyectosColaborador || [];
        state.currentProjectId = route.projectId || null;
        state.currentFaseIndex = route.faseIndex || null;

        if (!state.isAdmin) {
            showView("admin-login");
            return false;
        }

        if (window.actualizarMenuUI) {
            setTimeout(() => window.actualizarMenuUI(), 50);
        }

        if (route.view === "admin-list" || !route.view || route.view === "home") {
            showView("admin-list");
            import('./admin.js').then(module => {
                if (state.isSuperUser) {
                    module.loadProjectList();
                } else {
                    module.loadProjectListByOwner(state.userId);
                }
            });
            return true;
        }

        if (route.view === "solicitar-proyecto") {
            showView("solicitar-proyecto");
            return true;
        }

        if (route.view === "solicitudes") {
            if (!state.isSuperUser) {
                showView("admin-list");
                import('./admin.js').then(module => {
                    module.loadProjectList();
                });
                return false;
            }
            showView("solicitudes");
            import('./admin.js').then(module => {
                module.cargarSolicitudes();
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
            showView("admin-list");
            import('./admin.js').then(module => {
                if (state.isSuperUser) {
                    module.loadProjectList();
                } else {
                    module.loadProjectListByOwner(state.userId);
                }
            });
            return true;
        }

        if (route.view === "student") {
            showView("admin-list");
            import('./admin.js').then(module => {
                if (state.isSuperUser) {
                    module.loadProjectList();
                } else {
                    module.loadProjectListByOwner(state.userId);
                }
            });
            return true;
        }

        showView("admin-list");
        import('./admin.js').then(module => {
            if (state.isSuperUser) {
                module.loadProjectList();
            } else {
                module.loadProjectListByOwner(state.userId);
            }
        });
        return true;
    } catch (e) {
        console.error("Error restaurando ruta:", e);
        showView("admin-login");
        return false;
    }
}

export function goToHome() {
    if (state.isAdmin) {
        showView("admin-list");
        import('./admin.js').then(module => {
            if (state.isSuperUser) {
                module.loadProjectList();
            } else {
                module.loadProjectListByOwner(state.userId);
            }
        });
        saveCurrentRoute();
        if (window.actualizarMenuUI) {
            setTimeout(() => window.actualizarMenuUI(), 50);
        }
    } else {
        showView("admin-login");
    }
}

export function resetToHome() {
    sessionStorage.removeItem("adminRoute");
    state.isAdmin = false;
    state.isSuperUser = false;
    state.userEmail = null;
    state.userId = null;
    state.userRol = null;
    state.currentProjectId = null;
    state.currentFaseIndex = null;
    state.proyectoId = null;
    state.faseIndex = null;
    state.proyectosPropios = [];
    state.proyectosColaborador = [];

    window.location.href = '/';
}