// Configuración de Firebase
export const FIREBASE_BASE = "https://asistencia-b2e96-default-rtdb.firebaseio.com";

// Configuración de correo
export const MAIL_ENDPOINT = "https://backendserver.aplicaciones-web.online/servicio-correo-app/correo/enviar";
export const MAIL_TOKEN = "IngenieriaIsys";

// Configuración de geolocalización
/*export const GEO_CONFIG = {
    latitud: 10.390683,
    longitud: -75.496829,
    radioMetros: 300,
    timeout: 15000,
};*/

//mi casa
export const GEO_CONFIG = {
    latitud: 10.374465,
    longitud: -75.484725,
    radioMetros: 300,
    timeout: 15000,
};

// Configuración de puntaje
export const PUNTAJE_MAX = 5;

// Roles - AHORA SOLO ADMIN Y COLABORADOR (DOCENTE YA NO EXISTE)
export const ROLES = {
    ADMIN: "admin",
    COLABORADOR: "colaborador"
};

// Días y meses
export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export async function loadConfig() {
    return true;
}