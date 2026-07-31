import { state, saveCurrentRoute } from './navigation.js';
import { showView } from './ui.js';
import { adminPassword, loadConfig } from './config.js';
import { loadProjectList } from './admin.js';

let password = "";

export async function initAuth() {
    password = await loadConfig();

    // Verificar si ya hay una sesión activa
    try {
        const data = sessionStorage.getItem("adminRoute");
        if (data) {
            const route = JSON.parse(data);
            if (route.isAdmin) {
                state.isAdmin = true;
                return true;
            }
        }
    } catch (e) {
        console.error("Error al verificar sesión:", e);
    }
    return false;
}

export function setupAdminLogin() {
    const form = document.getElementById("admin-login-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const inputPassword = document.getElementById("admin-password-input");
        const errorEl = document.getElementById("admin-login-error");

        if (!inputPassword || !errorEl) return;

        errorEl.style.display = "none";

        if (inputPassword.value === password) {
            state.isAdmin = true;

            // Guardar sesión
            const route = {
                view: "admin-list",
                isAdmin: true,
                projectId: null,
                faseIndex: null,
                tab: "participantes"
            };
            sessionStorage.setItem("adminRoute", JSON.stringify(route));

            showView("admin-list");
            loadProjectList();
            saveCurrentRoute();
            inputPassword.value = "";
        } else {
            errorEl.style.display = "block";
            inputPassword.value = "";
            inputPassword.focus();
        }
    });
}

export function logout() {
    sessionStorage.removeItem("adminRoute");
    state.isAdmin = false;
    window.location.href = '/';
}