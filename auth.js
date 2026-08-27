(() => {
  "use strict";

  const ACCOUNTS_KEY = "osistec_accounts_v1";
  const SESSION_KEY = "osistec_session_v1";
  const PASSWORD_ITERATIONS = 150000;
  const encoder = new TextEncoder();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let currentUser = null;
  let initialized = false;

  function readAccounts() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeAccounts(accounts) {
    try {
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      return true;
    } catch {
      return false;
    }
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeSpaces(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function publicUser(account) {
    if (!account) return null;
    const { passwordHash, passwordSalt, passwordIterations, ...safeAccount } = account;
    return { ...safeAccount };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = window.atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function derivePassword(password, salt, iterations = PASSWORD_ITERATIONS) {
    if (!window.crypto?.subtle) {
      throw new Error("A criptografia local exige HTTPS ou localhost.");
    }
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations,
      },
      keyMaterial,
      256,
    );
    return bytesToBase64(new Uint8Array(bits));
  }

  async function createPasswordRecord(password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return {
      passwordHash: await derivePassword(password, salt),
      passwordSalt: bytesToBase64(salt),
      passwordIterations: PASSWORD_ITERATIONS,
    };
  }

  async function passwordMatches(password, account) {
    if (!account?.passwordHash || !account?.passwordSalt) return false;
    const candidate = await derivePassword(
      password,
      base64ToBytes(account.passwordSalt),
      Number(account.passwordIterations) || PASSWORD_ITERATIONS,
    );
    if (candidate.length !== account.passwordHash.length) return false;
    let difference = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      difference |= candidate.charCodeAt(index) ^ account.passwordHash.charCodeAt(index);
    }
    return difference === 0;
  }

  function createId() {
    if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getSessionId() {
    return window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY) || "";
  }

  function setSession(userId, remember) {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    const target = remember ? window.localStorage : window.sessionStorage;
    target.setItem(SESSION_KEY, userId);
  }

  function clearSession() {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  }

  function setMessage(element, message, type = "error") {
    if (!element) return;
    element.textContent = message;
    element.className = `form-message form-message--${type}`;
    element.hidden = !message;
  }

  function clearMessages() {
    $$(".form-message").forEach((element) => setMessage(element, ""));
  }

  function setBusy(form, busy, busyLabel) {
    const button = $("button[type='submit']", form);
    if (!button) return;
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
    form.setAttribute("aria-busy", String(busy));
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function emitAuthChange(user) {
    window.dispatchEvent(new CustomEvent("osistec:authchange", { detail: { user } }));
  }

  function fillProfile(user) {
    if (!user) return;
    const initial = normalizeSpaces(user.name).charAt(0).toUpperCase() || "U";
    const firstName = normalizeSpaces(user.name).split(" ")[0] || "Perfil";
    const isDoctor = user.role === "doctor";

    $("#profile-initial").textContent = initial;
    $("#profile-first-name").textContent = firstName;
    $("#header-role-label").textContent = isDoctor ? "Área médica" : "Área do paciente";
    $("#profile-dialog-initial").textContent = initial;
    $("#profile-dialog-name").textContent = user.name;
    $("#profile-dialog-role").textContent = isDoctor ? "Médico" : "Paciente";
    $("#profile-name").value = user.name || "";
    $("#profile-email").value = user.email || "";
    $("#profile-phone").value = user.phone || "";
    $("#profile-birth-date").value = user.birthDate || "";
    $("#profile-doctor-fields").hidden = !isDoctor;
    $("#profile-crm").value = user.crm || "";
    $("#profile-crm-state").value = user.crmState || "";
    $("#profile-specialty").value = user.specialty || "";
  }

  function presentUser(account) {
    currentUser = publicUser(account);
    fillProfile(currentUser);
    $("#auth-screen").hidden = true;
    $("#app-shell").hidden = false;
    document.body.classList.add("is-authenticated");
    emitAuthChange(currentUser);
  }

  function presentLogin(message = "") {
    currentUser = null;
    $("#app-shell").hidden = true;
    $("#auth-screen").hidden = false;
    document.body.classList.remove("is-authenticated");
    switchAuthView("login");
    if (message) setMessage($("#login-message"), message, "success");
    emitAuthChange(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function switchAuthView(view) {
    const isLogin = view !== "register";
    $("#login-form").hidden = !isLogin;
    $("#register-form").hidden = isLogin;
    $$("[data-auth-view]").forEach((button) => {
      const selected = button.dataset.authView === (isLogin ? "login" : "register");
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    clearMessages();
    window.setTimeout(() => {
      const firstInput = $(isLogin ? "#login-email" : "#register-name");
      firstInput?.focus({ preventScroll: true });
    }, 0);
  }

  function updateDoctorFields() {
    const role = $("input[name='register-role']:checked")?.value || "patient";
    const isDoctor = role === "doctor";
    $("#doctor-register-fields").hidden = !isDoctor;
    ["#register-crm", "#register-crm-state", "#register-specialty"].forEach((selector) => {
      $(selector).required = isDoctor;
    });
  }

  function validPassword(password) {
    return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
  }

  function validateCommonProfile({ name, phone, birthDate }) {
    if (normalizeSpaces(name).length < 3) return "Informe seu nome completo.";
    if (digitsOnly(phone).length < 10) return "Informe um telefone com DDD.";
    if (!birthDate) return "Informe a data de nascimento.";
    const birth = new Date(`${birthDate}T12:00:00`);
    if (Number.isNaN(birth.getTime()) || birth > new Date()) return "Informe uma data de nascimento válida.";
    return "";
  }

  function validateDoctor({ crm, crmState, specialty }) {
    if (digitsOnly(crm).length < 4) return "Informe um CRM válido para este protótipo.";
    if (!/^[A-Z]{2}$/.test(String(crmState || "").toUpperCase())) return "Informe a UF do CRM.";
    if (normalizeSpaces(specialty).length < 2) return "Informe a especialidade médica.";
    return "";
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("#login-message");
    const email = normalizeEmail($("#login-email").value);
    const password = $("#login-password").value;
    setMessage(message, "");

    const account = readAccounts().find((item) => normalizeEmail(item.email) === email);
    if (!account) {
      setMessage(message, "Conta não encontrada neste aparelho. Crie uma conta primeiro.");
      return;
    }

    setBusy(form, true, "Verificando…");
    try {
      const matches = await passwordMatches(password, account);
      if (!matches) {
        setMessage(message, "E-mail ou senha incorretos.");
        return;
      }
      setSession(account.id, $("#login-remember").checked);
      form.reset();
      $("#login-remember").checked = true;
      presentUser(account);
    } catch (error) {
      setMessage(message, error.message || "Não foi possível verificar a senha.");
    } finally {
      setBusy(form, false, "");
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("#register-message");
    const role = $("input[name='register-role']:checked")?.value || "patient";
    const values = {
      name: normalizeSpaces($("#register-name").value),
      email: normalizeEmail($("#register-email").value),
      phone: normalizeSpaces($("#register-phone").value),
      birthDate: $("#register-birth-date").value,
      crm: digitsOnly($("#register-crm").value),
      crmState: $("#register-crm-state").value.toUpperCase(),
      specialty: normalizeSpaces($("#register-specialty").value),
    };
    const password = $("#register-password").value;
    const confirmation = $("#register-confirm-password").value;
    setMessage(message, "");

    const profileError = validateCommonProfile(values);
    if (profileError) return setMessage(message, profileError);
    if (!/^\S+@\S+\.\S+$/.test(values.email)) return setMessage(message, "Informe um e-mail válido.");
    if (readAccounts().some((item) => normalizeEmail(item.email) === values.email)) {
      return setMessage(message, "Já existe uma conta com este e-mail neste aparelho.");
    }
    if (role === "doctor") {
      const doctorError = validateDoctor(values);
      if (doctorError) return setMessage(message, doctorError);
    }
    if (!validPassword(password)) {
      return setMessage(message, "A senha precisa ter 8 caracteres, maiúscula, minúscula e número.");
    }
    if (password !== confirmation) return setMessage(message, "As senhas não coincidem.");
    if (!$("#register-terms").checked) return setMessage(message, "Confirme que entende os limites do protótipo.");

    setBusy(form, true, "Criando conta…");
    try {
      const passwordRecord = await createPasswordRecord(password);
      const now = new Date().toISOString();
      const account = {
        id: createId(),
        role,
        ...values,
        crm: role === "doctor" ? values.crm : "",
        crmState: role === "doctor" ? values.crmState : "",
        specialty: role === "doctor" ? values.specialty : "",
        ...passwordRecord,
        createdAt: now,
        updatedAt: now,
      };
      const accounts = readAccounts();
      accounts.push(account);
      if (!writeAccounts(accounts)) throw new Error("Não foi possível salvar a conta neste navegador.");
      setSession(account.id, true);
      form.reset();
      $("input[name='register-role'][value='patient']").checked = true;
      updateDoctorFields();
      presentUser(account);
    } catch (error) {
      setMessage(message, error.message || "Não foi possível criar a conta.");
    } finally {
      setBusy(form, false, "");
    }
  }

  function openProfile() {
    if (!currentUser) return;
    fillProfile(currentUser);
    setMessage($("#profile-message"), "");
    openDialog($("#profile-dialog"));
  }

  function handleProfileSave(event) {
    event.preventDefault();
    if (!currentUser) return;
    const message = $("#profile-message");
    const values = {
      name: normalizeSpaces($("#profile-name").value),
      phone: normalizeSpaces($("#profile-phone").value),
      birthDate: $("#profile-birth-date").value,
      crm: digitsOnly($("#profile-crm").value),
      crmState: normalizeSpaces($("#profile-crm-state").value).toUpperCase(),
      specialty: normalizeSpaces($("#profile-specialty").value),
    };
    const profileError = validateCommonProfile(values);
    if (profileError) return setMessage(message, profileError);
    if (currentUser.role === "doctor") {
      const doctorError = validateDoctor(values);
      if (doctorError) return setMessage(message, doctorError);
    }

    const accounts = readAccounts();
    const index = accounts.findIndex((account) => account.id === currentUser.id);
    if (index < 0) return presentLogin("A conta não está mais disponível neste aparelho.");
    accounts[index] = {
      ...accounts[index],
      ...values,
      crm: currentUser.role === "doctor" ? values.crm : "",
      crmState: currentUser.role === "doctor" ? values.crmState : "",
      specialty: currentUser.role === "doctor" ? values.specialty : "",
      updatedAt: new Date().toISOString(),
    };
    if (!writeAccounts(accounts)) return setMessage(message, "Não foi possível salvar as alterações.");
    presentUser(accounts[index]);
    setMessage(message, "Perfil atualizado neste aparelho.", "success");
  }

  function logout() {
    closeDialog($("#profile-dialog"));
    clearSession();
    presentLogin("Você saiu da conta.");
  }

  function deleteAccount() {
    if (!currentUser) return;
    const confirmed = window.confirm("Excluir esta conta local e suas ações salvas neste aparelho?");
    if (!confirmed) return;
    const userId = currentUser.id;
    const accounts = readAccounts().filter((account) => account.id !== userId);
    if (!writeAccounts(accounts)) {
      setMessage($("#profile-message"), "Não foi possível excluir a conta.");
      return;
    }
    [
      `osistec_applications_${userId}`,
      `osistec_reservations_${userId}`,
      `osistec_checkins_${userId}`,
    ].forEach((key) => window.localStorage.removeItem(key));
    clearSession();
    closeDialog($("#profile-dialog"));
    presentLogin("Conta local excluída.");
  }

  async function handlePasswordReset(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("#reset-password-message");
    const email = normalizeEmail($("#reset-password-email").value);
    const password = $("#reset-password-new").value;
    const confirmation = $("#reset-password-confirm").value;
    setMessage(message, "");

    const accounts = readAccounts();
    const index = accounts.findIndex((account) => normalizeEmail(account.email) === email);
    if (index < 0) return setMessage(message, "Conta não encontrada neste aparelho.");
    if (!validPassword(password)) {
      return setMessage(message, "A senha precisa ter 8 caracteres, maiúscula, minúscula e número.");
    }
    if (password !== confirmation) return setMessage(message, "As senhas não coincidem.");

    setBusy(form, true, "Alterando…");
    try {
      const passwordRecord = await createPasswordRecord(password);
      accounts[index] = {
        ...accounts[index],
        ...passwordRecord,
        updatedAt: new Date().toISOString(),
      };
      if (!writeAccounts(accounts)) throw new Error("Não foi possível salvar a nova senha.");
      form.reset();
      closeDialog($("#reset-password-dialog"));
      $("#login-email").value = email;
      setMessage($("#login-message"), "Senha local alterada. Entre com a nova senha.", "success");
      $("#login-password").focus();
    } catch (error) {
      setMessage(message, error.message || "Não foi possível alterar a senha.");
    } finally {
      setBusy(form, false, "");
    }
  }

  function bindEvents() {
    $$("[data-auth-view]").forEach((button) => {
      button.addEventListener("click", () => switchAuthView(button.dataset.authView));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        switchAuthView(button.dataset.authView === "login" ? "register" : "login");
      });
    });
    $$("input[name='register-role']").forEach((input) => input.addEventListener("change", updateDoctorFields));
    $("#login-form").addEventListener("submit", handleLogin);
    $("#register-form").addEventListener("submit", handleRegister);
    $("#profile-form").addEventListener("submit", handleProfileSave);
    $("#reset-password-form").addEventListener("submit", handlePasswordReset);
    $("#forgot-password-button").addEventListener("click", () => {
      $("#reset-password-email").value = $("#login-email").value;
      setMessage($("#reset-password-message"), "");
      openDialog($("#reset-password-dialog"));
    });
    $("#profile-button").addEventListener("click", openProfile);
    $("#logout-button").addEventListener("click", logout);
    $("#delete-account-button").addEventListener("click", deleteAccount);
    $("[data-close-profile]").addEventListener("click", () => closeDialog($("#profile-dialog")));
    $("[data-close-reset]").addEventListener("click", () => closeDialog($("#reset-password-dialog")));

    const today = new Date().toISOString().slice(0, 10);
    $("#register-birth-date").max = today;
    $("#profile-birth-date").max = today;
    updateDoctorFields();
  }

  function init() {
    if (!initialized) {
      bindEvents();
      initialized = true;
    }
    const sessionId = getSessionId();
    const account = readAccounts().find((item) => item.id === sessionId);
    if (account) presentUser(account);
    else {
      if (sessionId) clearSession();
      presentLogin();
    }
    return currentUser;
  }

  window.OSISTECAuth = {
    init,
    getCurrentUser: () => (currentUser ? { ...currentUser } : null),
    openProfile,
    logout,
  };
})();
