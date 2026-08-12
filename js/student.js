import { state } from './navigation.js';
import { showView, showStudentMessage, hideStudentMessage, toast } from './ui.js';
import { fbGet, fbPut, fbPatch } from './firebase.js';
import { esc, todayParts, fechaLegible, generarIdParticipante, buscarPorCorreo, calcularDistancia, obtenerUbicacion, fmtFechaHoraCorta } from './utils.js';
import { enviarCorreo, plantillaConfirmacionRegistro, plantillaConfirmacionAsistencia } from './email.js';
import { GEO_CONFIG } from './config.js';

let datosCache = {
    proyecto: null,
    fase: null,
    roster: [],
    faseParticipantes: [],
    cargado: false
};

export async function loadRegistro(proyectoId, faseIndex) {
    const studentView = document.getElementById("view-student");
    if (!studentView) {
        window.location.href = `app.html?proyecto=${proyectoId}&fase=${faseIndex}`;
        return;
    }

    state.mode = "registro";
    showView("student");

    const pillEl = document.getElementById("student-event-pill");
    const loadingEl = document.getElementById("student-loading");
    const errorBlock = document.getElementById("student-error-block");
    const activeBlock = document.getElementById("student-active-block");

    if (!pillEl || !loadingEl || !errorBlock || !activeBlock) return;

    const verdict = document.getElementById("student-verdict");
    if (verdict) verdict.classList.add("hidden");
    activeBlock.classList.add("hidden");
    errorBlock.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    pillEl.textContent = "Cargando…";

    const retryBtn = document.getElementById("retry-evento-btn");
    if (retryBtn) retryBtn.classList.remove("hidden");

    try {
        const [proyecto, fase] = await Promise.all([
            fbGet(`proyectos/${proyectoId}`),
            fbGet(`proyectos/${proyectoId}/fases/${faseIndex}`)
        ]);

        if (!proyecto || typeof proyecto !== "object") {
            throw new Error("El proyecto no existe en la base de datos.");
        }

        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        const faseData = fases[Number(faseIndex)] || fase;
        if (!faseData) {
            throw new Error("La fase indicada no existe en este proyecto.");
        }

        datosCache.proyecto = proyecto;
        datosCache.fase = faseData;
        datosCache.roster = Array.isArray(proyecto.participantes) ? proyecto.participantes : [];
        datosCache.faseParticipantes = Array.isArray(faseData.participantes) ? faseData.participantes : [];
        datosCache.cargado = true;

        state.proyectoId = proyectoId;
        state.faseIndex = Number(faseIndex);
        state.proyectoData = proyecto;
        state.faseData = faseData;
        state.rosterProyecto = datosCache.roster;

        pillEl.textContent = `${proyecto.nombre || "Proyecto"} · ${faseData.titulo || "Fase"}`;
        history.replaceState(null, "", buildRegistroUrl(proyectoId, faseIndex));

        loadingEl.classList.add("hidden");
        activeBlock.classList.remove("hidden");
        showRegistroForm();
    } catch (err) {
        console.error("Error al cargar el registro:", err);
        pillEl.textContent = "No disponible";
        loadingEl.classList.add("hidden");
        errorBlock.classList.remove("hidden");
        const errorText = document.getElementById("student-error-text");
        if (errorText) {
            errorText.textContent = `No pudimos cargar este registro (${err.message}). Verifica que el enlace o código QR sean correctos.`;
        }
    }
}

export async function loadCheckin(proyectoId, faseIndex, fechaParam) {
    const studentView = document.getElementById("view-student");
    if (!studentView) {
        window.location.href = `app.html?proyecto=${proyectoId}&fase=${faseIndex}&modo=asistencia&fecha=${fechaParam}`;
        return;
    }

    state.mode = "asistencia";
    showView("student");

    const pillEl = document.getElementById("student-event-pill");
    const loadingEl = document.getElementById("student-loading");
    const errorBlock = document.getElementById("student-error-block");
    const activeBlock = document.getElementById("student-active-block");

    if (!pillEl || !loadingEl || !errorBlock || !activeBlock) return;

    const verdict = document.getElementById("student-verdict");
    if (verdict) verdict.classList.add("hidden");
    activeBlock.classList.add("hidden");
    errorBlock.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    pillEl.textContent = "Cargando…";

    const hoy = todayParts().fecha;
    if (fechaParam !== hoy) {
        loadingEl.classList.add("hidden");
        errorBlock.classList.remove("hidden");
        const retryBtn = document.getElementById("retry-evento-btn");
        if (retryBtn) retryBtn.classList.add("hidden");
        pillEl.textContent = "Código no disponible";
        const errorText = document.getElementById("student-error-text");
        if (errorText) {
            errorText.textContent = fechaParam
                ? `Este código de asistencia ya no es válido: era para el ${fechaLegible(fechaParam)}. Pide a tu profesor el código de hoy.`
                : "Este enlace de asistencia no es válido. Pide a tu profesor el código de hoy.";
        }
        return;
    }

    try {
        const [proyecto, fase] = await Promise.all([
            fbGet(`proyectos/${proyectoId}`),
            fbGet(`proyectos/${proyectoId}/fases/${faseIndex}`)
        ]);

        if (!proyecto || typeof proyecto !== "object") {
            throw new Error("El proyecto no existe en la base de datos.");
        }

        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        const faseData = fases[Number(faseIndex)] || fase;
        if (!faseData) {
            throw new Error("La fase indicada no existe en este proyecto.");
        }

        datosCache.proyecto = proyecto;
        datosCache.fase = faseData;
        datosCache.roster = Array.isArray(proyecto.participantes) ? proyecto.participantes : [];
        datosCache.faseParticipantes = Array.isArray(faseData.participantes) ? faseData.participantes : [];
        datosCache.cargado = true;

        state.proyectoId = proyectoId;
        state.faseIndex = Number(faseIndex);
        state.proyectoData = proyecto;
        state.faseData = faseData;
        state.rosterProyecto = datosCache.roster;

        pillEl.textContent = `${proyecto.nombre || "Proyecto"} · ${faseData.titulo || "Fase"} · Asistencia de hoy`;
        history.replaceState(null, "", buildAsistenciaUrl(proyectoId, faseIndex, hoy));

        const retryBtn = document.getElementById("retry-evento-btn");
        if (retryBtn) retryBtn.classList.remove("hidden");
        loadingEl.classList.add("hidden");
        activeBlock.classList.remove("hidden");
        showCheckinForm();

        setTimeout(() => {
            verificarUbicacionAutomatica();
        }, 500);
    } catch (err) {
        console.error("Error al cargar la asistencia:", err);
        pillEl.textContent = "No disponible";
        loadingEl.classList.add("hidden");
        errorBlock.classList.remove("hidden");
        const errorText = document.getElementById("student-error-text");
        if (errorText) {
            errorText.textContent = `No pudimos cargar esta asistencia (${err.message}). Verifica que el enlace o código QR sean correctos.`;
        }
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

function showRegistroForm() {
    const title = document.getElementById("student-active-title");
    const sub = document.getElementById("student-active-sub");
    const registroForm = document.getElementById("registro-form");
    const checkinForm = document.getElementById("checkin-form");

    if (title) title.textContent = "Registro de participantes";
    if (sub) sub.textContent = "Completa tus datos para registrarte en esta fase";
    if (registroForm) registroForm.classList.remove("hidden");
    if (checkinForm) checkinForm.classList.add("hidden");
    if (registroForm) registroForm.reset();
    hideStudentMessage();
}

function showCheckinForm() {
    const title = document.getElementById("student-active-title");
    const sub = document.getElementById("student-active-sub");
    const registroForm = document.getElementById("registro-form");
    const checkinForm = document.getElementById("checkin-form");

    if (title) title.textContent = "Marcar asistencia";
    if (sub) sub.textContent = "Ingresa el correo con el que te registraste. La ubicación se verificará automáticamente.";
    if (checkinForm) checkinForm.classList.remove("hidden");
    if (registroForm) registroForm.classList.add("hidden");
    if (checkinForm) checkinForm.reset();
    hideStudentMessage();

    const ubicacionVerificada = document.getElementById('ubicacion-verificada');
    const latitudUsuario = document.getElementById('latitud-usuario');
    const longitudUsuario = document.getElementById('longitud-usuario');
    const estadoEl = document.getElementById('estado-ubicacion');
    const submitBtn = document.getElementById('checkin-submit-btn');

    if (ubicacionVerificada) ubicacionVerificada.value = 'false';
    if (latitudUsuario) latitudUsuario.value = '';
    if (longitudUsuario) longitudUsuario.value = '';
    if (estadoEl) {
        estadoEl.innerHTML = 'Verificando ubicación automáticamente...';
        estadoEl.className = 'field-hint cargando';
    }
    if (submitBtn) submitBtn.disabled = true;
}

async function verificarUbicacionAutomatica() {
    const estadoEl = document.getElementById('estado-ubicacion');
    const btnSubmit = document.getElementById('checkin-submit-btn');
    const ubicacionVerificada = document.getElementById('ubicacion-verificada');

    if (!estadoEl || !btnSubmit || !ubicacionVerificada) return;

    estadoEl.textContent = 'Obteniendo tu ubicación...';
    estadoEl.className = 'field-hint cargando';

    try {
        const ubicacion = await obtenerUbicacion(GEO_CONFIG);
        const distancia = calcularDistancia(
            ubicacion.latitud,
            ubicacion.longitud,
            GEO_CONFIG.latitud,
            GEO_CONFIG.longitud
        );

        const latitudInput = document.getElementById('latitud-usuario');
        const longitudInput = document.getElementById('longitud-usuario');
        if (latitudInput) latitudInput.value = ubicacion.latitud;
        if (longitudInput) longitudInput.value = ubicacion.longitud;

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

export function setupStudentForms() {
    const registroForm = document.getElementById("registro-form");
    if (registroForm) {
        registroForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await handleRegistro();
        });
    }

    const checkinForm = document.getElementById("checkin-form");
    if (checkinForm) {
        checkinForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await handleCheckin();
        });
    }

    const retryBtn = document.getElementById("retry-evento-btn");
    if (retryBtn) {
        retryBtn.addEventListener("click", () => {
            if (state.proyectoId === null || state.faseIndex === null) return;
            datosCache.cargado = false;
            if (state.mode === "asistencia") {
                loadCheckin(state.proyectoId, state.faseIndex, todayParts().fecha);
            } else {
                loadRegistro(state.proyectoId, state.faseIndex);
            }
        });
    }
}

function showVerdict() {
    const activeBlock = document.getElementById("student-active-block");
    const panel = document.getElementById("student-panel");
    const verdict = document.getElementById("student-verdict");

    if (activeBlock) activeBlock.classList.add("hidden");
    if (panel) panel.classList.add("hidden");
    if (verdict) verdict.classList.remove("hidden");
}

function showVerdictRegistro(nombre, entry) {
    showVerdict();
    const proyecto = state.proyectoData?.nombre || `Proyecto #${state.proyectoId}`;
    const fase = state.faseData?.titulo || `Fase #${state.faseIndex}`;

    const title = document.getElementById("verdict-title");
    const nombreEl = document.getElementById("verdict-nombre");
    const eventoEl = document.getElementById("verdict-evento");
    const fechaEl = document.getElementById("verdict-fecha");
    const horaEl = document.getElementById("verdict-hora");
    const resumenContainer = document.getElementById("verdict-resumen");

    if (title) title.textContent = "Registro exitoso";
    if (nombreEl) nombreEl.textContent = `¡Listo, ${nombre}! Quedaste registrado.`;
    if (eventoEl) eventoEl.textContent = `${proyecto} · ${fase}`;
    if (fechaEl) fechaEl.textContent = entry.fecha;
    if (horaEl) horaEl.textContent = entry.hora;
    if (resumenContainer) {
        resumenContainer.innerHTML = "";
        resumenContainer.style.display = "none";
    }

    toast("Registro completado");
}

function showVerdictAsistencia(nombre, entry, resumen) {
    showVerdict();
    const proyecto = state.proyectoData?.nombre || `Proyecto #${state.proyectoId}`;
    const fase = state.faseData?.titulo || `Fase #${state.faseIndex}`;

    const title = document.getElementById("verdict-title");
    const nombreEl = document.getElementById("verdict-nombre");
    const eventoEl = document.getElementById("verdict-evento");
    const fechaEl = document.getElementById("verdict-fecha");
    const horaEl = document.getElementById("verdict-hora");
    const resumenContainer = document.getElementById("verdict-resumen");

    if (title) title.textContent = "Asistencia registrada";
    if (nombreEl) nombreEl.textContent = `Bienvenido/a, ${nombre}.`;
    if (eventoEl) eventoEl.textContent = `${proyecto} · ${fase}`;
    if (fechaEl) fechaEl.textContent = entry.fecha;
    if (horaEl) horaEl.textContent = entry.hora;

    if (resumenContainer && resumen) {
        resumenContainer.style.display = "block";
        resumenContainer.innerHTML = generarHTMLResumen(resumen);
    }

    toast("Asistencia registrada correctamente");
}

function generarHTMLResumen(resumen) {
    const { asistencias, faltas, totalSesiones, detalles } = resumen;

    let detallesHTML = '';
    if (detalles && detalles.length > 0) {
        detallesHTML = detalles.map(d => {
            const icono = d.asistio ? '✔' : '✖';
            const clase = d.asistio ? 'asistio' : 'falta';
            const fecha = d.fecha || '—';
            const hora = d.hora || '—';
            return `<li class="${clase}">${icono} ${fecha} ${d.asistio ? `- ${hora}` : '- No asistió'}</li>`;
        }).join('');
    } else {
        detallesHTML = '<li class="empty-msg">No hay sesiones registradas</li>';
    }

    return `
        <div class="verdict-resumen">
            <div class="verdict-resumen-header">
                <h4><i class="fas fa-chart-bar"></i> Resumen de tu asistencia</h4>
            </div>
            <div class="verdict-resumen-stats">
                <div class="resumen-stat">
                    <span class="resumen-stat-value">${totalSesiones}</span>
                    <span class="resumen-stat-label">Sesiones</span>
                </div>
                <div class="resumen-stat resumen-stat-asistio">
                    <span class="resumen-stat-value">${asistencias}</span>
                    <span class="resumen-stat-label">Asististe</span>
                </div>
                <div class="resumen-stat resumen-stat-falta">
                    <span class="resumen-stat-value">${faltas}</span>
                    <span class="resumen-stat-label">Faltaste</span>
                </div>
            </div>
            <div class="verdict-resumen-detalles">
                <h5>Detalle por sesión</h5>
                <ul class="verdict-detalles-list">${detallesHTML}</ul>
            </div>
        </div>
    `;
}

async function handleRegistro() {
    const nombre1 = document.getElementById("full-nombre1-input");
    const nombre2 = document.getElementById("full-nombre2-input");
    const apellido1 = document.getElementById("full-apellido1-input");
    const apellido2 = document.getElementById("full-apellido2-input");
    const correoInput = document.getElementById("full-correo-input");
    const telefonoInput = document.getElementById("full-telefono-input");
    const submitBtn = document.getElementById("registro-submit-btn");

    if (!nombre1 || !apellido1 || !correoInput || !telefonoInput || !submitBtn) return;

    const nombre1Val = nombre1.value.trim();
    const nombre2Val = nombre2 ? nombre2.value.trim() : "";
    const apellido1Val = apellido1.value.trim();
    const apellido2Val = apellido2 ? apellido2.value.trim() : "";
    const correo = correoInput.value.trim();
    const telefono = telefonoInput.value.trim();

    if (!nombre1Val || !apellido1Val || !correo || !telefono) {
        showStudentMessage("error", "Nombre, apellido, correo y teléfono son obligatorios. Verifica que no falte ningún dato.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando…";
    hideStudentMessage();

    try {
        const nombreCompleto = [apellido1Val, apellido2Val, nombre1Val, nombre2Val].filter(Boolean).join(" ").trim();

        let roster = datosCache.roster;
        let faseList = datosCache.faseParticipantes;

        let participante = buscarPorCorreo(roster, correo);
        let esNuevo = false;

        if (!participante) {
            esNuevo = true;
            participante = {
                id: generarIdParticipante(),
                nombre: nombreCompleto,
                email: correo,
                telefono: telefono,
                imagenPerfil: "",
                fechaRegistro: todayParts().timestamp,
            };
        } else {
            const yaAsignado = faseList.some((fp) => fp && fp.id === participante.id);
            if (yaAsignado) {
                showStudentMessage("warn", `El correo "${correo}" ya está registrado en esta fase. No es necesario registrarse nuevamente.`);
                submitBtn.disabled = false;
                submitBtn.textContent = "Registrarme";
                return;
            }

            const actualizado = { ...participante, nombre: nombreCompleto, telefono: telefono };
            const idxExistente = roster.findIndex((r) => r && r.id === participante.id);
            if (idxExistente !== -1) {
                await fbPut(`proyectos/${state.proyectoId}/participantes/${idxExistente}`, actualizado);
                roster[idxExistente] = actualizado;
                participante = actualizado;
                datosCache.roster = roster;
            }
        }

        if (esNuevo) {
            const idx = roster.length;
            await fbPut(`proyectos/${state.proyectoId}/participantes/${idx}`, participante);
            roster.push(participante);
            datosCache.roster = roster;
        }

        const yaAsignado = faseList.some((fp) => fp && fp.id === participante.id);
        if (!yaAsignado) {
            const entry = todayParts();
            const asignacion = {
                id: participante.id,
                fechaAsignacion: entry.timestamp,
                puntaje: 0
            };
            const idx2 = faseList.length;
            await fbPut(`proyectos/${state.proyectoId}/fases/${state.faseIndex}/participantes/${idx2}`, asignacion);
            faseList.push(asignacion);
            datosCache.faseParticipantes = faseList;

            state.rosterProyecto = roster;
            state.currentRosterProyecto = roster;

            // Actualizar el cache de administración para que muestre los nuevos participantes
            if (typeof window.actualizarCacheAdminDesdeEstudiante === 'function') {
                try {
                    await window.actualizarCacheAdminDesdeEstudiante(state.proyectoId, state.faseIndex);
                    console.log("Cache de administración actualizado desde estudiante");
                } catch (e) {
                    console.warn("No se pudo actualizar cache de admin:", e);
                }
            }

            enviarConfirmacionRegistro(correo, participante.nombre || nombreCompleto);
            showVerdictRegistro(participante.nombre || nombreCompleto, entry);
        } else {
            showStudentMessage("warn", `El correo "${correo}" ya está registrado en esta fase. No es necesario registrarse nuevamente.`);
        }
    } catch (err) {
        console.error("Error en registro:", err);
        showStudentMessage("error", `No se pudo completar el registro: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Registrarme";
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
    const ubicacionVerificada = document.getElementById('ubicacion-verificada');
    const correoInput = document.getElementById("checkin-correo-input");
    const submitBtn = document.getElementById("checkin-submit-btn");

    if (!ubicacionVerificada || !correoInput || !submitBtn) return;

    if (ubicacionVerificada.value !== 'true') {
        showStudentMessage("error", "Debes estar dentro del rango permitido para marcar asistencia. Verifica tu ubicación.");
        return;
    }

    const correo = correoInput.value.trim();
    if (!correo) {
        showStudentMessage("error", "Ingresa tu correo electrónico.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando…";
    hideStudentMessage();

    try {
        const roster = datosCache.roster;
        const participante = buscarPorCorreo(roster, correo);

        if (!participante) {
            showStudentMessage("error", "No estás registrado en este proyecto. Pide a tu profesor el enlace de registro.");
            submitBtn.disabled = false;
            submitBtn.textContent = "Marcar asistencia";
            return;
        }

        let faseList = datosCache.faseParticipantes;
        const idxEnFase = faseList.findIndex((fp) => fp && fp.id === participante.id);

        if (idxEnFase === -1) {
            showStudentMessage("error", "No estás inscrito en esta fase.");
            submitBtn.disabled = false;
            submitBtn.textContent = "Marcar asistencia";
            return;
        }

        const fpEntry = faseList[idxEnFase];
        const asistencias = Array.isArray(fpEntry.asistencias) ? [...fpEntry.asistencias] : [];
        const entry = todayParts();
        const registroDeHoy = asistencias.find((a) => a.fecha === entry.fecha);

        if (registroDeHoy) {
            showStudentMessage(
                "warn",
                `Ya marcaste tu asistencia hoy a las ${registroDeHoy.hora || "—"}. No es necesario volver a hacerlo.`
            );
            submitBtn.disabled = false;
            submitBtn.textContent = "Marcar asistencia";
            return;
        }

        const latitudInput = document.getElementById('latitud-usuario');
        const longitudInput = document.getElementById('longitud-usuario');
        const latitud = latitudInput ? latitudInput.value : "0";
        const longitud = longitudInput ? longitudInput.value : "0";
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
        await fbPatch(`proyectos/${state.proyectoId}/fases/${state.faseIndex}/participantes/${idxEnFase}`, { asistencias });

        faseList[idxEnFase].asistencias = asistencias;
        datosCache.faseParticipantes = faseList;

        // Actualizar cache de administración después de marcar asistencia
        if (typeof window.actualizarCacheAdminDesdeEstudiante === 'function') {
            try {
                await window.actualizarCacheAdminDesdeEstudiante(state.proyectoId, state.faseIndex);
                console.log("Cache de administración actualizado después de asistencia");
            } catch (e) {
                console.warn("No se pudo actualizar cache de admin:", e);
            }
        }

        const todasLasFechas = new Set();
        faseList.forEach(fp => {
            if (fp && Array.isArray(fp.asistencias)) {
                fp.asistencias.forEach(a => {
                    if (a && a.fecha) todasLasFechas.add(a.fecha);
                });
            }
        });
        const fechasOrdenadas = Array.from(todasLasFechas).sort();

        const fechasAsistencia = new Set(asistencias.map(a => a.fecha));
        const resumen = {
            totalSesiones: fechasOrdenadas.length,
            asistencias: fechasAsistencia.size,
            faltas: fechasOrdenadas.length - fechasAsistencia.size,
            detalles: fechasOrdenadas.map(fecha => {
                const asistio = fechasAsistencia.has(fecha);
                const asistenciaData = asistencias.find(a => a.fecha === fecha);
                return {
                    fecha: fecha,
                    hora: asistio && asistenciaData ? asistenciaData.hora : '—',
                    asistio: asistio
                };
            })
        };

        enviarConfirmacionAsistencia(correo, participante.nombre, entry);
        showVerdictAsistencia(participante.nombre, entry, resumen);
    } catch (err) {
        console.error("Error en handleCheckin:", err);
        showStudentMessage("error", `No se pudo marcar la asistencia: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Marcar asistencia";
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