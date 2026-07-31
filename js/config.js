export const FIREBASE_BASE = "https://maraton-programacion-eff1a-default-rtdb.firebaseio.com";

export const MAIL_ENDPOINT = "https://backendserver.aplicaciones-web.online/servicio-correo-app/correo/enviar";
export const MAIL_TOKEN = "IngenieriaIsys";

//Unisinu
export const GEO_CONFIG = {
    latitud: 10.390683,
    longitud: -75.496829,
    radioMetros: 300,
    timeout: 15000,
};

//mi casa
/*export const GEO_CONFIG = {
    latitud: 10.374286,
    longitud: -75.484696,
    radioMetros: 300,
    timeout: 15000,
};*/

export const PUNTAJE_MAX = 5;

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export let adminPassword = "";

export async function loadConfig() {
    try {
        const response = await fetch('./assets/data/config.json');
        const config = await response.json();
        adminPassword = config.CREDENCIAL_ADMIN || "";
        return adminPassword;
    } catch (error) {
        console.error('Error al leer config.json:', error);
        adminPassword = "";
        return adminPassword;
    }
}