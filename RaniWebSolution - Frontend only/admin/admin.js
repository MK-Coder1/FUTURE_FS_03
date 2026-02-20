const leadCountEl = document.getElementById("leadCount");
const paymentCountEl = document.getElementById("paymentCount");
const paymentSuccessEl = document.getElementById("paymentSuccess");
const paymentPendingEl = document.getElementById("paymentPending");
const paymentFailedEl = document.getElementById("paymentFailed");
const revenueEl = document.getElementById("revenueTotal");
const leadsBody = document.getElementById("leadsBody");
const paymentsBody = document.getElementById("paymentsBody");
const refreshBtn = document.getElementById("refreshBtn");

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const setText = (el, value) => {
  if (el) el.textContent = value;
};

const renderLeads = (items) => {
  leadsBody.innerHTML = "";
  if (!items.length) {
    const row = document.createElement("tr");
    row.innerHTML = "<td colspan=\"7\">No leads yet.</td>";
    leadsBody.appendChild(row);
    return;
  }
  items.forEach((lead) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(lead.createdAt)}</td>
      <td>${lead.name || "-"}</td>
      <td>${lead.email || "-"}</td>
      <td>${lead.phone || "-"}</td>
      <td>${lead.business || "-"}</td>
      <td>${lead.rating || "-"}</td>
      <td>${lead.source || "-"}</td>
    `;
    leadsBody.appendChild(row);
  });
};

const renderPayments = (items, currency) => {
  paymentsBody.innerHTML = "";
  if (!items.length) {
    const row = document.createElement("tr");
    row.innerHTML = "<td colspan=\"5\">No payments yet.</td>";
    paymentsBody.appendChild(row);
    return;
  }
  items.forEach((payment) => {
    const status = payment.status || "pending";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(payment.createdAt)}</td>
      <td>${payment.planLabel || payment.planId || "-"}</td>
      <td>${(payment.amount || 0).toLocaleString()} ${currency || ""}</td>
      <td><span class="status ${status}">${status}</span></td>
      <td>${payment.orderId || "-"}</td>
    `;
    paymentsBody.appendChild(row);
  });
};

const loadDashboard = async () => {
  try {
    const [summaryRes, leadsRes, paymentsRes] = await Promise.all([
      fetch("/api/admin/summary"),
      fetch("/api/admin/leads"),
      fetch("/api/admin/payments"),
    ]);

    const summary = await summaryRes.json();
    const leads = await leadsRes.json();
    const payments = await paymentsRes.json();

    if (!summary.ok) {
      throw new Error(summary.error || "Summary error");
    }

    setText(leadCountEl, summary.leads || 0);
    setText(paymentCountEl, summary.payments?.total || 0);
    setText(paymentSuccessEl, summary.payments?.success || 0);
    setText(paymentPendingEl, summary.payments?.pending || 0);
    setText(paymentFailedEl, summary.payments?.failed || 0);
    setText(
      revenueEl,
      `${(summary.revenue || 0).toLocaleString()} ${summary.currency || ""}`
    );

    renderLeads(leads.items || []);
    renderPayments(payments.items || [], summary.currency);
  } catch (error) {
    console.error("Admin dashboard error:", error);
  }
};

refreshBtn?.addEventListener("click", loadDashboard);
loadDashboard();
