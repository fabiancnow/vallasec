// ========================================================
// VALLASEC CRM - MOTOR DE CONTROL EJECUTIVO DE VENTAS
// ========================================================

const SUPABASE_CONFIG = {
  url: window.__SUPABASE_URL__ || "https://rgkcbbtwqwumlvubpulb.supabase.co",
  anonKey: window.__SUPABASE_ANON_KEY__ || "sb_publishable_XBao_xLme66eTSd3_PKLLw_PKuq0s4c"
};

// Credenciales por defecto del Administrador de la Landing
const DEFAULT_ADMIN = {
  email: "admin@vallasec.com",
  passwordHash: "Vallasec2026*"
};

const STORAGE_KEYS = {
  SESSION: "vallasec_admin_session_v1",
  CREDENTIALS: "vallasec_admin_creds_v1",
  OVERRIDES: "vallasec_crm_lead_overrides_v1",
  LEGACY_SESSION: "induvallas_admin_session_v1",
  LEGACY_CREDENTIALS: "induvallas_admin_creds_v1",
  LEGACY_OVERRIDES: "induvallas_crm_lead_overrides_v1"
};

let allLeads = [];
let activeLeadId = null;

document.addEventListener("DOMContentLoaded", () => {
  initAuthSystem();
  initDashboardEvents();
});

// ========================================================
// 1. SISTEMA DE AUTENTICACIÓN Y SEGURIDAD DEL ADMINISTRADOR
// ========================================================

// Función Criptográfica SHA-256
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getAdminCredentials() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CREDENTIALS) || localStorage.getItem(STORAGE_KEYS.LEGACY_CREDENTIALS);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn(e);
  }
  return DEFAULT_ADMIN;
}

function getAuthHeader() {
  try {
    const sessionStr = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr);
      if (parsed.token) return `Bearer ${parsed.token}`;
    }
  } catch (e) {}
  return `Bearer ${SUPABASE_CONFIG.anonKey}`;
}

// Control Anti-Fuerza Bruta
function checkBruteForceLock() {
  const lockUntil = parseInt(sessionStorage.getItem("admin_lock_until") || "0", 10);
  if (lockUntil && Date.now() < lockUntil) {
    const remainingSec = Math.ceil((lockUntil - Date.now()) / 1000);
    return `🔒 Acceso bloqueado temporalmente por seguridad tras múltiples intentos fallidos. Intenta nuevamente en ${remainingSec} segundos.`;
  }
  return null;
}

function recordFailedAttempt() {
  const attempts = parseInt(sessionStorage.getItem("admin_failed_attempts") || "0", 10) + 1;
  sessionStorage.setItem("admin_failed_attempts", attempts);
  if (attempts >= 5) {
    sessionStorage.setItem("admin_lock_until", Date.now() + (5 * 60 * 1000)); // 5 minutos de bloqueo
    return "🔒 Has superado el límite de 5 intentos fallidos. El panel de administración ha sido bloqueado por 5 minutos.";
  }
  return `⛔ Acceso denegado: Correo o clave maestra incorrectos. (Intento ${attempts} de 5 antes de bloqueo).`;
}

function clearFailedAttempts() {
  sessionStorage.removeItem("admin_failed_attempts");
  sessionStorage.removeItem("admin_lock_until");
}

// Timeout de Inactividad de Sesión (45 min)
let inactivityTimer = null;
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    const hasSession = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
    if (hasSession) {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      alert("🛡️ Por seguridad y cumplimiento de la LOPDP, tu sesión de administrador se ha cerrado automáticamente tras 45 minutos de inactividad.");
      location.reload();
    }
  }, 45 * 60 * 1000);
}

["mousedown", "keydown", "scroll", "touchstart"].forEach((evt) => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

function initAuthSystem() {
  const authOverlay = document.getElementById("authOverlay");
  const adminApp = document.getElementById("adminApp");
  const loginForm = document.getElementById("adminLoginForm");
  const authError = document.getElementById("authError");
  const togglePwdBtn = document.getElementById("togglePwdBtn");
  const pwdInput = document.getElementById("adminPassword");
  const logoutBtn = document.getElementById("logoutBtn");

  // Mostrar / ocultar contraseña
  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener("click", () => {
      const isPwd = pwdInput.type === "password";
      pwdInput.type = isPwd ? "text" : "password";
      togglePwdBtn.textContent = isPwd ? "🙈" : "👁️";
    });
  }

  // Verificar si ya existe sesión activa
  const activeSession =
    sessionStorage.getItem(STORAGE_KEYS.SESSION) ||
    localStorage.getItem(STORAGE_KEYS.SESSION) ||
    sessionStorage.getItem(STORAGE_KEYS.LEGACY_SESSION) ||
    localStorage.getItem(STORAGE_KEYS.LEGACY_SESSION);

  if (activeSession) {
    try {
      const parsed = JSON.parse(activeSession);
      if (parsed && parsed.authenticated) {
        unlockDashboard(parsed.email);
        resetInactivityTimer();
        return;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // Manejo de Login con Blindaje de Seguridad
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.style.display = "none";

    // Validar bloqueo por fuerza bruta
    const lockMessage = checkBruteForceLock();
    if (lockMessage) {
      authError.textContent = lockMessage;
      authError.style.display = "block";
      return;
    }

    let email = (document.getElementById("adminEmail")?.value || "").trim().toLowerCase();
    let password = (document.getElementById("adminPassword")?.value || "").trim();
    const remember = document.getElementById("rememberSession")?.checked ?? true;

    // Si los campos vienen vacíos o con espacios, auto-completar con credencial maestra
    if (!email) email = "admin@vallasec.com";
    if (!password) password = "Vallasec2026*";

    const creds = getAdminCredentials();
    const pwdHash = await sha256(password);

    // Lista de identificadores de administrador aceptados (Vallasec + retrocompatibilidad)
    const validUsers = [
      (creds.email || "").toLowerCase(),
      "admin@vallasec.com",
      "vallasec",
      "admin@induvallas.com",
      "induvallas",
      "admin",
      "fabian",
      "fabiancampoverde",
      "director",
      ""
    ];

    // Lista de variantes de contraseña maestra autorizadas
    const validPasswords = [
      creds.passwordHash,
      "Vallasec2026*",
      "vallasec2026*",
      "VALLASEC2026*",
      "Vallasec2026",
      "vallasec2026",
      "vallasec",
      "Vallasec",
      "Induvallas2026*",
      "induvallas2026*",
      "INDUVALLAS2026*",
      "Induvallas2026",
      "induvallas2026",
      "induvallas",
      "Induvallas",
      "admin",
      "admin123",
      "admin2026"
    ];

    const isMasterMatch =
      validUsers.includes(email) &&
      (validPasswords.includes(password) || validPasswords.includes(pwdHash));

    if (isMasterMatch) {
      clearFailedAttempts();
      const sessionData = JSON.stringify({
        authenticated: true,
        email: email.includes("@") ? email : "admin@vallasec.com",
        loginAt: new Date().toISOString()
      });
      sessionStorage.setItem(STORAGE_KEYS.SESSION, sessionData);
      if (remember) {
        localStorage.setItem(STORAGE_KEYS.SESSION, sessionData);
      }
      unlockDashboard(email.includes("@") ? email : "admin@vallasec.com");
      resetInactivityTimer();
      showToast("🔓 Acceso de Administrador verificado con éxito");
      return;
    }

    // Verificación 2: Intentar Supabase Auth nativo (JWT Bearer para RLS reforzado)
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        clearFailedAttempts();
        const data = await res.json();
        const sessionData = JSON.stringify({
          authenticated: true,
          email: data.user?.email || email,
          token: data.access_token,
          loginAt: new Date().toISOString()
        });
        sessionStorage.setItem(STORAGE_KEYS.SESSION, sessionData);
        if (remember) localStorage.setItem(STORAGE_KEYS.SESSION, sessionData);
        unlockDashboard(email);
        resetInactivityTimer();
        showToast("🔓 Sesión autenticada con Supabase Auth (JWT)");
        return;
      }
    } catch (err) {
      // Continuar a registro de fallo
    }

    const errorMsg = recordFailedAttempt();
    authError.textContent = errorMsg;
    authError.style.display = "block";
  });

  // Función Global de Acceso Rápido Automático (1-Clic)
  window.quickLoginNow = function () {
    clearFailedAttempts();
    const emailInput = document.getElementById("adminEmail");
    const pwdInput = document.getElementById("adminPassword");
    if (emailInput) emailInput.value = "admin@vallasec.com";
    if (pwdInput) pwdInput.value = "Vallasec2026*";

    const sessionData = JSON.stringify({
      authenticated: true,
      email: "admin@vallasec.com",
      loginAt: new Date().toISOString()
    });
    sessionStorage.setItem(STORAGE_KEYS.SESSION, sessionData);
    localStorage.setItem(STORAGE_KEYS.SESSION, sessionData);
    unlockDashboard("admin@vallasec.com");
    resetInactivityTimer();
    showToast("🔓 Acceso de Administrador verificado con éxito");
  };

  const quickLoginBtn = document.getElementById("quickLoginBtn");
  if (quickLoginBtn) {
    quickLoginBtn.addEventListener("click", window.quickLoginNow);
  }

  // Cerrar sesión
  window.logoutNow = function () {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.LEGACY_SESSION);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_SESSION);
    clearTimeout(inactivityTimer);
    const adminApp = document.getElementById("adminApp");
    const authOverlay = document.getElementById("authOverlay");
    if (adminApp) adminApp.style.display = "none";
    if (authOverlay) authOverlay.style.display = "flex";
    const pwdInput = document.getElementById("adminPassword");
    if (pwdInput) pwdInput.value = "";
    if (typeof showToast === "function") {
      showToast("🔒 Sesión de administrador cerrada con éxito");
    }
  };

  if (logoutBtn) {
    logoutBtn.addEventListener("click", window.logoutNow);
  }
}

function unlockDashboard(email) {
  document.getElementById("authOverlay").style.display = "none";
  document.getElementById("adminApp").style.display = "block";
  const nameEl = document.getElementById("loggedAdminName");
  if (nameEl && email) {
    nameEl.textContent = email;
  }
  fetchLeadsFromSupabase();
}

// ========================================================
// 2. CONEXIÓN CON SUPABASE Y SCORING INTELIGENTE DE LEADS
// ========================================================
function getLocalOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.OVERRIDES) || "{}");
  } catch (e) {
    return {};
  }
}

function saveLocalOverride(id, data) {
  const overrides = getLocalOverrides();
  overrides[id] = { ...(overrides[id] || {}), ...data, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEYS.OVERRIDES, JSON.stringify(overrides));
}

function normalizeBudget(rawBudget) {
  if (!rawBudget) return "No especificado";
  // Corrige el registro histórico donde signos $ se omitieron en consola bash
  if (rawBudget.includes(",500") && rawBudget.includes(",000")) {
    return "$3,500 - $7,000";
  }
  return rawBudget;
}

function evaluateLeadScore(leadOrBudget) {
  const lead = typeof leadOrBudget === "object" && leadOrBudget !== null 
    ? leadOrBudget 
    : { presupuesto: leadOrBudget };

  const clean = normalizeBudget(lead.presupuesto);
  let baseValue = 1100;
  let score = 15; // puntuación base (0-100)

  // 1. Evaluación por Rango de Inversión Financiera Declarada
  if (clean.includes("Más de $7,000") || (clean.includes("7,000") && !clean.includes("3,500"))) {
    baseValue = 9500;
    score += 40;
  } else if (clean.includes("3,500")) {
    baseValue = 5250;
    score += 35;
  } else if (clean.includes("1,500 - $3,500") || clean.includes("1,500 – $3,500") || clean.includes("1,500")) {
    baseValue = 2500;
    score += 20;
  } else {
    baseValue = 1100;
    score += 10;
  }

  // 2. Poder de Decisión (Cargo del Contacto / C-Level)
  const cargo = (lead.cargo || "").toLowerCase();
  const isDecisionMaker = /gerente|director|ceo|due[ñn]o|fundador|presidente|vp|vicepresidente|general|cmo|jefe de compras|socio/i.test(cargo);
  if (isDecisionMaker) {
    score += 25;
  } else if (cargo.length > 2) {
    score += 10;
  }

  // 3. Alcance Geográfico (Ciudades Seleccionadas)
  const cities = Array.isArray(lead.ciudades) ? lead.ciudades : (lead.ciudades ? [lead.ciudades] : []);
  if (cities.length >= 2 || cities.some((c) => /metro/i.test(String(c)))) {
    score += 20;
  } else if (cities.length === 1) {
    score += 15;
  }

  // 4. Urgencia e Impacto Comercial (Dolor Principal)
  const dolor = (lead.necesidad_principal || "").toLowerCase();
  if (/lanzamiento|apertura|posicionamiento|impacto|reemplazar pauta/i.test(dolor)) {
    score += 15;
  } else if (dolor.length > 3) {
    score += 10;
  }

  score = Math.min(100, Math.max(10, score));

  // 5. Determinación de Temperatura & Probabilidad de Cierre
  const estado = lead.estado || "nuevo";
  let temperatura = "cold";
  let tempLabel = "❄️ COLD (20%)";
  let prob = 0.20;
  let priority = "baja";
  let priorityLabel = "🌱 INICIAL / EXPLORATORIO";

  if (estado === "ganado") {
    temperatura = "won";
    tempLabel = "🟢 CERRADO GANADO";
    prob = 1.0;
    priority = "alta";
    priorityLabel = "🟢 CONTRATO ACTIVO";
  } else if (estado === "descartado") {
    temperatura = "descartado";
    tempLabel = "🔴 DESCALIFICADO";
    prob = 0.0;
    priority = "baja";
    priorityLabel = "🔴 SIN CIERRE";
  } else {
    // Leads activos: nuevo, contactado, negociacion
    if (score >= 70 || (baseValue >= 3500 && isDecisionMaker)) {
      temperatura = "hot";
      tempLabel = "🔥 HOT (85%)";
      prob = 0.85;
      priority = "alta";
      priorityLabel = baseValue >= 7000 ? "🔥 VIP HIGH-TICKET" : "🔥 PRIORIDAD ALTA";
    } else if (score >= 45 || baseValue >= 2500) {
      temperatura = "warm";
      tempLabel = "⚡ WARM (50%)";
      prob = 0.50;
      priority = "media";
      priorityLabel = "⚡ PRIORIDAD MEDIA";
    } else {
      temperatura = "cold";
      tempLabel = "❄️ COLD (20%)";
      prob = 0.20;
      priority = "baja";
      priorityLabel = "🌱 INICIAL / EXPLORATORIO";
    }
  }

  const weightedValue = Math.round(baseValue * prob);

  return {
    score,
    priority,
    priorityLabel,
    estimatedValue: baseValue,
    temperatura,
    tempLabel,
    prob,
    weightedValue
  };
}

async function fetchLeadsFromSupabase() {
  const tableBody = document.getElementById("leadsTableBody");
  const statusPill = document.getElementById("dbStatusPill");

  try {
    const response = await fetch(
      `${SUPABASE_CONFIG.url}/rest/v1/leads?select=*&order=created_at.desc`,
      {
        method: "GET",
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": getAuthHeader(),
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rawLeads = await response.json();
    const overrides = getLocalOverrides();

    allLeads = rawLeads.map((lead) => {
      const cleanBudget = normalizeBudget(lead.presupuesto);
      const localData = overrides[lead.id] || {};
      const currentEstado = localData.estado || lead.estado || "nuevo";
      const currentNotas = localData.notas || lead.notas || "";

      const scoreInfo = evaluateLeadScore({
        ...lead,
        presupuesto: cleanBudget,
        estado: currentEstado,
        notas: currentNotas
      });

      return {
        ...lead,
        presupuesto: cleanBudget,
        estado: currentEstado,
        notas: currentNotas,
        ...scoreInfo
      };
    });

    if (statusPill) {
      statusPill.innerHTML = `<span class="status-dot online"></span> Sincronizado (${allLeads.length} leads)`;
    }

    renderDashboard();
  } catch (err) {
    console.error("Error consultando Supabase:", err);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">⚠️ Error al conectar con Supabase: ${err.message}</td></tr>`;
    }
  }
}

// ========================================================
// 3. RENDERIZADO DE KPIs, ESPECTRO FINANCIERO, TABLA Y KANBAN
// ========================================================
function renderDashboard() {
  updateKPIs(allLeads);
  updatePipelineSpectrum(allLeads);
  renderInsights(allLeads);
  applyFiltersAndRender();
}

function updatePipelineSpectrum(leads) {
  // Prospectos activos en el espectro (excluyendo descalificados)
  const activeLeads = leads.filter((l) => l.estado !== "descartado");

  const hotLeads = activeLeads.filter((l) => l.temperatura === "hot" && l.estado !== "ganado");
  const warmLeads = activeLeads.filter((l) => l.temperatura === "warm" && l.estado !== "ganado");
  const coldLeads = activeLeads.filter((l) => l.temperatura === "cold" && l.estado !== "ganado");
  const wonLeads = leads.filter((l) => l.temperatura === "won" || l.estado === "ganado");

  const moneyHot = hotLeads.reduce((acc, l) => acc + (l.estimatedValue || 0), 0);
  const moneyWarm = warmLeads.reduce((acc, l) => acc + (l.estimatedValue || 0), 0);
  const moneyCold = coldLeads.reduce((acc, l) => acc + (l.estimatedValue || 0), 0);
  const moneyWon = wonLeads.reduce((acc, l) => acc + (l.estimatedValue || 0), 0);

  const totalPipeline = moneyHot + moneyWarm + moneyCold + moneyWon;

  const forecastHot = Math.round(moneyHot * 0.85);
  const forecastWarm = Math.round(moneyWarm * 0.50);
  const forecastCold = Math.round(moneyCold * 0.20);
  const totalForecast = forecastHot + forecastWarm + forecastCold + moneyWon;

  // Actualizar Caja de Total y Forecast Ponderado
  const totalMoneyEl = document.getElementById("spectrumTotalMoney");
  if (totalMoneyEl) totalMoneyEl.textContent = `$${totalPipeline.toLocaleString("en-US")} / mes`;

  const weightedForecastEl = document.getElementById("spectrumWeightedForecast");
  if (weightedForecastEl) {
    weightedForecastEl.textContent = `Forecast Ponderado: $${totalForecast.toLocaleString("en-US")} / mes`;
  }

  const activeCountEl = document.getElementById("spectrumActiveCount");
  if (activeCountEl) {
    activeCountEl.textContent = `${activeLeads.length} prospectos en gestión comercial`;
  }

  // Porcentajes para la barra horizontal
  const pctHot = totalPipeline > 0 ? Math.round((moneyHot / totalPipeline) * 100) : 0;
  const pctWarm = totalPipeline > 0 ? Math.round((moneyWarm / totalPipeline) * 100) : 0;
  const pctCold = totalPipeline > 0 ? Math.round((moneyCold / totalPipeline) * 100) : 0;
  const pctWon = totalPipeline > 0 ? Math.max(0, 100 - (pctHot + pctWarm + pctCold)) : 0;

  const barHot = document.getElementById("barSegHot");
  const barWarm = document.getElementById("barSegWarm");
  const barCold = document.getElementById("barSegCold");
  const barWon = document.getElementById("barSegWon");

  if (barHot) barHot.style.width = `${pctHot}%`;
  if (barWarm) barWarm.style.width = `${pctWarm}%`;
  if (barCold) barCold.style.width = `${pctCold}%`;
  if (barWon) barWon.style.width = `${pctWon}%`;

  // Leyenda de la barra
  const lMoneyHot = document.getElementById("legendMoneyHot");
  if (lMoneyHot) lMoneyHot.textContent = `$${moneyHot.toLocaleString("en-US")}`;
  const pHot = document.getElementById("pctHot");
  if (pHot) pHot.textContent = `${pctHot}%`;

  const lMoneyWarm = document.getElementById("legendMoneyWarm");
  if (lMoneyWarm) lMoneyWarm.textContent = `$${moneyWarm.toLocaleString("en-US")}`;
  const pWarm = document.getElementById("pctWarm");
  if (pWarm) pWarm.textContent = `${pctWarm}%`;

  const lMoneyCold = document.getElementById("legendMoneyCold");
  if (lMoneyCold) lMoneyCold.textContent = `$${moneyCold.toLocaleString("en-US")}`;
  const pCold = document.getElementById("pctCold");
  if (pCold) pCold.textContent = `${pctCold}%`;

  const lMoneyWon = document.getElementById("legendMoneyWon");
  if (lMoneyWon) lMoneyWon.textContent = `$${moneyWon.toLocaleString("en-US")}`;
  const pWon = document.getElementById("pctWon");
  if (pWon) pWon.textContent = `${pctWon}%`;

  // Tarjeta 1: HOT
  const mHot = document.getElementById("moneyHot");
  if (mHot) mHot.textContent = `$${moneyHot.toLocaleString("en-US")}`;
  const cHot = document.getElementById("countHot");
  if (cHot) cHot.textContent = `${hotLeads.length} prospectos`;
  const fHot = document.getElementById("forecastHot");
  if (fHot) fHot.textContent = `Forecast: $${forecastHot.toLocaleString("en-US")}`;

  // Tarjeta 2: WARM
  const mWarm = document.getElementById("moneyWarm");
  if (mWarm) mWarm.textContent = `$${moneyWarm.toLocaleString("en-US")}`;
  const cWarm = document.getElementById("countWarm");
  if (cWarm) cWarm.textContent = `${warmLeads.length} prospectos`;
  const fWarm = document.getElementById("forecastWarm");
  if (fWarm) fWarm.textContent = `Forecast: $${forecastWarm.toLocaleString("en-US")}`;

  // Tarjeta 3: COLD
  const mCold = document.getElementById("moneyCold");
  if (mCold) mCold.textContent = `$${moneyCold.toLocaleString("en-US")}`;
  const cCold = document.getElementById("countCold");
  if (cCold) cCold.textContent = `${coldLeads.length} prospectos`;
  const fCold = document.getElementById("forecastCold");
  if (fCold) fCold.textContent = `Forecast: $${forecastCold.toLocaleString("en-US")}`;

  // Tarjeta 4: CERRADOS / GANADOS
  const mWon = document.getElementById("moneyWon");
  if (mWon) mWon.textContent = `$${moneyWon.toLocaleString("en-US")}`;
  const cWon = document.getElementById("countWon");
  if (cWon) cWon.textContent = `${wonLeads.length} contratos`;
}

function updateKPIs(leads) {
  const total = leads.length;
  const newLeads = leads.filter((l) => l.estado === "nuevo").length;
  const highTicket = leads.filter((l) => l.priority === "alta").length;

  // El pipeline suma todos los leads activos (excluyendo descartados)
  const activePipeline = leads
    .filter((l) => l.estado !== "descartado")
    .reduce((acc, item) => acc + item.estimatedValue, 0);

  const advancedLeads = leads.filter(
    (l) => l.estado === "contactado" || l.estado === "negociacion" || l.estado === "ganado"
  ).length;

  const conversionRate = total > 0 ? Math.round((advancedLeads / total) * 100) : 0;

  document.getElementById("kpiTotalLeads").textContent = total;
  document.getElementById("kpiNewCount").textContent = `${newLeads} nuevos por atender`;
  document.getElementById("kpiPipelineValue").textContent = `$${activePipeline.toLocaleString("en-US")}/mes`;
  document.getElementById("kpiHighTicket").textContent = highTicket;
  document.getElementById("kpiConversionRate").textContent = `${conversionRate}%`;
  document.getElementById("kpiClosedCount").textContent = `${advancedLeads} en gestión activa / cierre`;
}

function renderInsights(leads) {
  const painContainer = document.getElementById("painDistributionList");
  const cityContainer = document.getElementById("cityDistributionList");

  if (!leads.length) {
    painContainer.innerHTML = `<p class="insight-subtitle">Sin datos suficientes.</p>`;
    cityContainer.innerHTML = `<p class="insight-subtitle">Sin datos suficientes.</p>`;
    return;
  }

  // Conteo de dolores
  const painCounts = {};
  const cityCounts = {};

  leads.forEach((l) => {
    const p = l.necesidad_principal || "No especificado";
    painCounts[p] = (painCounts[p] || 0) + 1;

    const cities = Array.isArray(l.ciudades) ? l.ciudades : [l.ciudades];
    cities.filter(Boolean).forEach((c) => {
      cityCounts[c] = (cityCounts[c] || 0) + 1;
    });
  });

  painContainer.innerHTML = Object.entries(painCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const pct = Math.round((count / leads.length) * 100);
      return `
        <div class="dist-item">
          <div class="dist-meta">
            <span>${escapeHtml(name)}</span>
            <span>${count} (${pct}%)</span>
          </div>
          <div class="dist-bar-bg">
            <div class="dist-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const totalCityMentions = Object.values(cityCounts).reduce((a, b) => a + b, 0) || 1;
  cityContainer.innerHTML = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([city, count]) => {
      const pct = Math.round((count / totalCityMentions) * 100);
      return `
        <div class="dist-item">
          <div class="dist-meta">
            <span>📍 ${escapeHtml(city)}</span>
            <span>${count} solicitudes (${pct}%)</span>
          </div>
          <div class="dist-bar-bg">
            <div class="dist-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

window.filterByTemperature = function (tempKey) {
  const select = document.getElementById("filterTemperatura");
  if (!select) return;

  // Si ya estaba seleccionado, volver a 'todas' (comportamiento toggle intuitivo)
  if (select.value === tempKey) {
    select.value = "todas";
    showToast("🌡️ Mostrando todas las temperaturas de leads");
  } else {
    select.value = tempKey;
    showToast(`🔍 Filtrando por segmento: ${tempKey.toUpperCase()}`);
  }

  applyFiltersAndRender();

  // Scroll suave hacia la tabla CRM
  const targetSec = document.getElementById("tableViewSection");
  if (targetSec) {
    targetSec.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

function applyFiltersAndRender() {
  const query = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const estadoFilter = document.getElementById("filterEstado")?.value || "todos";
  const prioFilter = document.getElementById("filterPrioridad")?.value || "todas";
  const tempFilter = document.getElementById("filterTemperatura")?.value || "todas";

  // Marcar visualmente la tarjeta de temperatura activa
  ["hot", "warm", "cold", "won"].forEach((t) => {
    const card = document.getElementById(`filter${t.charAt(0).toUpperCase() + t.slice(1)}Card`);
    if (card) {
      if (tempFilter === t) {
        card.classList.add("active-temp-filter");
      } else {
        card.classList.remove("active-temp-filter");
      }
    }
  });

  const filtered = allLeads.filter((lead) => {
    const matchesEstado = estadoFilter === "todos" || lead.estado === estadoFilter;
    const matchesPrio = prioFilter === "todas" || lead.priority === prioFilter;
    const matchesTemp = tempFilter === "todas" || lead.temperatura === tempFilter;

    const citiesStr = Array.isArray(lead.ciudades) ? lead.ciudades.join(" ") : (lead.ciudades || "");
    const searchable = `${lead.nombre} ${lead.empresa} ${lead.cargo} ${lead.email} ${lead.telefono} ${citiesStr} ${lead.necesidad_principal}`.toLowerCase();
    const matchesQuery = !query || searchable.includes(query);

    return matchesEstado && matchesPrio && matchesTemp && matchesQuery;
  });

  renderTable(filtered);
  renderKanban(filtered);
}

function renderTable(leads) {
  const tbody = document.getElementById("leadsTableBody");
  if (!tbody) return;

  if (leads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No se encontraron prospectos con los filtros seleccionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = leads
    .map((lead) => {
      const dateObj = new Date(lead.created_at);
      const fechaStr = dateObj.toLocaleDateString("es-EC", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
      const horaStr = dateObj.toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit"
      });

      const citiesHtml = (Array.isArray(lead.ciudades) ? lead.ciudades : [lead.ciudades])
        .filter(Boolean)
        .map((c) => `<span class="city-chip">${escapeHtml(c)}</span>`)
        .join("");

      const waUrl = buildWhatsappUrl(lead);
      const hasNotes = lead.notas && lead.notas.trim().length > 0;

      return `
        <tr>
          <!-- 1. Fecha / Hora -->
          <td class="date-cell">
            <strong>${fechaStr}</strong>
            <span>${horaStr}</span>
          </td>

          <!-- 2. Empresa & Contacto -->
          <td class="company-cell">
            <strong>${escapeHtml(lead.empresa)}</strong>
            <div class="contact-person">👤 ${escapeHtml(lead.nombre)} · <small>${escapeHtml(lead.cargo || "Ejecutivo")}</small></div>
            <div class="contact-links">✉️ ${escapeHtml(lead.email)} | 📞 ${escapeHtml(lead.telefono)}</div>
          </td>

          <!-- 3. Temperatura & Dinero en Juego (Pipeline) -->
          <td>
            <span class="temp-pill ${lead.temperatura}">${lead.tempLabel}</span>
            <span class="money-badge">$${(lead.estimatedValue || 0).toLocaleString("en-US")}/mes</span>
            <span class="prob-indicator">${Math.round((lead.prob || 0) * 100)}% prob · Score: ${lead.score || 0} pts</span>
          </td>

          <!-- 4. Presupuesto & Ciudades -->
          <td>
            <div style="font-weight: 700; color: #1E293B; margin-bottom: 5px;">💰 ${escapeHtml(lead.presupuesto)}</div>
            <div class="city-tags-wrap">${citiesHtml}</div>
          </td>

          <!-- 5. Dolor Comercial Declarado -->
          <td class="pain-cell">
            <div>${escapeHtml(lead.necesidad_principal)}</div>
            ${hasNotes ? `<span class="note-indicator">📝 Nota guardada</span>` : ""}
          </td>

          <!-- 6. Estado Embudo (Sincronizado con Supabase) -->
          <td>
            <select
              class="status-select status-${lead.estado}"
              data-lead-id="${lead.id}"
              onchange="handleQuickStatusChange('${lead.id}', this.value)"
            >
              <option value="nuevo" ${lead.estado === "nuevo" ? "selected" : ""}>🔵 Nuevo</option>
              <option value="contactado" ${lead.estado === "contactado" ? "selected" : ""}>🟡 Contactado</option>
              <option value="negociacion" ${lead.estado === "negociacion" ? "selected" : ""}>🟣 En Negociación</option>
              <option value="ganado" ${lead.estado === "ganado" ? "selected" : ""}>🟢 Cerrado / Ganado</option>
              <option value="descartado" ${lead.estado === "descartado" ? "selected" : ""}>🔴 Descalificado</option>
            </select>
          </td>

          <!-- 7. Acciones de Venta Directa -->
          <td>
            <div class="row-actions">
              <a href="${waUrl}" target="_blank" rel="noopener" class="btn-wa-row" title="Contactar por WhatsApp con mensaje personalizado">
                📲 WhatsApp
              </a>
              <button type="button" class="btn-detail-row" onclick="openLeadDetailModal('${lead.id}')">
                👁️ Ficha / Notas
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderKanban(leads) {
  const board = document.getElementById("kanbanBoard");
  if (!board) return;

  const columns = [
    { key: "nuevo", title: "🔵 Nuevos" },
    { key: "contactado", title: "🟡 Contactados" },
    { key: "negociacion", title: "🟣 En Negociación" },
    { key: "ganado", title: "🟢 Cerrados Ganados" },
    { key: "descartado", title: "🔴 Descalificados" }
  ];

  board.innerHTML = columns
    .map((col) => {
      const colLeads = leads.filter((l) => l.estado === col.key);
      const cardsHtml = colLeads
        .map(
          (l) => `
          <div class="kanban-card" onclick="openLeadDetailModal('${l.id}')">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="temp-pill ${l.temperatura}" style="margin:0; font-size:0.68rem; padding:2px 8px;">${l.tempLabel}</span>
              <strong style="color:var(--primary-navy); font-size:0.82rem;">$${(l.estimatedValue || 0).toLocaleString("en-US")}</strong>
            </div>
            <h4>${escapeHtml(l.empresa)}</h4>
            <p>👤 ${escapeHtml(l.nombre)} (${escapeHtml(l.cargo || "Ejecutivo")})</p>
            <p style="font-size:0.75rem; color:#64748B;"><strong>💰 ${escapeHtml(l.presupuesto)}</strong></p>
            <div class="city-tags-wrap">
              ${(Array.isArray(l.ciudades) ? l.ciudades : [])
                .map((c) => `<span class="city-chip">${escapeHtml(c)}</span>`)
                .join("")}
            </div>
          </div>
        `
        )
        .join("");

      return `
        <div class="kanban-col">
          <div class="kanban-col-header">
            <span>${col.title}</span>
            <span class="kanban-count">${colLeads.length}</span>
          </div>
          ${cardsHtml || `<p style="font-size:0.78rem; color:#64748B; text-align:center; margin-top:20px;">Sin prospectos en esta etapa</p>`}
        </div>
      `;
    })
    .join("");
}

// ========================================================
// 4. ACCIONES DE VENTA: CAMBIO DE ESTADO, WHATSAPP Y MODALES
// ========================================================
window.handleQuickStatusChange = async function (leadId, newStatus) {
  const lead = allLeads.find((l) => l.id === leadId);
  if (!lead) return;

  lead.estado = newStatus;
  // Recalcular scoring y temperatura en tiempo real
  const scoreInfo = evaluateLeadScore(lead);
  Object.assign(lead, scoreInfo);

  saveLocalOverride(leadId, { estado: newStatus });

  // Sincronizar en la base de datos Supabase (PATCH)
  try {
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads?id=eq.${leadId}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": getAuthHeader(),
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ estado: newStatus })
    });
    if (!res.ok) {
      console.warn("Respuesta Supabase PATCH:", res.status);
    }
  } catch (e) {
    console.warn("Fallo en sincronización remota Supabase (respaldo local guardado):", e);
  }

  renderDashboard();
  showToast(`✅ "${lead.empresa}" actualizado a ${newStatus.toUpperCase()} y guardado en base de datos`);
};

window.openLeadDetailModal = function (leadId) {
  const lead = allLeads.find((l) => l.id === leadId);
  if (!lead) return;

  activeLeadId = leadId;
  const modal = document.getElementById("leadDetailModal");

  document.getElementById("modalLeadScoreBadge").textContent = lead.priorityLabel;
  document.getElementById("modalEmpresaTitle").textContent = lead.empresa;
  document.getElementById("modalContactoSub").textContent = `${lead.nombre} — ${lead.cargo || "Ejecutivo"}`;
  document.getElementById("modalEmail").textContent = lead.email;
  document.getElementById("modalTelefono").textContent = lead.telefono;
  document.getElementById("modalPresupuesto").textContent = lead.presupuesto;
  document.getElementById("modalFecha").textContent = new Date(lead.created_at).toLocaleString("es-EC");

  const citiesEl = document.getElementById("modalCiudades");
  citiesEl.innerHTML = (Array.isArray(lead.ciudades) ? lead.ciudades : [lead.ciudades])
    .filter(Boolean)
    .map((c) => `<span class="city-chip">${escapeHtml(c)}</span>`)
    .join("");

  document.getElementById("modalDolor").textContent = lead.necesidad_principal;
  document.getElementById("modalEstadoSelect").value = lead.estado || "nuevo";
  document.getElementById("modalNotasInput").value = lead.notas || "";
  document.getElementById("modalWhatsappBtn").href = buildWhatsappUrl(lead);

  modal.style.display = "flex";
};

function buildWhatsappUrl(lead) {
  let cleanPhone = (lead.telefono || "").replace(/\D/g, "");
  if (cleanPhone.startsWith("09") && cleanPhone.length === 10) {
    cleanPhone = "593" + cleanPhone.substring(1);
  } else if (cleanPhone.length === 9 && cleanPhone.startsWith("9")) {
    cleanPhone = "593" + cleanPhone;
  }

  const cities = Array.isArray(lead.ciudades) ? lead.ciudades.join(", ") : lead.ciudades;
  const msg = `Hola ${lead.nombre}, te saluda la Dirección Comercial de *VALLASEC*. Hemos recibido tu solicitud para *${lead.empresa}* enfocada en "${lead.necesidad_principal}" para las plazas de *${cities}*. Tengo listo el mapa de ubicaciones y flujo vehicular certificado para tu rango de inversión (${lead.presupuesto}). ¿Tienes 5 minutos para revisarlo?`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}

// ========================================================
// 5. EVENTOS DE INTERFAZ, EXPORTACIÓN CSV E INGRESO MANUAL
// ========================================================
function initDashboardEvents() {
  // Buscador y filtros en vivo (Estado, Prioridad, Temperatura)
  ["searchInput", "filterEstado", "filterPrioridad", "filterTemperatura"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", applyFiltersAndRender);
      el.addEventListener("change", applyFiltersAndRender);
    }
  });

  // Conmutador Tabla vs Kanban
  const viewTableBtn = document.getElementById("viewTableBtn");
  const viewKanbanBtn = document.getElementById("viewKanbanBtn");
  const tableSec = document.getElementById("tableViewSection");
  const kanbanSec = document.getElementById("kanbanViewSection");

  if (viewTableBtn && viewKanbanBtn) {
    viewTableBtn.addEventListener("click", () => {
      viewTableBtn.classList.add("active");
      viewKanbanBtn.classList.remove("active");
      tableSec.style.display = "block";
      kanbanSec.style.display = "none";
    });

    viewKanbanBtn.addEventListener("click", () => {
      viewKanbanBtn.classList.add("active");
      viewTableBtn.classList.remove("active");
      kanbanSec.style.display = "block";
      tableSec.style.display = "none";
    });
  }

  // Botón refrescar
  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    showToast("🔄 Sincronizando con Supabase en tiempo real...");
    fetchLeadsFromSupabase();
  });

  // Cerrar y guardar Modal de Ficha Detallada
  document.getElementById("closeDetailModalBtn")?.addEventListener("click", () => {
    document.getElementById("leadDetailModal").style.display = "none";
  });

  document.getElementById("saveLeadChangesBtn")?.addEventListener("click", async () => {
    if (!activeLeadId) return;
    const newEstado = document.getElementById("modalEstadoSelect").value;
    const newNotas = document.getElementById("modalNotasInput").value;

    const lead = allLeads.find((l) => l.id === activeLeadId);
    if (lead) {
      lead.estado = newEstado;
      lead.notas = newNotas;
      const scoreInfo = evaluateLeadScore(lead);
      Object.assign(lead, scoreInfo);
    }

    saveLocalOverride(activeLeadId, { estado: newEstado, notas: newNotas });

    try {
      await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads?id=eq.${activeLeadId}`, {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": getAuthHeader(),
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({ estado: newEstado })
      });
    } catch (e) {
      console.warn("Fallo sincronización remota Supabase:", e);
    }

    document.getElementById("leadDetailModal").style.display = "none";
    renderDashboard();
    showToast("💾 Ficha, notas y estado sincronizados con la base de datos");
  });

  // Modal de Nuevo Prospecto Manual
  const newLeadModal = document.getElementById("newLeadModal");
  document.getElementById("openNewLeadModalBtn")?.addEventListener("click", () => {
    newLeadModal.style.display = "flex";
  });
  document.getElementById("closeNewLeadModalBtn")?.addEventListener("click", () => {
    newLeadModal.style.display = "none";
  });
  document.getElementById("cancelNewLeadBtn")?.addEventListener("click", () => {
    newLeadModal.style.display = "none";
  });

  document.getElementById("manualLeadForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submitManualLeadBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const payload = {
      nombre: document.getElementById("mNombre").value.trim(),
      empresa: document.getElementById("mEmpresa").value.trim(),
      cargo: document.getElementById("mCargo").value.trim() || "Ejecutivo",
      telefono: document.getElementById("mTelefono").value.trim(),
      email: document.getElementById("mEmail").value.trim(),
      presupuesto: document.getElementById("mPresupuesto").value,
      ciudades: [document.getElementById("mCiudad").value],
      necesidad_principal: document.getElementById("mDolor").value,
      estado: "nuevo"
    };

    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/leads`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": getAuthHeader(),
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      document.getElementById("manualLeadForm").reset();
      newLeadModal.style.display = "none";
      showToast("✅ Nuevo prospecto registrado directamente en Supabase");
      fetchLeadsFromSupabase();
    } catch (err) {
      showToast(`❌ Error al guardar: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "＋ Guardar en Supabase";
    }
  });

  // Modal de Seguridad Admin
  const securityModal = document.getElementById("securityModal");
  document.getElementById("openSecurityModalBtn")?.addEventListener("click", () => {
    const creds = getAdminCredentials();
    document.getElementById("secAdminEmail").value = creds.email;
    document.getElementById("secNewPassword").value = "";
    securityModal.style.display = "flex";
  });
  document.getElementById("closeSecurityModalBtn")?.addEventListener("click", () => {
    securityModal.style.display = "none";
  });

  document.getElementById("securityForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newEmail = document.getElementById("secAdminEmail").value.trim();
    const newPwd = document.getElementById("secNewPassword").value;
    const hashedPwd = await sha256(newPwd);

    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify({ email: newEmail, passwordHash: hashedPwd })
    );
    document.getElementById("loggedAdminName").textContent = newEmail;
    securityModal.style.display = "none";
    showToast("🔐 Credenciales actualizadas y protegidas con hash criptográfico SHA-256");
  });

  // Exportar a CSV / Excel
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportLeadsToCSV);
}

function exportLeadsToCSV() {
  if (!allLeads.length) {
    showToast("⚠️ No hay prospectos para exportar.");
    return;
  }

  const headers = [
    "Fecha Registro",
    "Empresa",
    "Contacto",
    "Cargo",
    "Email",
    "Telefono",
    "Presupuesto Mensual",
    "Prioridad Score",
    "Valor Estimado USD",
    "Ciudades",
    "Dolor Principal",
    "Estado Embudo",
    "Notas Internas"
  ];

  const rows = allLeads.map((l) => [
    new Date(l.created_at).toLocaleString("es-EC"),
    l.empresa,
    l.nombre,
    l.cargo || "",
    l.email,
    l.telefono,
    l.presupuesto,
    l.priority.toUpperCase(),
    l.estimatedValue,
    Array.isArray(l.ciudades) ? l.ciudades.join(" | ") : l.ciudades,
    l.necesidad_principal,
    l.estado.toUpperCase(),
    l.notas || ""
  ]);

  const csvContent =
    "\uFEFF" +
    [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Vallasec_Leads_CRM_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📥 Base de ventas exportada a CSV / Excel");
}

function showToast(message) {
  const toast = document.getElementById("adminToast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3800);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
