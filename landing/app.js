// ========================================================
// VALLASEC - CAPTURA DE LEADS Y CONEXIÓN SUPABASE
// ========================================================

// Configuración de Supabase
const SUPABASE_CONFIG = {
  url: window.__SUPABASE_URL__ || "https://rgkcbbtwqwumlvubpulb.supabase.co",
  anonKey: window.__SUPABASE_ANON_KEY__ || "sb_publishable_XBao_xLme66eTSd3_PKLLw_PKuq0s4c"
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("leadFilterForm");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = submitBtn.querySelector(".btn-text");
  const btnLoader = submitBtn.querySelector(".btn-loader");
  const feedback = document.getElementById("formFeedback");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback.style.display = "none";
    feedback.className = "form-feedback";

    // Extraer datos del formulario y sanitizar
    const sanitizeText = (val) => String(val || "").replace(/[<>]/g, "").trim();

    const nombre = sanitizeText(document.getElementById("nombre").value);
    const empresa = sanitizeText(document.getElementById("empresa").value);
    const cargo = sanitizeText(document.getElementById("cargo").value);
    const email = document.getElementById("email").value.trim().toLowerCase();
    const telefono = sanitizeText(document.getElementById("telefono").value);
    const presupuesto = document.getElementById("presupuesto").value;
    const necesidad_principal = document.getElementById("necesidad_principal").value;
    const consentimiento = document.getElementById("consentimiento_datos")?.checked;

    // Obtener ciudades seleccionadas
    const checkedCiudades = Array.from(
      document.querySelectorAll('input[name="ciudades"]:checked')
    ).map((cb) => sanitizeText(cb.value));

    // Validación básica de campos requeridos
    if (!nombre || !empresa || !email || !telefono || !presupuesto || !necesidad_principal) {
      showFeedback("Por favor completa todos los campos obligatorios marcados con (*).", "error");
      return;
    }

    // Validación de formato de correo electrónico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      showFeedback("Por favor ingresa un correo corporativo válido (ejemplo: contacto@empresa.com).", "error");
      return;
    }

    // Validación de teléfono
    const cleanDigits = telefono.replace(/\D/g, "");
    if (cleanDigits.length < 8) {
      showFeedback("Por favor ingresa un número de teléfono o WhatsApp válido de al menos 8 dígitos.", "error");
      return;
    }

    if (checkedCiudades.length === 0) {
      showFeedback("Por favor selecciona al menos una ciudad o zona de interés.", "error");
      return;
    }

    // Validación obligatoria de Consentimiento LOPDP
    if (!consentimiento) {
      showFeedback("Para procesar tu cotización debes autorizar el tratamiento de datos personales conforme a la LOPDP marcando la casilla.", "error");
      return;
    }

    const payload = {
      nombre,
      empresa,
      cargo: cargo || "No especificado",
      email,
      telefono,
      presupuesto,
      ciudades: checkedCiudades,
      necesidad_principal,
      estado: "nuevo"
    };

    // Estado visual de carga
    submitBtn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "inline";

    try {
      // Inserción directa en la API REST de Supabase (PostgREST)
      let response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error del servidor (${response.status})`);
      }

      // Éxito
      showFeedback(
        `✅ ¡Excelente, ${nombre}! Tu solicitud para "${empresa}" ha sido registrada con respaldo legal LOPDP. Un planner comercial se comunicará contigo al ${telefono}.`,
        "success"
      );
      form.reset();

    } catch (err) {
      console.error("Error al registrar lead:", err);
      showFeedback(
        `Hubo un inconveniente al conectar con el servidor: ${err.message}. Verifica las credenciales de Supabase.`,
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = "inline";
      btnLoader.style.display = "none";
    }
  });

  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `form-feedback ${type}`;
    feedback.style.display = "block";
    feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Simulador de Telemetría y Flujo en Tiempo Real (Efecto Motion Site)
  const counterEl = document.getElementById("liveCounter");
  if (counterEl) {
    let currentCount = 85420;
    setInterval(() => {
      const delta = Math.floor(Math.random() * 3) + 1;
      currentCount += delta;
      counterEl.textContent = currentCount.toLocaleString("es-EC");
    }, 2600);
  }

  // UI/UX Pro Max: FAQ Accordion Interactive
  const faqQuestions = document.querySelectorAll(".faq-question");
  faqQuestions.forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const isExpanded = button.getAttribute("aria-expanded") === "true";

      // Cerrar otros ítems abiertos para mantener lectura limpia
      document.querySelectorAll(".faq-item.active").forEach((openItem) => {
        if (openItem !== item) {
          openItem.classList.remove("active");
          const openBtn = openItem.querySelector(".faq-question");
          if (openBtn) openBtn.setAttribute("aria-expanded", "false");
        }
      });

      // Alternar el ítem clickeado
      item.classList.toggle("active");
      button.setAttribute("aria-expanded", String(!isExpanded));
    });
  });

  // Desplazamiento suave de alta precisión para todos los botones que llevan al formulario
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector(".navbar")?.offsetHeight || 75;
        const targetTop = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 15;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });

        // Si el objetivo es el formulario, enfocar el primer campo para mayor fluidez
        if (targetId === "#formulario-filtro") {
          setTimeout(() => {
            const firstInput = document.getElementById("nombre");
            if (firstInput) firstInput.focus();
          }, 650);
        }
      }
    });
  });
});
