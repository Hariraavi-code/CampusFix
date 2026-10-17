
"use strict";

const $ = (selector) => document.querySelector(selector);

const authScreen = $("#auth-screen");
const appShell = $("#app-shell");
const loginForm = $("#login-form");
const registerForm = $("#register-form");
const authTitle = $("#auth-title");
const authSwitch = $("#auth-switch");

let currentUser = null;
let complaints = [];
let authMode = "login";

const STATUS_OPTIONS = ["Open", "In Progress", "Resolved"];
const THEME_KEY = "campusfix-theme";
const MODE_KEY = "campusfix-mode";

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function initials(name) {
  return String(name || "CampusFix")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function setMessage(selector, message, isError = false) {
  const element = $(selector);
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("success", !isError && Boolean(message));
}

// --------------------------------------------------
// APPEARANCE SETTINGS
// --------------------------------------------------

function applyAppearance() {
  let savedMode = "light";
  let savedTheme = "purple";

  try {
    savedMode = localStorage.getItem(MODE_KEY) || "light";
    savedTheme = localStorage.getItem(THEME_KEY) || "purple";
  } catch (error) {
    console.warn("Could not read appearance preferences.", error);
  }

  if (!["light", "dark"].includes(savedMode)) {
    savedMode = "light";
  }

  if (!["purple", "blue", "green"].includes(savedTheme)) {
    savedTheme = "purple";
  }

  document.documentElement.dataset.mode = savedMode;
  document.documentElement.dataset.theme = savedTheme;

  document.querySelectorAll("[data-mode]").forEach((button) => {
    const selected = button.dataset.mode === savedMode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  document.querySelectorAll("[data-theme]").forEach((button) => {
    const selected = button.dataset.theme === savedTheme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function saveAppearanceMode(mode) {
  if (!["light", "dark"].includes(mode)) return;

  document.documentElement.dataset.mode = mode;

  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch (error) {
    console.warn("Could not save theme mode.", error);
  }

  applyAppearance();
  setMessage("#settings-message", `${mode === "dark" ? "Dark" : "Light"} mode selected.`);
}

function saveAccentTheme(theme) {
  if (!["purple", "blue", "green"].includes(theme)) return;

  document.documentElement.dataset.theme = theme;

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.warn("Could not save accent theme.", error);
  }

  applyAppearance();
  setMessage(
    "#settings-message",
    `${theme.charAt(0).toUpperCase() + theme.slice(1)} theme selected.`
  );
}

// --------------------------------------------------
// SETTINGS PAGE NAVIGATION
// --------------------------------------------------

function closeProfileMenu() {
  const dropdown = $("#profile-dropdown");
  const button = $("#profile-menu-button");

  if (dropdown) dropdown.classList.add("hidden");
  if (button) button.setAttribute("aria-expanded", "false");
}

function setActiveNav(page) {
  document.querySelectorAll(".side-nav .nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === page);
  });
}

function showSettingsPage() {
  const page = $("#settings-page");
  if (!page) return;

  // Hide the dashboard content while Settings is open.
  [
    ".welcome-row",
    ".stats-grid",
    ".content-grid",
    "#complaints",
    ".footer"
  ].forEach((selector) => {
    const element = $(selector);
    if (element) element.classList.add("hidden");
  });

  page.classList.remove("hidden");
  $("#workspace-title").textContent = "Settings";
  setActiveNav("settings-page");
  closeProfileMenu();

  updateSettingsAccount();
  applyAppearance();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboardPage(pageName) {
  const settingsPage = $("#settings-page");
  if (settingsPage) settingsPage.classList.add("hidden");

  [
    ".welcome-row",
    ".stats-grid",
    ".content-grid",
    "#complaints",
    ".footer"
  ].forEach((selector) => {
    const element = $(selector);
    if (element) element.classList.remove("hidden");
  });

  const pageTitles = {
    overview: currentUser?.role === "student" ? "Student overview" : "Staff overview",
    complaints: currentUser?.role === "student" ? "My complaints" : "All complaints",
    "new-complaint": "Report an issue"
  };

  $("#workspace-title").textContent = pageTitles[pageName] || "Overview";
  setActiveNav(pageName);
  closeProfileMenu();

  const target = pageName === "overview"
    ? $("#overview")
    : pageName === "complaints"
      ? $("#complaints")
      : $("#new-complaint");

  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateSettingsAccount() {
  if (!currentUser) return;

  const name = currentUser.name || "Campus user";
  const role = String(currentUser.role || "student");
  const email = currentUser.email || "";

  if ($("#settings-name")) $("#settings-name").textContent = name;
  if ($("#settings-email")) $("#settings-email").textContent = email;
  if ($("#settings-role")) {
    $("#settings-role").textContent =
      role.charAt(0).toUpperCase() + role.slice(1);
  }
  if ($("#settings-avatar")) {
    $("#settings-avatar").textContent = initials(name);
  }
}

// --------------------------------------------------
// LOGIN AND REGISTRATION
// --------------------------------------------------

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";

  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);

  authTitle.innerHTML = isLogin
    ? "Welcome back.<br><span>Let's fix it.</span>"
    : "Join your campus.<br><span>Let's improve it.</span>";

  $(".auth-intro").textContent = isLogin
    ? "Sign in to report campus issues and track their progress."
    : "Create your student account to report and track campus issues.";

  authSwitch.innerHTML = isLogin
    ? 'New to CampusFix? <button type="button" id="show-register">Create a student account</button>'
    : 'Already have an account? <button type="button" id="show-login">Sign in</button>';

  setMessage("#login-message", "");
  setMessage("#register-message", "");
}

function showAuth() {
  currentUser = null;
  closeProfileMenu();

  authScreen.classList.remove("hidden");
  appShell.classList.add("hidden");

  setAuthMode("login");
}

function showDashboard(user) {
  currentUser = user;

  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  const role = String(user.role || "student").toLowerCase();
  const isStudent = role === "student";
  const isAdmin = role === "admin";
  const isStaff = role === "staff" || isAdmin;
  const displayName = user.name || "Campus user";

  $("#profile-name").textContent = displayName;
  $("#profile-role").textContent = role.charAt(0).toUpperCase() + role.slice(1);
  $("#profile-avatar").textContent = initials(displayName);
  $("#top-avatar").textContent = initials(displayName);
  $("#student-name").value = isStudent ? displayName : "";

  if ($("#dropdown-profile-name")) {
    $("#dropdown-profile-name").textContent = displayName;
  }
  if ($("#dropdown-profile-role")) {
    $("#dropdown-profile-role").textContent =
      role.charAt(0).toUpperCase() + role.slice(1);
  }

  $("#welcome-heading").innerHTML = isStudent
    ? "Your campus.<br><span>Working better.</span>"
    : "Campus support.<br><span>Control center.</span>";

  $("#welcome-intro").textContent = isStudent
    ? "Report an issue, follow its progress, and help make campus life better."
    : "Review campus complaints and help your community resolve issues.";

  $("#complaints-heading").textContent = isStudent
    ? "My complaints"
    : "All complaints";

  $("#complaints-description").textContent = isStudent
    ? "Review your reports and track their progress."
    : "Review reports from the campus community and update their status.";

  $("#complaints-nav-label").textContent = isStudent
    ? "My complaints"
    : "All complaints";

  document.querySelectorAll(".student-only").forEach((element) => {
    element.classList.toggle("hidden", !isStudent);
  });

  $("#workspace-title").textContent =
    isStaff ? "Staff overview" : "Student overview";

  showDashboardPage("overview");
  updateSettingsAccount();
  applyAppearance();

  loadDashboard().catch((error) => {
    console.error(error);
    alert(`Unable to load dashboard: ${error.message}`);
  });
}

async function handleLogin(event) {
  event.preventDefault();

  const button = $("#login-button");
  button.disabled = true;
  button.textContent = "Signing in...";
  setMessage("#login-message", "");

  const formData = new FormData(loginForm);

  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });

    const user = result.user || result;

    if (!user || !user.id || !user.role) {
      throw new Error("Login response did not include the user details.");
    }

    loginForm.reset();
    showDashboard(user);
  } catch (error) {
    setMessage("#login-message", error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Sign in →";
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const button = $("#register-button");
  button.disabled = true;
  button.textContent = "Creating account...";
  setMessage("#register-message", "");

  const formData = new FormData(registerForm);

  try {
    const result = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password")
      })
    });

    registerForm.reset();

    setMessage(
      "#register-message",
      result.message || "Account created. Please sign in."
    );

    setTimeout(() => {
      setAuthMode("login");
      const emailInput = loginForm.querySelector('[name="email"]');
      if (emailInput) emailInput.value = formData.get("email");
    }, 900);
  } catch (error) {
    setMessage("#register-message", error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Create student account →";
  }
}

async function handleLogout() {
  closeProfileMenu();

  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("Logout request failed:", error.message);
  } finally {
    showAuth();
  }
}

// --------------------------------------------------
// DASHBOARD DATA
// --------------------------------------------------

async function loadDashboard() {
  await Promise.all([loadStats(), loadComplaints()]);
}

async function loadStats() {
  const stats = await api("/api/complaints/stats");

  $("#total-count").textContent = stats.total ?? stats.totalComplaints ?? 0;
  $("#open-count").textContent = stats.open ?? stats.openComplaints ?? 0;
  $("#progress-count").textContent =
    stats.inProgress ?? stats.in_progress ?? stats.progress ?? 0;
  $("#resolved-count").textContent =
    stats.resolved ?? stats.resolvedComplaints ?? 0;
}

async function loadComplaints() {
  const body = $("#complaints-body");
  body.innerHTML =
    '<tr><td colspan="6" class="empty-cell">Loading complaints...</td></tr>';

  const result = await api("/api/complaints");

  complaints = Array.isArray(result)
    ? result
    : Array.isArray(result.complaints)
      ? result.complaints
      : [];

  renderComplaints();
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function normalizeStatus(status) {
  const value = String(status || "Open").toLowerCase();

  if (
    value === "in progress" ||
    value === "in_progress" ||
    value === "inprogress"
  ) {
    return "In Progress";
  }

  if (
    value === "resolved" ||
    value === "closed" ||
    value === "completed"
  ) {
    return "Resolved";
  }

  return "Open";
}

function statusClass(status) {
  const value = normalizeStatus(status);

  if (value === "Resolved") return "resolved";
  if (value === "In Progress") return "in-progress";
  return "open";
}

function normalizePriority(priority) {
  const value = String(priority || "Medium").toLowerCase();

  if (value === "high") return "High";
  if (value === "low") return "Low";

  return "Medium";
}

function getComplaintId(complaint) {
  return complaint.id ?? complaint.complaintId ?? complaint.complaint_id;
}

function renderComplaints() {
  const body = $("#complaints-body");
  const searchTerm = $("#search-input").value.trim().toLowerCase();
  const selectedStatus = $("#status-filter").value;

  const role = String(currentUser?.role || "student").toLowerCase();
  const canUpdate = role === "staff" || role === "admin";
  const canDelete = role === "admin";

  const filtered = complaints.filter((complaint) => {
    const status = normalizeStatus(complaint.status);

    const searchable = [
      complaint.title,
      complaint.category,
      complaint.location,
      complaint.description,
      complaint.studentName,
      complaint.student_name,
      complaint.name
    ].join(" ").toLowerCase();

    const matchesSearch = searchable.includes(searchTerm);
    const matchesStatus =
      selectedStatus === "All" || status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  $("#results-count").textContent =
    `Showing ${filtered.length} complaint${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">
          No complaints found. Try changing your search or filter.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = filtered.map((complaint) => {
    const id = getComplaintId(complaint);
    const status = normalizeStatus(complaint.status);
    const priority = normalizePriority(complaint.priority);
    const title = complaint.title || complaint.category || "Campus issue";

    const statusControl = canUpdate
      ? `<select class="status-select" data-status-id="${escapeHtml(id)}"
           aria-label="Change status for ${escapeHtml(title)}">
           ${STATUS_OPTIONS.map((option) => `
             <option value="${option}" ${status === option ? "selected" : ""}>
               ${option}
             </option>`).join("")}
         </select>`
      : `<span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span>`;

    const deleteControl = canDelete
      ? `<button type="button" class="delete-button"
           data-delete-id="${escapeHtml(id)}">Delete</button>`
      : "";

    return `
      <tr>
        <td>
          <div class="complaint-title">${escapeHtml(title)}</div>
          <div class="complaint-category">${escapeHtml(complaint.category || "Other")}</div>
        </td>
        <td>${escapeHtml(complaint.location || "—")}</td>
        <td><span class="priority-badge ${priority.toLowerCase()}">${escapeHtml(priority)}</span></td>
        <td>${statusControl}</td>
        <td>${formatDate(complaint.createdAt || complaint.created_at || complaint.date)}</td>
        <td><div class="action-group">${deleteControl}</div></td>
      </tr>`;
  }).join("");

  body.querySelectorAll("[data-status-id]").forEach((select) => {
    select.addEventListener("change", async () => {
      await updateComplaintStatus(select.dataset.statusId, select.value, select);
    });
  });

  body.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteComplaint(button.dataset.deleteId);
    });
  });
}

// --------------------------------------------------
// COMPLAINT ACTIONS
// --------------------------------------------------

async function submitComplaint(event) {
  event.preventDefault();

  if (!currentUser || currentUser.role !== "student") {
    setMessage(
      "#form-message",
      "Only student accounts can submit complaints.",
      true
    );
    return;
  }

  const form = $("#complaint-form");
  const button = $("#submit-button");
  const formData = new FormData(form);

  const payload = {
    studentName: currentUser.name,
    category: formData.get("category"),
    title: formData.get("title"),
    location: formData.get("location"),
    description: formData.get("description"),
    priority: formData.get("priority")
  };

  button.disabled = true;
  button.textContent = "Submitting...";
  setMessage("#form-message", "");

  try {
    const result = await api("/api/complaints", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    form.reset();
    $("#student-name").value = currentUser.name || "";
    form.querySelector('[name="priority"]').value = "Medium";

    setMessage(
      "#form-message",
      result.message || "Complaint submitted successfully."
    );

    await loadDashboard();
  } catch (error) {
    setMessage("#form-message", error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Submit complaint →";
  }
}

async function updateComplaintStatus(id, status, select) {
  select.disabled = true;

  try {
    await api(`/api/complaints/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    await loadDashboard();
  } catch (error) {
    alert(`Could not update complaint: ${error.message}`);
    await loadComplaints();
  } finally {
    select.disabled = false;
  }
}

async function deleteComplaint(id) {
  if (!confirm("Are you sure you want to permanently delete this complaint?")) {
    return;
  }

  try {
    await api(`/api/complaints/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    await loadDashboard();
  } catch (error) {
    alert(`Could not delete complaint: ${error.message}`);
  }
}

// --------------------------------------------------
// RESTORE SESSION
// --------------------------------------------------

async function restoreSession() {
  try {
    const result = await api("/api/auth/me");
    const user = result.user || result;

    if (user && user.id && user.role) {
      showDashboard(user);
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

// --------------------------------------------------
// EVENT LISTENERS
// --------------------------------------------------

loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
$("#complaint-form").addEventListener("submit", submitComplaint);
$("#logout-button").addEventListener("click", handleLogout);

$("#refresh-button").addEventListener("click", () => {
  loadDashboard().catch((error) => alert(error.message));
});

$("#search-input").addEventListener("input", renderComplaints);
$("#status-filter").addEventListener("change", renderComplaints);

// Login/register toggle uses delegation because the button is recreated.
authSwitch.addEventListener("click", (event) => {
  if (event.target.closest("#show-register")) {
    setAuthMode("register");
  } else if (event.target.closest("#show-login")) {
    setAuthMode("login");
  }
});

// Sidebar navigation
document.querySelectorAll(".side-nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const page = link.dataset.page;

    if (page === "settings-page") {
      showSettingsPage();
    } else if (page) {
      showDashboardPage(page);
    }
  });
});

// Other links that navigate to the report form
document.querySelectorAll('a[href="#new-complaint"]:not(.side-nav a)').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!currentUser || currentUser.role !== "student") return;

    event.preventDefault();
    showDashboardPage("new-complaint");
  });
});

// Appearance mode buttons
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    saveAppearanceMode(button.dataset.mode);
  });
});

// Accent color buttons
document.querySelectorAll("[data-theme]").forEach((button) => {
  button.addEventListener("click", () => {
    saveAccentTheme(button.dataset.theme);
  });
});

// Profile menu
const profileMenuButton = $("#profile-menu-button");
const profileDropdown = $("#profile-dropdown");

if (profileMenuButton && profileDropdown) {
  profileMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const willOpen = profileDropdown.classList.contains("hidden");
    profileDropdown.classList.toggle("hidden", !willOpen);
    profileMenuButton.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".profile-menu-wrap")) {
      closeProfileMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProfileMenu();
  });
}

$("#dropdown-settings")?.addEventListener("click", showSettingsPage);
$("#dropdown-logout")?.addEventListener("click", handleLogout);

// Apply saved preferences immediately, including on the login screen.
applyAppearance();

// Start the app.
restoreSession();
