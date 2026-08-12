import { state, saveCurrentRoute } from './navigation.js';
import { showView, toast } from './ui.js';
import { FIREBASE_BASE, ROLES } from './config.js';
import { fbGet, fbPatch, fbPost } from './firebase.js';
import { loadProjectList, loadProjectListByOwner } from './admin.js';
import { enviarCorreo, plantillaCodigoAcceso } from './email.js';

let codigoGenerado = null;
let emailVerificando = null;
let codigoCompleto = '';

// ============================================================
// FUNCIÓN PARA APLICAR PALETA DE COLORES
// ============================================================
export function aplicarPaletaColores(paleta) {
    if (!paleta) return;

    const root = document.documentElement;

    if (paleta.principal) root.style.setProperty('--primary', paleta.principal);
    if (paleta.fondo) {
        root.style.setProperty('--gray-50', paleta.fondo);
        document.body.style.backgroundColor = paleta.fondo;
    }
    if (paleta.acento) root.style.setProperty('--accent', paleta.acento);

    sessionStorage.setItem('userPaleta', JSON.stringify(paleta));
}

export async function initAuth() {
    try {
        const data = sessionStorage.getItem("adminRoute");
        if (data) {
            const route = JSON.parse(data);
            if (route.isAdmin) {
                state.isAdmin = true;
                state.userEmail = route.userEmail || null;
                state.userId = route.userId || null;
                state.userRol = route.userRol || null;
                state.isSuperUser = route.isSuperUser || false;
                state.proyectosPropios = route.proyectosPropios || [];
                state.proyectosColaborador = route.proyectosColaborador || [];

                const paletaGuardada = sessionStorage.getItem('userPaleta');
                if (paletaGuardada) {
                    try {
                        const paleta = JSON.parse(paletaGuardada);
                        aplicarPaletaColores(paleta);
                    } catch (e) {
                        console.warn("Error al restaurar paleta:", e);
                    }
                }
                return true;
            }
        }
    } catch (e) {
        console.error("Error al verificar sesión:", e);
    }
    return false;
}

function mostrarEstadoEnviando(mostrar) {
    const loginForm = document.getElementById("admin-login-form");
    const submitBtn = loginForm?.querySelector('button[type="submit"]');
    const errorEl = document.getElementById("admin-login-error");

    if (!submitBtn) return;

    if (mostrar) {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-sending');
        submitBtn.innerHTML = '<span class="spinner-dot"></span> Enviando código...';
        if (errorEl) errorEl.style.display = "none";
    } else {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-sending');
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
    }
}

function setupCodigoInputs() {
    const inputs = document.querySelectorAll('.codigo-input');
    const totalInputs = inputs.length;

    inputs.forEach((input, index) => {
        input.addEventListener('input', function (e) {
            this.value = this.value.replace(/\D/g, '');

            if (this.value.length === 1) {
                if (index < totalInputs - 1) {
                    inputs[index + 1].focus();
                }
                actualizarCodigoCompleto();
                const errorEl = document.getElementById("codigo-error");
                if (errorEl) {
                    errorEl.style.display = "none";
                    errorEl.textContent = "";
                }
            }
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && this.value === '' && index > 0) {
                inputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', function (e) {
            e.preventDefault();
            const pastedData = (e.clipboardData || window.clipboardData).getData('text');
            const numbers = pastedData.replace(/\D/g, '').slice(0, totalInputs);

            if (numbers.length > 0) {
                for (let i = 0; i < numbers.length && i < totalInputs; i++) {
                    inputs[i].value = numbers[i];
                }
                const nextIndex = Math.min(numbers.length, totalInputs - 1);
                inputs[nextIndex].focus();
                actualizarCodigoCompleto();
            }
        });
    });
}

function actualizarCodigoCompleto() {
    const inputs = document.querySelectorAll('.codigo-input');
    codigoCompleto = Array.from(inputs).map(inp => inp.value).join('');
}

function obtenerCodigoCompleto() {
    actualizarCodigoCompleto();
    return codigoCompleto;
}

function limpiarCodigoInputs() {
    const inputs = document.querySelectorAll('.codigo-input');
    inputs.forEach(inp => {
        inp.value = '';
        inp.classList.remove('codigo-input--error');
    });
    codigoCompleto = '';
    if (inputs.length > 0) {
        inputs[0].focus();
    }
}

function marcarErrorCodigo() {
    const inputs = document.querySelectorAll('.codigo-input');
    inputs.forEach(inp => inp.classList.add('codigo-input--error'));
    setTimeout(() => {
        inputs.forEach(inp => inp.classList.remove('codigo-input--error'));
    }, 500);
}

export function setupAdminLogin() {
    const form = document.getElementById("admin-login-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("admin-email-input");
        const errorEl = document.getElementById("admin-login-error");

        if (!emailInput || !errorEl) return;

        errorEl.style.display = "none";
        const email = emailInput.value.trim();

        if (!email) {
            errorEl.style.display = "block";
            errorEl.textContent = "Por favor ingresa tu correo electrónico.";
            return;
        }

        mostrarEstadoEnviando(true);

        try {
            const usuariosData = await fbGet("usuarios");
            let usuarioEncontrado = null;
            let firebaseKey = null;

            if (usuariosData) {
                const usuarios = Object.entries(usuariosData).map(([key, u]) => ({
                    firebaseKey: key,
                    ...u
                }));
                const encontrado = usuarios.find(u =>
                    u.correo && u.correo.toLowerCase() === email.toLowerCase()
                );
                if (encontrado) {
                    usuarioEncontrado = encontrado;
                    firebaseKey = encontrado.firebaseKey;
                }
            }

            if (!usuarioEncontrado) {
                mostrarEstadoEnviando(false);
                errorEl.style.display = "block";
                errorEl.textContent = "No existe un usuario registrado con este correo. Contacta al administrador.";
                emailInput.focus();
                return;
            }

            const codigo = String(Math.floor(1000 + Math.random() * 9000));
            codigoGenerado = codigo;
            emailVerificando = email;

            await fbPatch(`usuarios/${firebaseKey}`, { codigoAcceso: codigo });

            const htmlCorreo = plantillaCodigoAcceso({
                nombre: usuarioEncontrado.nombre,
                codigo: codigo,
                tiempoExpiracion: 5
            });

            const enviado = await enviarCorreo(
                email,
                `🔐 Código de acceso - EVA`,
                htmlCorreo
            );

            mostrarEstadoEnviando(false);

            if (!enviado) {
                errorEl.style.display = "block";
                errorEl.textContent = "Error al enviar el código. Verifica tu conexión e intenta nuevamente.";
                return;
            }

            mostrarVistaCodigo(email);

        } catch (err) {
            mostrarEstadoEnviando(false);
            console.error("Error verificando usuario:", err);
            errorEl.style.display = "block";
            errorEl.textContent = "Error al verificar tus datos. Intenta nuevamente.";
        }
    });

    const btnVolver = document.getElementById("btn-volver-login");
    if (btnVolver) {
        btnVolver.addEventListener("click", () => {
            resetLogin();
        });
    }
}

function mostrarVistaCodigo(email) {
    const loginForm = document.getElementById("admin-login-form");
    const loginHeader = document.querySelector(".login-header");
    const loginError = document.getElementById("admin-login-error");
    const codigoSection = document.getElementById("codigo-verificacion-section");
    const emailDisplay = document.getElementById("codigo-email-display");

    if (loginForm) loginForm.style.display = "none";
    if (loginHeader) loginHeader.style.display = "none";
    if (loginError) loginError.style.display = "none";
    if (codigoSection) codigoSection.classList.remove("hidden");
    if (emailDisplay) emailDisplay.textContent = email;

    setupCodigoInputs();
    limpiarCodigoInputs();
    iniciarTemporizador();
}

function iniciarTemporizador() {
    const timerEl = document.getElementById("codigo-timer");
    const reenviarBtn = document.getElementById("btn-reenviar-codigo");
    let segundos = 300;

    if (!timerEl) return;

    const actualizarTimer = () => {
        const minutos = Math.floor(segundos / 60);
        const segs = segundos % 60;
        timerEl.textContent = `${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;

        if (segundos <= 0) {
            clearInterval(window.timerInterval);
            if (reenviarBtn) reenviarBtn.disabled = false;
            timerEl.textContent = "Expirado";
            timerEl.classList.add('expirado');
        }
        segundos--;
    };

    actualizarTimer();
    window.timerInterval = setInterval(actualizarTimer, 1000);

    if (reenviarBtn) {
        reenviarBtn.disabled = true;
        reenviarBtn.onclick = () => {
            reenviarCodigo();
        };
    }

    const verificarBtn = document.getElementById("btn-verificar-codigo");
    if (verificarBtn) {
        verificarBtn.onclick = () => {
            verificarCodigo();
        };
    }
}

async function reenviarCodigo() {
    if (!emailVerificando) return;

    const errorEl = document.getElementById("codigo-error");
    const reenviarBtn = document.getElementById("btn-reenviar-codigo");

    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }

    if (reenviarBtn) {
        reenviarBtn.disabled = true;
        reenviarBtn.innerHTML = '<span class="spinner-dot" style="width:14px;height:14px;"></span> Enviando...';
    }

    try {
        const codigo = String(Math.floor(1000 + Math.random() * 9000));
        codigoGenerado = codigo;

        const usuariosData = await fbGet("usuarios");
        let firebaseKey = null;
        let usuarioNombre = null;

        if (usuariosData) {
            const usuarios = Object.entries(usuariosData).map(([key, u]) => ({
                firebaseKey: key,
                ...u
            }));
            const encontrado = usuarios.find(u =>
                u.correo && u.correo.toLowerCase() === emailVerificando.toLowerCase()
            );
            if (encontrado) {
                firebaseKey = encontrado.firebaseKey;
                usuarioNombre = encontrado.nombre;
            }
        }

        if (!firebaseKey) {
            toast("Error al encontrar el usuario");
            if (reenviarBtn) {
                reenviarBtn.disabled = false;
                reenviarBtn.innerHTML = '<i class="fas fa-redo"></i> Reenviar';
            }
            return;
        }

        await fbPatch(`usuarios/${firebaseKey}`, { codigoAcceso: codigo });

        const htmlCorreo = plantillaCodigoAcceso({
            nombre: usuarioNombre,
            codigo: codigo,
            tiempoExpiracion: 5
        });

        await enviarCorreo(emailVerificando, `🔐 Nuevo código de acceso - EVA`, htmlCorreo);

        clearInterval(window.timerInterval);
        limpiarCodigoInputs();
        iniciarTemporizador();

        if (reenviarBtn) {
            reenviarBtn.disabled = false;
            reenviarBtn.innerHTML = '<i class="fas fa-redo"></i> Reenviar';
        }

        toast("Nuevo código enviado a tu correo");

    } catch (err) {
        console.error("Error al reenviar código:", err);
        if (errorEl) {
            errorEl.textContent = "Error al reenviar el código. Intenta nuevamente.";
            errorEl.style.display = "block";
        }
        if (reenviarBtn) {
            reenviarBtn.disabled = false;
            reenviarBtn.innerHTML = '<i class="fas fa-redo"></i> Reenviar';
        }
    }
}

async function verificarCodigo() {
    const codigoIngresado = obtenerCodigoCompleto();
    const errorEl = document.getElementById("codigo-error");
    const verificarBtn = document.getElementById("btn-verificar-codigo");

    if (!errorEl || !verificarBtn) return;

    if (codigoIngresado.length < 4) {
        errorEl.textContent = "Ingresa los 4 dígitos del código";
        errorEl.style.display = "block";
        marcarErrorCodigo();
        return;
    }

    if (codigoIngresado !== codigoGenerado) {
        errorEl.textContent = "Código incorrecto. Verifica e intenta nuevamente.";
        errorEl.style.display = "block";
        marcarErrorCodigo();
        limpiarCodigoInputs();
        return;
    }

    if (window.timerInterval) {
        clearInterval(window.timerInterval);
    }

    verificarBtn.disabled = true;
    verificarBtn.innerHTML = '<span class="spinner-dot"></span> Verificando...';

    try {
        const usuariosData = await fbGet("usuarios");
        let usuarioEncontrado = null;
        let firebaseKey = null;

        if (usuariosData) {
            const usuarios = Object.entries(usuariosData).map(([key, u]) => ({
                firebaseKey: key,
                ...u
            }));
            const encontrado = usuarios.find(u =>
                u.correo && u.correo.toLowerCase() === emailVerificando.toLowerCase()
            );
            if (encontrado) {
                usuarioEncontrado = encontrado;
                firebaseKey = encontrado.firebaseKey;
            }
        }

        if (!usuarioEncontrado) {
            errorEl.textContent = "Error al verificar el usuario";
            errorEl.style.display = "block";
            verificarBtn.disabled = false;
            verificarBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verificar y acceder';
            return;
        }

        // El usuario es admin si tiene rol "admin"
        const esAdmin = usuarioEncontrado.rol === ROLES.ADMIN;

        const proyectosData = await fbGet("proyectos");
        let proyectosPropios = [];
        let paletaUsuario = null;
        let proyectosColaborador = [];

        if (proyectosData) {
            const proyectos = Object.entries(proyectosData).map(([id, p]) => ({ id, ...p }));

            paletaUsuario = usuarioEncontrado.paletaColores || null;

            if (!paletaUsuario) {
                const proyectoUsuario = proyectos.find(p =>
                    p.propietario?.idPropietario === usuarioEncontrado.id &&
                    p.paletaColores
                );
                paletaUsuario = proyectoUsuario?.paletaColores || null;
            }

            // Proyectos donde es propietario
            proyectosPropios = proyectos.filter(p =>
                p.propietario &&
                p.propietario.idPropietario === usuarioEncontrado.id &&
                p.estadoSolicitud === "aprobada"
            );

            // Proyectos donde es colaborador (el rol ya no es "docente", ahora es "colaborador")
            // Pero un usuario puede ser colaborador independientemente de su rol
            proyectosColaborador = proyectos.filter(p =>
                p.estadoSolicitud === "aprobada" &&
                Array.isArray(p.colaboradores) &&
                p.colaboradores.some(col => col.idColaborador === usuarioEncontrado.id)
            );
        }

        if (paletaUsuario) {
            aplicarPaletaColores(paletaUsuario);
        }

        // Un usuario tiene acceso si es admin, es propietario de un proyecto, o es colaborador en un proyecto
        const tieneAcceso = esAdmin || proyectosPropios.length > 0 || proyectosColaborador.length > 0;

        if (tieneAcceso) {
            state.isAdmin = true;
            state.userEmail = emailVerificando;
            state.userId = usuarioEncontrado.id;
            state.userRol = usuarioEncontrado.rol;
            state.isSuperUser = esAdmin;
            state.proyectosPropios = proyectosPropios.map(p => p.id);
            state.proyectosColaborador = proyectosColaborador.map(p => p.id);

            const route = {
                view: "admin-list",
                isAdmin: true,
                userEmail: emailVerificando,
                userId: usuarioEncontrado.id,
                userRol: usuarioEncontrado.rol,
                isSuperUser: esAdmin,
                proyectosPropios: state.proyectosPropios,
                proyectosColaborador: state.proyectosColaborador,
                projectId: null,
                faseIndex: null,
                tab: "participantes"
            };
            sessionStorage.setItem("adminRoute", JSON.stringify(route));

            await fbPatch(`usuarios/${firebaseKey}`, { codigoAcceso: null });

            showView("admin-list");
            if (esAdmin) {
                loadProjectList();
            } else {
                loadProjectListByOwner(usuarioEncontrado.id);
            }
            saveCurrentRoute();

            codigoGenerado = null;
            emailVerificando = null;

            if (window.actualizarMenuUI) {
                setTimeout(() => window.actualizarMenuUI(), 100);
            }

            toast(`Bienvenido, ${usuarioEncontrado.nombre}`);
        } else {
            errorEl.textContent = "No tienes proyectos asociados a tu cuenta ni eres colaborador en ninguno. Solicita un nuevo proyecto o contacta al administrador.";
            errorEl.style.display = "block";
            verificarBtn.disabled = false;
            verificarBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verificar y acceder';
        }
    } catch (err) {
        console.error("Error verificando código:", err);
        errorEl.textContent = "Error al verificar el código. Intenta nuevamente.";
        errorEl.style.display = "block";
        verificarBtn.disabled = false;
        verificarBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verificar y acceder';
    }
}

export function logout() {
    clearInterval(window.timerInterval);
    sessionStorage.removeItem("adminRoute");
    sessionStorage.removeItem("userPaleta");
    state.isAdmin = false;
    state.userEmail = null;
    state.userId = null;
    state.userRol = null;
    state.isSuperUser = false;
    state.proyectosPropios = [];
    state.proyectosColaborador = [];
    codigoGenerado = null;
    emailVerificando = null;
    window.location.href = '/';
}

export function resetLogin() {
    clearInterval(window.timerInterval);
    const loginForm = document.getElementById("admin-login-form");
    const loginHeader = document.querySelector(".login-header");
    const loginError = document.getElementById("admin-login-error");
    const codigoSection = document.getElementById("codigo-verificacion-section");
    const emailInput = document.getElementById("admin-email-input");

    if (loginForm) loginForm.style.display = "block";
    if (loginHeader) loginHeader.style.display = "block";
    if (loginError) loginError.style.display = "none";
    if (codigoSection) codigoSection.classList.add("hidden");
    limpiarCodigoInputs();
    if (emailInput) {
        emailInput.value = "";
        emailInput.focus();
    }

    codigoGenerado = null;
    emailVerificando = null;
}