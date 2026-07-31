import { DIAS, MESES } from './config.js';

export function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

export function todayParts() {
    const now = new Date();
    return {
        fecha: now.toISOString().slice(0, 10),
        dia: DIAS[now.getDay()],
        hora: now.toTimeString().slice(0, 8),
        timestamp: now.toISOString().slice(0, 19).replace("T", " "),
    };
}

export function fechaLegible(fechaISO, diaSemana) {
    if (!fechaISO) return "";
    const [y, m, d] = fechaISO.split("-").map(Number);
    const dia = diaSemana || DIAS[new Date(y, m - 1, d).getDay()];
    return `${dia} ${d} de ${MESES[m - 1]} de ${y}`;
}

export function fmtFechaHora(str) {
    if (!str) return "—";
    let cleaned = str.replace(/Z$/, "").replace("T", " ");
    if (cleaned.includes(".")) {
        cleaned = cleaned.split(".")[0];
    }
    return cleaned;
}

export function fmtFechaHoraCorta(str) {
    if (!str) return "—";
    let cleaned = str.replace(/Z$/, "").replace("T", " ");
    if (cleaned.includes(".")) {
        cleaned = cleaned.split(".")[0];
    }
    if (cleaned.includes(" ") && cleaned.split(" ")[1] === "00:00:00") {
        return cleaned.split(" ")[0];
    }
    return cleaned;
}

export function generarIdParticipante() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buscarPorCorreo(lista, correo) {
    const target = String(correo).trim().toLowerCase();
    if (!target) return null;
    const arr = Array.isArray(lista) ? lista : [];
    return arr.find((p) => p && String(p.email || "").trim().toLowerCase() === target) || null;
}

export function mondayOfCurrentWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
}

export function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

export function obtenerUbicacion(geoConfig) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Tu navegador no soporta geolocalización.'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitud: position.coords.latitude,
                    longitud: position.coords.longitude,
                    precision: position.coords.accuracy,
                });
            },
            (error) => {
                let mensaje = 'No se pudo obtener tu ubicación. ';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensaje += 'Por favor, permite el acceso a tu ubicación.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensaje += 'La información de ubicación no está disponible.';
                        break;
                    case error.TIMEOUT:
                        mensaje += 'El tiempo de espera para obtener la ubicación expiró.';
                        break;
                    default:
                        mensaje += 'Intenta nuevamente.';
                }
                reject(new Error(mensaje));
            },
            {
                enableHighAccuracy: true,
                timeout: geoConfig.timeout,
                maximumAge: 60000,
            }
        );
    });
}