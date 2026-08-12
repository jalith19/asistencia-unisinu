import { MAIL_ENDPOINT, MAIL_TOKEN } from './config.js';

// Función para obtener la URL base dinámica
function getBaseUrl() {
  const url = window.location.origin;
  return url;
}

export async function enviarCorreo(to, subject, html) {
  if (!to) {
    console.warn("Intento de enviar correo sin destinatario");
    return false;
  }

  console.log("Enviando correo a:", to);
  console.log("Asunto:", subject);

  try {
    const response = await fetch(MAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        to,
        subject,
        body: html,
        token: MAIL_TOKEN
      }),
    });

    console.log("Respuesta del servidor de correo:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error del servidor:", errorText);
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("Correo enviado exitosamente:", data);
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
<style>
    body { margin:0; padding:0; background-color:#f4f4f4; font-family:Arial,sans-serif; }
    .container { max-width:620px; margin:0 auto; background:#ffffff; }
    .header { background:#171717; padding:24px 20px; text-align:center; }
    .header h1 { margin:0; color:#ffffff; font-size:22px; font-weight:600; }
    .subheader { background:#1a365d; padding:14px 20px; text-align:center; }
    .subheader span { color:#fff; font-size:14px; font-weight:600; letter-spacing:1px; }
    .body { padding:30px 24px; font-size:14px; color:#374151; line-height:1.6; }
    .footer { background:#171717; padding:20px; text-align:center; }
    .footer p { margin:0; font-size:11px; color:#9ca3af; }
    .card { background:#fafafa; border:1px solid #e4e4e4; border-radius:8px; padding:16px 20px; margin:20px 0; }
    .card p { margin:0 0 8px 0; }
    .card p:last-child { margin:0; }
    .btn { display:inline-block; background:#1a365d; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; margin-top:12px; }
    .btn:hover { background:#0d1b2a; }
    .codigo-box { background:#f0f2f5; padding:20px; text-align:center; font-size:36px; font-weight:700; letter-spacing:10px; border-radius:8px; margin:16px 0; font-family: 'Courier New', monospace; color:#1a365d; border:2px dashed #c5d4e6; }
    .codigo-box small { display:block; font-size:12px; font-weight:400; letter-spacing:0; color:#7a8798; margin-top:4px; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${titulo}</h1>
    </div>
    <div class="subheader">
      <span>${etiqueta}</span>
    </div>
    <div class="body">
      ${cuerpoHtml}
    </div>
    <div class="footer">
      <p>Este correo es una notificación automática, por favor no respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// PLANTILLA CÓDIGO DE ACCESO (2FA)
// ============================================================
export function plantillaCodigoAcceso({ nombre, codigo, tiempoExpiracion = 5 }) {
  const cuerpoHtml = `
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Has solicitado acceso al panel de <strong>EVA · Entorno Virtual de Actividades</strong>.</p>
      <p>Tu código de verificación de un solo uso es:</p>
      <div class="codigo-box">
        ${codigo}
        <small>Válido por ${tiempoExpiracion} minutos</small>
      </div>
      <p>Ingresa este código en la pantalla de verificación para completar tu acceso.</p>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px 16px;margin:16px 0;border-left:4px solid #1a365d;">
        <p style="margin:0;font-size:13px;color:#5a6a7a;">
          <strong>⚠️ Importante:</strong>
          <br>• Este código es de <strong>un solo uso</strong>
          <br>• Expira en <strong>${tiempoExpiracion} minutos</strong>
          <br>• Si no solicitaste este acceso, ignora este mensaje
        </p>
      </div>
      <p style="font-size:12px;color:#7a8798;margin-top:16px;">
        Por razones de seguridad, nunca compartas este código con nadie.
      </p>
    `;
  return plantillaBase({
    titulo: "🔐 Código de acceso",
    etiqueta: "EVA · Seguridad en dos pasos",
    cuerpoHtml
  });
}

// ============================================================
// PLANTILLA COLABORADOR AGREGADO
// ============================================================
export function plantillaColaboradorAgregado({ nombre, proyecto, propietario }) {
  const baseUrl = getBaseUrl();
  const link = `${baseUrl}/app.html`;
  const cuerpoHtml = `
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Has sido agregado como <strong>colaborador</strong> en el proyecto "<strong>${proyecto}</strong>" por <strong>${propietario}</strong>.</p>
      <div class="card">
        <p><b>Proyecto:</b> ${proyecto}</p>
        <p><b>Propietario:</b> ${propietario}</p>
      </div>
      <p>Ahora puedes acceder a este proyecto desde el panel de control, ver sus participantes y gestionar la asistencia.</p>
      <a href="${link}" class="btn">Ir al panel</a>
      <p style="margin-top:12px;font-size:12px;color:#6a6a6a;">O copia este enlace: ${link}</p>
    `;
  return plantillaBase({
    titulo: "📋 Has sido agregado como colaborador",
    etiqueta: "EVA · UNISINU",
    cuerpoHtml
  });
}

// ============================================================
// PLANTILLAS EXISTENTES
// ============================================================

export function plantillaConfirmacionRegistro({ nombre, proyecto, fase }) {
  const cuerpoHtml = `
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Tu registro quedó confirmado correctamente.</p>
      <div class="card">
        <p><b>Proyecto:</b> ${proyecto}</p>
        <p><b>Fase:</b> ${fase}</p>
      </div>
      <p>Cuando tu profesor proyecte el código QR de asistencia, escanéalo e ingresa este mismo correo para marcar tu asistencia.</p>
      <p>¡Gracias por participar!</p>
    `;
  return plantillaBase({ titulo: "Registro confirmado", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}

export function plantillaConfirmacionAsistencia({ nombre, proyecto, fase, fechaTexto, hora }) {
  const cuerpoHtml = `
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Confirmamos que tu asistencia quedó registrada correctamente.</p>
      <div class="card">
        <p><b>Proyecto:</b> ${proyecto}</p>
        <p><b>Fase:</b> ${fase}</p>
        <p><b>Fecha:</b> ${fechaTexto}</p>
        <p><b>Hora:</b> ${hora}</p>
      </div>
      <p>Gracias por participar.</p>
    `;
  return plantillaBase({ titulo: "Asistencia confirmada", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}

export function plantillaSolicitudCreada({ proyecto, propietario, correoPropietario, telefonoPropietario, descripcion, fechaInicio, fechaFin, id }) {
  const baseUrl = getBaseUrl();
  const link = `${baseUrl}/app.html`;
  const cuerpoHtml = `
      <p>Se ha creado una nueva solicitud de proyecto.</p>
      <div class="card">
        <p><b>Proyecto:</b> ${proyecto}</p>
        <p><b>Propietario:</b> ${propietario}</p>
        <p><b>Correo:</b> ${correoPropietario}</p>
        <p><b>Teléfono:</b> ${telefonoPropietario}</p>
        <p><b>Descripción:</b> ${descripcion}</p>
        <p><b>Fecha Inicio:</b> ${fechaInicio}</p>
        <p><b>Fecha Fin:</b> ${fechaFin}</p>
        <p><b>ID Solicitud:</b> ${id}</p>
      </div>
      <p>Ingresa al panel de administración para revisar y aprobar esta solicitud.</p>
      <a href="${link}" class="btn">Ir al panel</a>
    `;
  return plantillaBase({ titulo: "Nueva solicitud de proyecto", etiqueta: "EVA · UNISINU", cuerpoHtml });
}

export function plantillaSolicitudAprobada({ proyecto, propietario, id }) {
  const baseUrl = getBaseUrl();
  const link = `${baseUrl}/app.html?proyecto=${id}`;
  const cuerpoHtml = `
      <p>Hola <strong>${propietario}</strong>,</p>
      <p>Tu solicitud para el proyecto "<strong>${proyecto}</strong>" ha sido <strong>APROBADA</strong>.</p>
      <p>Ya puedes acceder a tu proyecto desde el panel de control.</p>
      <div class="card">
        <p><b>Proyecto:</b> ${proyecto}</p>
        <p><b>ID:</b> ${id}</p>
      </div>
      <a href="${link}" class="btn">Ir a mi proyecto</a>
      <p style="margin-top:12px;font-size:12px;color:#6a6a6a;">O copia este enlace: ${link}</p>
    `;
  return plantillaBase({ titulo: "✅ Solicitud aprobada", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}

export function plantillaSolicitudRechazada({ proyecto, propietario, motivo }) {
  const cuerpoHtml = `
      <p>Hola <strong>${propietario}</strong>,</p>
      <p>Tu solicitud para el proyecto "<strong>${proyecto}</strong>" ha sido <strong>RECHAZADA</strong>.</p>
      ${motivo ? `<p><b>Motivo:</b> ${motivo}</p>` : ''}
      <p>Si tienes alguna pregunta, puedes contactarnos respondiendo a este correo.</p>
    `;
  return plantillaBase({ titulo: "❌ Solicitud rechazada", etiqueta: "UNISINU · MARATÓN DE PROGRAMACIÓN", cuerpoHtml });
}