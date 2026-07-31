let toastTimer = null;

export function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

export function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById(`view-${name}`);
    if (target) {
        target.classList.add("active");
    } else {
        // Si no existe la vista, mostrar login
        const loginTarget = document.getElementById("view-admin-login");
        if (loginTarget) loginTarget.classList.add("active");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

    const homeLink = document.getElementById("topbar-home-link");
    if (homeLink) {
        if (name === "student" || name === "qr-detail") {
            homeLink.style.display = "none";
        } else {
            homeLink.style.display = "inline-flex";
        }
    }
}

export function activateFaseTab(tab) {
    document.querySelectorAll(".fase-tab-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.faseTab === tab);
    });
    document.querySelectorAll(".fase-tab-panel").forEach((p) => {
        p.classList.toggle("active", p.id === `fase-tab-${tab}`);
    });
    sessionStorage.setItem("faseTab", tab);
}

export function showStudentMessage(type, text) {
    const el = document.getElementById("student-inline-msg");
    if (!el) return;
    el.textContent = text;
    el.className = `inline-msg inline-msg--${type} show`;
}

export function hideStudentMessage() {
    const el = document.getElementById("student-inline-msg");
    if (!el) return;
    el.classList.remove("show");
}