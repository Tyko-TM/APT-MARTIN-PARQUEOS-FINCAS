
// ==UserScript==
// @name         APT - Provincia / Fincas / Parqueo #1 <versión v-1.0.3>
// @namespace    apt-capturar-provincia
// @version      1.0.3
// @description  Lee la provincia desde “Situación Geográfica” y la aplica en FINCAS (Provincia + Duplicado=F + Derecho=000), crea el campo de Parqueo #1, calcula el Número de Finca según la descripción (P1-, P2-, etc.), hace clic en GUARDAR y luego en ACEPTAR del popup. <versión v-1.0.3>
// @match        https://apt.cfia.or.cr/APT2/Contrato/Nuevo*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const VER = "v-1.0.3";

    // ---------------- HERRAMIENTAS GENERALES ---------------- //

    // Normalizar texto: mayúsculas + sin tildes + sin espacios extra
    function normalizarTexto(txt) {
        return (txt || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar tildes
            .toUpperCase()
            .trim();
    }

    // ---------------- ARRANQUE: ESPERAR PESTAÑA PLANOS ---------------- //

    const intervalo = setInterval(() => {
        const tabPlanos = document.querySelector('#plano-tab.nav-link.tabsButtonRevision.active');
        if (!tabPlanos) return; // aún no está listo

        clearInterval(intervalo);

        // 1) Extraer la provincia desde “Situación Geográfica”
        extraerProvinciaDesdeSituacion((provincia) => {
            if (!provincia) {
                console.error(`[APT Provincia ${VER}] No se pudo obtener la provincia desde Situación Geográfica.`);
                return;
            }

            // 2) Usar esa provincia en la pestaña FINCAS
            aplicarEnFincas(provincia);
        });

    }, 400);

    // ---------------- FUNCIONES PRINCIPALES ---------------- //

    // Lee la provincia desde "Situación Geográfica"
    function extraerProvinciaDesdeSituacion(callback) {
        const botonSituacion = document.querySelector("button#bP3");
        if (!botonSituacion) {
            console.error(`[APT Provincia ${VER}] No se encontró el botón 'Situación Geográfica' (bP3).`);
            callback(null);
            return;
        }

        const estabaAbiertaAntes = botonSituacion.getAttribute("aria-expanded") === "true";

        // Si está cerrada, abrirla para que exista el contenido
        if (!estabaAbiertaAntes) {
            botonSituacion.click();
        }

        setTimeout(() => {
            const panelSituacion = document.querySelector("div#P3");
            if (!panelSituacion) {
                console.error(`[APT Provincia ${VER}] No se encontró el contenedor #P3 de Situación Geográfica.`);
                restaurarSituacion(estabaAbiertaAntes, botonSituacion);
                callback(null);
                return;
            }

            // Buscar el elemento cuyo texto empiece con "Ubicación:"
            const divUbicacion = Array.from(
                panelSituacion.querySelectorAll("div, span, p")
            ).find(el => (el.textContent || "").trim().startsWith("Ubicación:"));

            if (!divUbicacion) {
                console.error(`[APT Provincia ${VER}] No se encontró el texto 'Ubicación:' dentro de Situación Geográfica.`);
                restaurarSituacion(estabaAbiertaAntes, botonSituacion);
                callback(null);
                return;
            }

            let texto = divUbicacion.textContent || "";
            texto = texto.replace(/\s+/g, " ").trim(); // compactar espacios

            if (!texto.startsWith("Ubicación:")) {
                console.error(`[APT Provincia ${VER}] El texto encontrado no inicia con 'Ubicación:'.`);
                restaurarSituacion(estabaAbiertaAntes, botonSituacion);
                callback(null);
                return;
            }

            const sinEtiqueta = texto.replace("Ubicación:", "").trim();
            const partes = sinEtiqueta.split(",");

            if (partes.length < 1) {
                console.error(`[APT Provincia ${VER}] No se pudo separar PROVINCIA, CANTÓN, DISTRITO.`);
                restaurarSituacion(estabaAbiertaAntes, botonSituacion);
                callback(null);
                return;
            }

            const provincia = partes[0].trim(); // antes de la primera coma

            restaurarSituacion(estabaAbiertaAntes, botonSituacion);
            callback(provincia);

        }, 800);
    }

    // Si la pestaña Situación estaba cerrada, la volvemos a cerrar
    function restaurarSituacion(estabaAbiertaAntes, botonSituacion) {
        const ahoraAbierta = botonSituacion.getAttribute("aria-expanded") === "true";
        if (!estabaAbiertaAntes && ahoraAbierta) {
            botonSituacion.click();
        }
    }

    // Aplica provincia + duplicado + derecho + campo Parqueo + cálculo finca + auto-guardar
    function aplicarEnFincas(provinciaCruda) {
        const botonFincas = document.querySelector("button#bP2");
        if (!botonFincas) {
            console.error(`[APT Provincia ${VER}] No se encontró el botón 'Fincas' (bP2).`);
            return;
        }

        const estabaAbiertaAntes = botonFincas.getAttribute("aria-expanded") === "true";

        // Abrir Fincas si está cerrada (y la dejamos abierta siempre)
        if (!estabaAbiertaAntes) {
            botonFincas.click();
        }

        setTimeout(() => {
            const panelFincas = document.querySelector("div#P2");
            if (!panelFincas) {
                console.error(`[APT Provincia ${VER}] No se encontró el contenedor #P2 de FINCAS.`);
                return;
            }

            // 0) Crear la celda de PARQUEO #1 (si no existe)
            crearCampoParqueo(panelFincas);

            // 1) Rellenar campos básicos
            rellenarCamposFincas(panelFincas, provinciaCruda);

            // 2) Configurar cálculo automático de Número de Finca y auto-guardar
            configurarCalculoNumFinca();

            // 3) Configurar para que después de cada GUARDAR se vuelvan a aplicar valores básicos
            configurarReaplicacionDespuesDeGuardar(panelFincas, provinciaCruda);

        }, 800);
    }

    // ---------------- CAMPO "PARQUEO #1" ---------------- //

    function crearCampoParqueo(panelFincas) {
        // Evitar duplicados si por algo la función se llama de nuevo
        if (panelFincas.querySelector("#aptParqueo1Input")) return;

        const cuerpo = panelFincas.querySelector(".accordion-body") || panelFincas;

        const contenedor = document.createElement("div");
        contenedor.id = "aptParqueo1Wrapper";
        contenedor.style.margin = "10px 0 15px 0";

        const label = document.createElement("div");
        label.textContent = "DIGITE AQUÍ EL NUMERO DE FINCA DEL PARQUEO #1";
        label.style.fontSize = "0.85rem";
        label.style.fontWeight = "bold";
        label.style.color = "#FFA500";
        label.style.marginBottom = "4px";

        const input = document.createElement("input");
        input.type = "text";
        input.id = "aptParqueo1Input";
        input.className = "form-control";
        input.placeholder = "Solo números";
        input.autocomplete = "off";
        input.inputMode = "numeric";
        input.maxLength = 20;
        input.style.color = "#FFA500";
        input.style.fontWeight = "bold";

        // Forzar solo dígitos
        input.addEventListener("input", () => {
            const soloDigitos = input.value.replace(/\D+/g, "");
            if (input.value !== soloDigitos) {
                input.value = soloDigitos;
            }
        });

        contenedor.appendChild(label);
        contenedor.appendChild(input);

        // Insertamos al inicio del cuerpo de FINCAS
        if (cuerpo.firstChild) {
            cuerpo.insertBefore(contenedor, cuerpo.firstChild);
        } else {
            cuerpo.appendChild(contenedor);
        }
    }

    // ---------------- RELLENO BÁSICO DE FINCAS ---------------- //

    function rellenarCamposFincas(panelFincas, provinciaCruda) {
        // --- PROVINCIA ---
        const selectProvincia = panelFincas.querySelector("#ddlProvinciaFinca");
        if (!selectProvincia) {
            console.error(`[APT Provincia ${VER}] No se encontró el <select id="ddlProvinciaFinca">.`);
        } else {
            const provinciaNorm = normalizarTexto(provinciaCruda);
            let encontrada = false;

            for (const option of selectProvincia.options) {
                const textoOptNorm = normalizarTexto(option.textContent || option.innerText || "");
                if (textoOptNorm === provinciaNorm) {
                    selectProvincia.value = option.value;
                    selectProvincia.dispatchEvent(new Event("change", { bubbles: true }));
                    selectProvincia.dispatchEvent(new Event("input", { bubbles: true }));
                    encontrada = true;
                    break;
                }
            }

            if (!encontrada) {
                console.error(`[APT Provincia ${VER}] No se encontró en el combo la provincia: "${provinciaCruda}".`);
            }
        }

        // --- DUPLICADO = F ---
        const selectDuplicado = panelFincas.querySelector("#ddlDuplicado");
        if (!selectDuplicado) {
            console.error(`[APT Provincia ${VER}] No se encontró el <select id="ddlDuplicado">.`);
        } else {
            const letraObjetivo = "F";
            const letraNorm = normalizarTexto(letraObjetivo);
            let encontradaDup = false;

            for (const option of selectDuplicado.options) {
                const textoOptNorm = normalizarTexto(option.textContent || option.innerText || "");
                if (textoOptNorm === letraNorm) {
                    selectDuplicado.value = option.value;
                    selectDuplicado.dispatchEvent(new Event("change", { bubbles: true }));
                    selectDuplicado.dispatchEvent(new Event("input", { bubbles: true }));
                    encontradaDup = true;
                    break;
                }
            }

            if (!encontradaDup) {
                console.error(`[APT Provincia ${VER}] No se encontró en el combo DUPLICADO la opción "F".`);
            }
        }

        // --- DERECHO = "000" si está vacío ---
        const inputDerecho = panelFincas.querySelector("#txtDerecho");
        if (!inputDerecho) {
            console.error(`[APT Provincia ${VER}] No se encontró el <input id="txtDerecho">.`);
        } else {
            if (!inputDerecho.value || inputDerecho.value.trim() === "") {
                inputDerecho.value = "000";
                inputDerecho.dispatchEvent(new Event("input", { bubbles: true }));
                inputDerecho.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    }

    // ---------------- CÁLCULO DE NÚMERO DE FINCA + AUTO-GUARDAR ---------------- //

    function configurarCalculoNumFinca() {
        const inputParqueo = document.getElementById("aptParqueo1Input");
        const inputDescripcion = document.getElementById("txtDescripcion");
        const inputNumFinca = document.getElementById("txtNumFinca");

        if (!inputParqueo || !inputDescripcion || !inputNumFinca) {
            // Si falta algo, no rompemos nada, solo salimos silenciosamente
            return;
        }

        // Evitar agregar listeners dos veces sobre los mismos elementos
        if (inputParqueo._aptCalcFincaConfig && inputDescripcion._aptCalcFincaConfig) {
            return;
        }
        inputParqueo._aptCalcFincaConfig = true;
        inputDescripcion._aptCalcFincaConfig = true;

        let yaAutoGuardado = false; // por cada ciclo de finca

        const recalcular = () => {
            const baseStr = (inputParqueo.value || "").trim();
            if (!/^\d+$/.test(baseStr)) return;

            const desc = (inputDescripcion.value || "").trim();
            // Primer carácter letra, luego números, luego guion -> capturamos los números
            const match = desc.match(/^[A-Za-z]\s*(\d+)\s*-/);
            if (!match) return;

            const n = parseInt(match[1], 10);
            const base = parseInt(baseStr, 10);
            if (!Number.isFinite(n) || !Number.isFinite(base)) return;

            const delta = n > 1 ? (n - 1) : 0;
            const resultado = base + delta;

            inputNumFinca.value = String(resultado);
            inputNumFinca.dispatchEvent(new Event("input", { bubbles: true }));
            inputNumFinca.dispatchEvent(new Event("change", { bubbles: true }));

            // Cuando ya tenemos todos los datos, auto-guardar UNA sola vez
            if (!yaAutoGuardado) {
                yaAutoGuardado = true;
                apt_autoAceptarPopup();
                apt_autoGuardarFinca();
            }
        };

        // Si ya pusiste datos antes de que cargue el script, que calcule una vez
        recalcular();

        // Recalcular cuando cambie la finca base del parqueo
        inputParqueo.addEventListener("input", recalcular);
        inputParqueo.addEventListener("change", recalcular);

        // Y también cuando cambie la descripción (P1-, P2-, P14-, etc.)
        inputDescripcion.addEventListener("input", recalcular);
        inputDescripcion.addEventListener("change", recalcular);
    }

    // Hace clic en el botón verde GUARDAR de FINCAS
    function apt_autoGuardarFinca() {
        const btnGuardar =
            document.querySelector('#P2 button.btn.btn-success.alinearbottonDerechaFinal') ||
            document.querySelector('#P2 button.btn.btn-success.alinearbottonderechafinal') || // por si cambia el nombre
            document.querySelector('button.btn.btn-success.alinearbottonDerechaFinal');

        if (btnGuardar && btnGuardar.offsetParent !== null) {
            btnGuardar.click();
        } else {
            console.warn(`[APT Provincia ${VER}] No se encontró el botón GUARDAR de FINCAS para auto-guardar.`);
        }
    }

    // Detecta el popup de SweetAlert2 y hace clic en "Aceptar"
    function apt_autoAceptarPopup() {
        const observer = new MutationObserver(() => {
            const btnAceptar = document.querySelector('button.swal2-confirm.swal2-styled');

            if (btnAceptar && btnAceptar.offsetParent !== null) {
                btnAceptar.click();
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ---------------- REAPLICAR TRAS CADA GUARDADO ---------------- //

    function configurarReaplicacionDespuesDeGuardar(panelFincas, provinciaCruda) {
        const botonGuardar = Array.from(panelFincas.querySelectorAll("button"))
            .find(btn => normalizarTexto(btn.textContent || "") === "GUARDAR");

        if (!botonGuardar) {
            console.error(`[APT Provincia ${VER}] No se encontró el botón GUARDAR dentro de FINCAS.`);
            return;
        }

        if (botonGuardar._aptProvinciaListener) return;
        botonGuardar._aptProvinciaListener = true;

        botonGuardar.addEventListener("click", () => {
            // Después de guardar, el servidor reconstruye parte del formulario,
            // así que volvemos a rellenar y reconfigurar.
            setTimeout(() => {
                const nuevoPanelFincas = document.querySelector("div#P2");
                if (!nuevoPanelFincas) return;

                rellenarCamposFincas(nuevoPanelFincas, provinciaCruda);
                crearCampoParqueo(nuevoPanelFincas);
                configurarCalculoNumFinca();
            }, 800);
        });
    }

})(); // FIN IIFE
// v-1.0.3
