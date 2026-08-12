// js/evaluaciones.js
import { fbGet, fbPost, fbPatch, fbDelete } from './firebase.js';
import { toast } from './ui.js';
import { state } from './navigation.js';
import { esc } from './utils.js';

// Función para crear una nueva evaluación
export async function crearEvaluacion(datosEvaluacion) {
    try {
        const { nombreEvaluacion, descripcion, dimensiones, usuarioId, proyectoId, faseId, periodo, observacion } = datosEvaluacion;

        const evaluacionId = Date.now();
        const nuevaEvaluacion = {
            evaluacionId: evaluacionId,
            nombreEvaluacion: nombreEvaluacion || "Evaluación sin nombre",
            descripcion: descripcion || "",
            dimensiones: dimensiones || [
                { dimensionId: 0, nombreDimension: "Dimensión 1", descripcion: "" }
            ],
            estado: "Activa",
            fechaCreacion: new Date().toISOString().slice(0, 16).replace('T', ' '),
            usuarioId: usuarioId || state.userId || "admin",
            proyectoId: proyectoId || state.currentProjectId,
            faseId: faseId !== undefined ? faseId : state.currentFaseIndex,
            periodo: periodo || "",
            observacion: observacion || ""
        };

        // Guardar en Firebase
        const result = await fbPost("evaluaciones", nuevaEvaluacion);

        if (result.name) {
            await asignarEvaluacionAParticipantes(evaluacionId, proyectoId, faseId);
            toast("Evaluación creada y asignada a los participantes correctamente");
            return { success: true, id: result.name, evaluacion: nuevaEvaluacion, evaluacionId: evaluacionId };
        }

        return { success: false, error: "No se pudo crear la evaluación" };
    } catch (err) {
        console.error("Error al crear evaluación:", err);
        toast(`Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// Función para asignar una evaluación a todos los participantes de una fase
export async function asignarEvaluacionAParticipantes(evaluacionId, proyectoId, faseIndex) {
    try {
        const proyecto = await fbGet(`proyectos/${proyectoId}`);
        if (!proyecto) {
            throw new Error("Proyecto no encontrado");
        }

        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        if (faseIndex === undefined || faseIndex === null || !fases[faseIndex]) {
            throw new Error("Fase no encontrada");
        }

        const fase = fases[faseIndex];
        const participantes = Array.isArray(fase.participantes) ? fase.participantes : [];

        const todasEvaluaciones = await fbGet("evaluaciones");
        if (!todasEvaluaciones) {
            throw new Error("No se encontraron evaluaciones");
        }

        let evaluacionEncontrada = null;
        for (const [key, evalData] of Object.entries(todasEvaluaciones)) {
            if (evalData.evaluacionId === evaluacionId) {
                evaluacionEncontrada = evalData;
                break;
            }
        }

        if (!evaluacionEncontrada) {
            throw new Error(`Evaluación con ID ${evaluacionId} no encontrada`);
        }

        const dimensiones = Array.isArray(evaluacionEncontrada.dimensiones) ? evaluacionEncontrada.dimensiones : [];
        const fechaAsignacion = new Date().toISOString().slice(0, 16).replace('T', ' ');

        const calificacionesIniciales = dimensiones.map(dim => ({
            dimensionId: dim.dimensionId,
            puntaje: 0
        }));

        let participantesActualizados = [];
        let huboCambios = false;

        for (let i = 0; i < participantes.length; i++) {
            const participante = participantes[i];
            if (!participante) continue;

            const evaluacionesExistentes = Array.isArray(participante.evaluaciones) ? participante.evaluaciones : [];
            const yaTieneEvaluacion = evaluacionesExistentes.some(e => e.evaluacionId === evaluacionId);

            if (!yaTieneEvaluacion) {
                const nuevaEvaluacionParticipante = {
                    evaluacionId: evaluacionId,
                    fechaAsignacion: fechaAsignacion,
                    calificaciones: JSON.parse(JSON.stringify(calificacionesIniciales)),
                    periodo: evaluacionEncontrada.periodo || "",
                    observacion: ""
                };

                const evaluacionesActualizadas = [...evaluacionesExistentes, nuevaEvaluacionParticipante];
                participantes[i] = {
                    ...participante,
                    evaluaciones: evaluacionesActualizadas
                };
                huboCambios = true;
            }
        }

        if (huboCambios) {
            await fbPatch(`proyectos/${proyectoId}/fases/${faseIndex}`, {
                participantes: participantes
            });

            if (state.currentFaseIndex === faseIndex) {
                state.currentFaseData = {
                    ...state.currentFaseData,
                    participantes: participantes
                };
            }
        }

        return { success: true, participantes: participantes };
    } catch (err) {
        console.error("Error al asignar evaluación a participantes:", err);
        throw err;
    }
}

// Función para obtener evaluaciones de un proyecto o fase
export async function obtenerEvaluaciones(proyectoId, faseId) {
    try {
        const evaluaciones = await fbGet("evaluaciones");
        if (!evaluaciones) return [];

        const evaluacionesList = Object.entries(evaluaciones).map(([key, evalData]) => ({
            firebaseKey: key,
            ...evalData
        }));

        return evaluacionesList.filter(e =>
            e.proyectoId === proyectoId &&
            (faseId === undefined || e.faseId === faseId)
        );
    } catch (err) {
        console.error("Error al obtener evaluaciones:", err);
        return [];
    }
}

// Función para eliminar una evaluación
export async function eliminarEvaluacion(firebaseKey, evaluacionId) {
    try {
        // Eliminar la evaluación de Firebase
        await fbDelete(`evaluaciones/${firebaseKey}`);

        // También eliminar la evaluación de todos los participantes
        const proyectoId = state.currentProjectId;
        const faseIndex = state.currentFaseIndex;

        if (proyectoId && faseIndex !== null) {
            const proyecto = await fbGet(`proyectos/${proyectoId}`);
            if (proyecto) {
                const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
                if (fases[faseIndex]) {
                    const participantes = Array.isArray(fases[faseIndex].participantes) ? fases[faseIndex].participantes : [];
                    let huboCambios = false;

                    for (let i = 0; i < participantes.length; i++) {
                        if (participantes[i] && Array.isArray(participantes[i].evaluaciones)) {
                            const evaluacionesFiltradas = participantes[i].evaluaciones.filter(
                                e => e.evaluacionId !== evaluacionId
                            );
                            if (evaluacionesFiltradas.length !== participantes[i].evaluaciones.length) {
                                participantes[i].evaluaciones = evaluacionesFiltradas;
                                huboCambios = true;
                            }
                        }
                    }

                    if (huboCambios) {
                        await fbPatch(`proyectos/${proyectoId}/fases/${faseIndex}`, {
                            participantes: participantes
                        });
                    }
                }
            }
        }

        toast("Evaluación eliminada correctamente");
        return { success: true };
    } catch (err) {
        console.error("Error al eliminar evaluación:", err);
        toast(`Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// Función para actualizar calificaciones de un participante
export async function actualizarCalificacionParticipante(proyectoId, faseIndex, participanteIdx, evaluacionId, dimensionId, puntaje) {
    try {
        console.log(`🔍 actualizarCalificacionParticipante: participanteIdx=${participanteIdx}, evaluacionId=${evaluacionId}, dimensionId=${dimensionId}, puntaje=${puntaje}`);

        // Obtener el proyecto
        const proyecto = await fbGet(`proyectos/${proyectoId}`);
        if (!proyecto) {
            throw new Error("Proyecto no encontrado");
        }

        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        if (faseIndex === undefined || faseIndex === null || !fases[faseIndex]) {
            throw new Error("Fase no encontrada");
        }

        const fase = fases[faseIndex];
        const participantes = Array.isArray(fase.participantes) ? fase.participantes : [];

        console.log(`📊 Participantes en fase: ${participantes.length}`);

        if (participanteIdx === undefined || participanteIdx === null || participanteIdx < 0 || participanteIdx >= participantes.length) {
            console.error("Índice de participante inválido:", participanteIdx, "Total participantes:", participantes.length);
            throw new Error(`Participante no encontrado (índice: ${participanteIdx})`);
        }

        if (!participantes[participanteIdx]) {
            throw new Error(`Participante en índice ${participanteIdx} es null o undefined`);
        }

        const participante = participantes[participanteIdx];
        console.log(`👤 Participante: ${participante.nombre || 'sin nombre'}`);

        const evaluaciones = Array.isArray(participante.evaluaciones) ? participante.evaluaciones : [];
        console.log(`📋 Evaluaciones del participante: ${evaluaciones.length}`);

        const evalIndex = evaluaciones.findIndex(e => e.evaluacionId === evaluacionId);
        if (evalIndex === -1) {
            throw new Error(`Evaluación ${evaluacionId} no encontrada para este participante`);
        }

        if (!evaluaciones[evalIndex].calificaciones) {
            evaluaciones[evalIndex].calificaciones = [];
        }

        const calificaciones = evaluaciones[evalIndex].calificaciones;
        const dimIndex = calificaciones.findIndex(c => c.dimensionId === dimensionId);

        if (dimIndex !== -1) {
            calificaciones[dimIndex].puntaje = puntaje;
            console.log(`✏️ Actualizando calificación existente: dimensión ${dimensionId} = ${puntaje}`);
        } else {
            calificaciones.push({ dimensionId, puntaje });
            console.log(`➕ Creando nueva calificación: dimensión ${dimensionId} = ${puntaje}`);
        }

        evaluaciones[evalIndex].calificaciones = calificaciones;
        participantes[participanteIdx].evaluaciones = evaluaciones;

        console.log(`💾 Calificaciones finales:`, JSON.stringify(calificaciones));

        await fbPatch(`proyectos/${proyectoId}/fases/${faseIndex}`, {
            participantes: participantes
        });

        console.log(`✅ Calificación guardada correctamente en Firebase`);

        if (state.currentFaseIndex === faseIndex) {
            state.currentFaseData = {
                ...state.currentFaseData,
                participantes: participantes
            };
        }

        return { success: true };
    } catch (err) {
        console.error("❌ Error al actualizar calificación:", err);
        return { success: false, error: err.message };
    }
}


// ============================================================
// Función ATÓMICA: actualiza TODAS las calificaciones (dimensiones)
// + periodo + observación de un participante en UNA sola operación
// GET -> modificar -> PATCH.
//
// IMPORTANTE: esta función existe porque llamar en paralelo
// (Promise.all) a actualizarCalificacionParticipante (una vez por
// dimensión) + actualizarPeriodoObservacion genera una condición de
// carrera: cada llamada hace su propio GET del array "participantes"
// completo de la fase y luego lo sobrescribe entero con PATCH. Como
// corren al mismo tiempo, cada una parte de una copia desactualizada
// y la última en terminar pisa los cambios de las demás (por eso el
// puntaje volvía a 0 mientras el periodo/observación sí quedaban
// guardados: la llamada de periodo/observación era la que terminaba
// de última y no traía el puntaje nuevo en su copia).
// ============================================================
export async function actualizarEvaluacionParticipante(proyectoId, faseIndex, participanteIdx, evaluacionId, calificacionesNuevas, periodo, observacion) {
    try {
        const proyecto = await fbGet(`proyectos/${proyectoId}`);
        if (!proyecto) {
            throw new Error("Proyecto no encontrado");
        }

        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        if (faseIndex === undefined || faseIndex === null || !fases[faseIndex]) {
            throw new Error("Fase no encontrada");
        }

        const fase = fases[faseIndex];
        const participantes = Array.isArray(fase.participantes) ? fase.participantes : [];

        if (participanteIdx === undefined || participanteIdx === null || participanteIdx < 0 || participanteIdx >= participantes.length) {
            console.error("Índice de participante inválido:", participanteIdx, "Total participantes:", participantes.length);
            throw new Error(`Participante no encontrado (índice: ${participanteIdx})`);
        }

        if (!participantes[participanteIdx]) {
            throw new Error(`Participante en índice ${participanteIdx} es null o undefined`);
        }

        const participante = participantes[participanteIdx];
        const evaluaciones = Array.isArray(participante.evaluaciones) ? participante.evaluaciones : [];

        const evalIndex = evaluaciones.findIndex(e => e.evaluacionId === evaluacionId);
        if (evalIndex === -1) {
            throw new Error(`Evaluación ${evaluacionId} no encontrada para este participante`);
        }

        if (!evaluaciones[evalIndex].calificaciones) {
            evaluaciones[evalIndex].calificaciones = [];
        }
        const calificaciones = evaluaciones[evalIndex].calificaciones;

        // Aplicar TODAS las calificaciones nuevas sobre la MISMA copia local
        for (const [dimensionId, puntaje] of Object.entries(calificacionesNuevas || {})) {
            const dimIdNum = Number(dimensionId);
            const dimIndex = calificaciones.findIndex(c => c.dimensionId === dimIdNum);
            if (dimIndex !== -1) {
                calificaciones[dimIndex].puntaje = puntaje;
            } else {
                calificaciones.push({ dimensionId: dimIdNum, puntaje });
            }
        }

        evaluaciones[evalIndex].calificaciones = calificaciones;
        evaluaciones[evalIndex].periodo = periodo || "";
        evaluaciones[evalIndex].observacion = observacion || "";
        participantes[participanteIdx].evaluaciones = evaluaciones;

        // UN SOLO PATCH con todos los cambios juntos
        await fbPatch(`proyectos/${proyectoId}/fases/${faseIndex}`, {
            participantes: participantes
        });

        if (state.currentFaseIndex === faseIndex) {
            state.currentFaseData = {
                ...state.currentFaseData,
                participantes: participantes
            };
        }

        toast("Calificación guardada correctamente");
        return { success: true };
    } catch (err) {
        console.error("Error al actualizar evaluación del participante:", err);
        toast(`Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// Función para actualizar periodo y observación de la evaluación de un participante
export async function actualizarPeriodoObservacion(proyectoId, faseIndex, participanteIdx, evaluacionId, periodo, observacion) {
    try {
        const proyecto = await fbGet(`proyectos/${proyectoId}`);
        if (!proyecto) {
            throw new Error("Proyecto no encontrado");
        }

        const fases = Array.isArray(proyecto.fases) ? proyecto.fases : [];
        if (faseIndex === undefined || faseIndex === null || !fases[faseIndex]) {
            throw new Error("Fase no encontrada");
        }

        const fase = fases[faseIndex];
        const participantes = Array.isArray(fase.participantes) ? fase.participantes : [];

        if (participanteIdx === undefined || participanteIdx === null || participanteIdx < 0 || participanteIdx >= participantes.length) {
            console.error("Índice de participante inválido:", participanteIdx, "Total participantes:", participantes.length);
            throw new Error(`Participante no encontrado (índice: ${participanteIdx})`);
        }

        if (!participantes[participanteIdx]) {
            throw new Error(`Participante en índice ${participanteIdx} es null o undefined`);
        }

        const participante = participantes[participanteIdx];
        const evaluaciones = Array.isArray(participante.evaluaciones) ? participante.evaluaciones : [];

        const evalIndex = evaluaciones.findIndex(e => e.evaluacionId === evaluacionId);
        if (evalIndex === -1) {
            throw new Error(`Evaluación ${evaluacionId} no encontrada para este participante`);
        }

        evaluaciones[evalIndex].periodo = periodo || "";
        evaluaciones[evalIndex].observacion = observacion || "";
        participantes[participanteIdx].evaluaciones = evaluaciones;

        await fbPatch(`proyectos/${proyectoId}/fases/${faseIndex}`, {
            participantes: participantes
        });

        if (state.currentFaseIndex === faseIndex) {
            state.currentFaseData = {
                ...state.currentFaseData,
                participantes: participantes
            };
        }

        toast("Periodo y observación actualizados correctamente");
        return { success: true };
    } catch (err) {
        console.error("Error al actualizar periodo y observación:", err);
        toast(`Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}