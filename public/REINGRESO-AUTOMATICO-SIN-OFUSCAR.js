/*
    MÓDULO: APT REINGRESO AUTOMÁTICO (Nube)
    Versión: v-1.0
    Descripción: Lógica de reingreso y notificación parpadeante.
*/

(function() {
    'use strict';

    console.log('[Nube] Cargando módulo de Reingreso Automático v-1.0...');

    // --- HERRAMIENTAS AUXILIARES ---
    const visible = function(el) { // Verifica si un elemento es visible
        return !!el && el.offsetParent !== null && el.getClientRects().length > 0;
    };

    const log = function(msg) { // Log personalizado
        console.log(`[APT-RN] ${msg}`);
    };

    // --- LOGICA PRINCIPAL ---
    (function iniciarReingreso() {
        if (window.__APT_RN_CLOUD_ACTIVE__) { // Evitar doble carga
            log('Módulo ya activo.');
            return;
        }
        window.__APT_RN_CLOUD_ACTIVE__ = true;

        const TICK_MS = 200; // Intervalo de chequeo
        const TIMEOUT_MS = 45000; // Tiempo máximo de vida

        // Detectar pestaña planos activa
        const planosActiva = function() {
            return visible(document.querySelector('a#plano-tab[aria-selected="true"], a#plano-tab.active'));
        };

        // Detectar si es Trámite de Reingreso
        const reingresoSeleccionado = function() {
            const s = document.querySelector('#ddlTipoTramiteRN');
            if (!visible(s)) return false;
            return /reingreso/i.test(s.options[s.selectedIndex].text);
        };

        // Obtener botón Guardar
        const getBotonGuardar = function() {
            return (document.querySelector('#PRN button[onclick^="GuardarTramiteRN"]') ||
                    document.querySelector('button.btn.btn-outline-primary[onclick^="Guardar"]'));
        };

        let notificacionMostrada = false;
        let clicked = false;
        let start = Date.now();

        // Función visual: Notificación parpadeante
        const mostrarNotificacion = function() {
            if (notificacionMostrada) return;
            notificacionMostrada = true;

            const div = document.createElement('div');
            div.textContent = 'REINGRESO ACTIVADO';
            const sID = 'estilo-parpadeo-rn-cloud';

            if (!document.getElementById(sID)) {
                const st = document.createElement('style');
                st.id = sID;
                st.innerHTML = `@keyframes parpadeo-rn { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }`;
                document.head.appendChild(st);
            }

            Object.assign(div.style, {
                position: 'fixed', bottom: '20px', right: '20px', padding: '18px 30px',
                backgroundColor: '#FFC300', color: 'red', fontWeight: 'bold', fontSize: '18px',
                zIndex: '99999', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                textAlign: 'center', animation: 'parpadeo-rn 2s linear 3'
            });

            document.body.appendChild(div);
            setTimeout(function() { div.remove(); }, 6000);
        };

        // Bucle de chequeo
        const intervalo = setInterval(function() {
            // Timeout de seguridad
            if (Date.now() - start > TIMEOUT_MS) {
                clearInterval(intervalo);
                log('Tiempo de espera agotado. Módulo detenido.');
                return;
            }

            if (!planosActiva()) {
                if (clicked) { clicked = false; notificacionMostrada = false; }
                return;
            }

            // Verificar condiciones para auto-click
            const prn = document.querySelector('#PRN.accordion-collapse.show');
            if (visible(prn) && reingresoSeleccionado()) {
                 const btn = getBotonGuardar();
                 if (visible(btn) && !clicked) {
                     mostrarNotificacion();
                     clicked = true;
                     log('Auto-clic ejecutado en Guardar.');
                     btn.click();
                 }
            }
        }, TICK_MS);

        // --- Cierre automático de Popups (SweetAlert) ---
        setInterval(function() {
            const btn = document.querySelector('button.swal2-confirm.swal2-styled');
            if (visible(btn)) {
                const title = document.querySelector('#swal2-title');
                const msg = document.querySelector('#swal2-html-container');
                // Detectar mensajes de éxito específicos o genéricos
                if (title && (/enviado/i.test(title.textContent) || /atención/i.test(title.textContent)) &&
                    msg && /guardado exitosamente/i.test(msg.textContent)) {
                    log('Cerrando popup de éxito...');
                    btn.click();
                }
            }
        }, 120);

    })();
})();
// v-1.0
