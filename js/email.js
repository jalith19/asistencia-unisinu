import { MAIL_ENDPOINT, MAIL_TOKEN } from './config.js';

export async function enviarCorreo(to, subject, html) {
    if (!to) return false;
    try {
        await fetch(MAIL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, subject, body: html, token: MAIL_TOKEN }),
        });
        return true;
    } catch (e) {
        console.error("Error enviando correo:", e);
        return false;
    }
}

export function plantillaBase({ titulo, etiqueta, cuerpoHtml }) {
    return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;">
    <div style="background:#171717;padding:24px 20px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">${titulo}</h1>
    </div>
    <div style="background:#c8102e;padding:14px 20px;text-align:center;">
      <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:1px;">${etiqueta}</span>
    </div>
    <div style="padding:30px 24px;font-size:14px;color:#374151;line-height:1.6;">
      ${cuerpoHtml}
    </div>
    <div style="background:#171717;padding:20px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Este correo es una notificación automática, por favor no respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>`;
}

export function plantillaConfirmacionRegistro({ nombre, proyecto, fase }) {
    const cuerpoHtml = `
      <p>Hola ${nombre},</p>
      <p>Tu registro quedó confirmado correctamente.</p>
      <div style="background:#fafafa;border:1px solid #e4e4e4;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px 0;"><b>Proyecto:</b> ${proyecto}</p>
        <p style="margin:0;"><b>Fase:</b> ${fase}</p>
      </div>
      <p>Cuando tu profesor proyecte el código QR de asistencia, escanéalo e ingresa este mismo correo para marcar tu asistencia.</p>
    `;
    return plantillaBase({ titulo: "Registro confirmado", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}

export function plantillaConfirmacionAsistencia({ nombre, proyecto, fase, fechaTexto, hora }) {
    const cuerpoHtml = `
      <p>Hola ${nombre},</p>
      <p>Confirmamos que tu asistencia quedó registrada correctamente.</p>
      <div style="background:#fafafa;border:1px solid #e4e4e4;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px 0;"><b>Proyecto:</b> ${proyecto}</p>
        <p style="margin:0 0 8px 0;"><b>Fase:</b> ${fase}</p>
        <p style="margin:0 0 8px 0;"><b>Fecha:</b> ${fechaTexto}</p>
        <p style="margin:0;"><b>Hora:</b> ${hora}</p>
      </div>
      <p>Gracias por participar.</p>
    `;
    return plantillaBase({ titulo: "Asistencia confirmada", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}