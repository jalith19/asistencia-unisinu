import { FIREBASE_BASE } from './config.js';

export async function fbGet(path) {
    const res = await fetch(`${FIREBASE_BASE}/${path}.json`);
    if (!res.ok) throw new Error(`Error al leer ${path} (${res.status})`);
    return res.json();
}

export async function fbPatch(path, data) {
    const res = await fetch(`${FIREBASE_BASE}/${path}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Error al actualizar ${path} (${res.status})`);
    return res.json();
}

export async function fbPut(path, data) {
    const res = await fetch(`${FIREBASE_BASE}/${path}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Error al guardar ${path} (${res.status})`);
    return res.json();
}