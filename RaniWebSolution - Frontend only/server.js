import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import crypto from "crypto";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import nodemailer from "nodemailer";
import Datastore from "nedb-promises";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "data");
await fs.mkdir(dataDir, { recursive: true });

const leadsDb = Datastore.create({
  filename: path.join(dataDir, "leads.db"),
  autoload: true,
});
const paymentsDb = Datastore.create({
  filename: path.join(dataDir, "payments.db"),
  autoload: true,
});

await leadsDb.ensureIndex({ fieldName: "createdAt" });
await paymentsDb.ensureIndex({ fieldName: "createdAt" });
await paymentsDb.ensureIndex({ fieldName: "orderId", unique: true, sparse: true });

const app = express();
const PORT = process.env.PORT || 3000;

const PLAN_PRICES = {
  starter: 4999,
  growth: 12999,
  scale: 24999,
};

const PLAN_LABELS = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_CURRENCY = (process.env.RAZORPAY_CURRENCY || "INR").toUpperCase();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const PAYPAL_CURRENCY = (
  process.env.PAYPAL_CURRENCY || RAZORPAY_CURRENCY || "USD"
).toUpperCase();
const PAYPAL_BASE_URL =
  PAYPAL_ENV === "live" || PAYPAL_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = (process.env.SMTP_SECURE || "true") === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_TO = process.env.MAIL_TO || SMTP_USER || "";

const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";

const mailTransport =
  SMTP_USER && SMTP_PASS && MAIL_TO
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

const razorpay =
  RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      })
    : null;

const getPayPalAccessToken = async () => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal not configured");
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString(
    "base64"
  );

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || "PayPal authorization failed");
  }
  return data.access_token;
};

const formatPayPalAmount = (value) => Number(value || 0).toFixed(2);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const requireAdmin = (req, res, next) => {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).send("Admin credentials missing");
  }
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).send("Authentication required");
  }
  const decoded = Buffer.from(header.split(" ")[1], "base64").toString();
  const [user, pass] = decoded.split(":");
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).send("Invalid credentials");
  }
  return next();
};

const sendLeadEmail = async (lead) => {
  if (!mailTransport) return false;
  try {
    await mailTransport.sendMail({
      from: SMTP_USER,
      to: MAIL_TO,
      subject: "New Lead - RaniWebSolution",
      text: [
        `Name: ${lead.name || "N/A"}`,
        `Email: ${lead.email}`,
        `Phone: ${lead.phone || "N/A"}`,
        `Business: ${lead.business || "N/A"}`,
        `Message: ${lead.message || "N/A"}`,
        `Feedback: ${lead.feedback || "N/A"}`,
        `Rating: ${lead.rating || "N/A"}`,
        `Source: ${lead.source}`,
        `Time: ${lead.createdAt}`,
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("Lead email error:", error);
    return false;
  }
};

const sendClientThankYou = async (lead) => {
  if (!mailTransport || !lead.email) return false;
  try {
    await mailTransport.sendMail({
      from: SMTP_USER,
      to: lead.email,
      subject: "Thanks for contacting RaniWebSolution",
      text: [
        `Hi ${lead.name || "there"},`,
        "",
        "Thanks for reaching out to RaniWebSolution.",
        "We received your request and will contact you shortly.",
        "Visit again any time to build growth with us.",
        "",
        "Regards,",
        "Team RaniWebSolution",
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("Client thank-you email error:", error);
    return false;
  }
};

const sendPaymentEmail = async (payment) => {
  if (!mailTransport) return false;
  try {
    await mailTransport.sendMail({
      from: SMTP_USER,
      to: MAIL_TO,
      subject: "Payment Update - RaniWebSolution",
      text: [
        `Plan: ${payment.planLabel || payment.planId || "N/A"}`,
        `Amount: ${payment.amount || 0} ${payment.currency || PAYPAL_CURRENCY || RAZORPAY_CURRENCY}`,
        `Status: ${payment.status}`,
        `Gateway: ${payment.gateway || "N/A"}`,
        `Order ID: ${payment.orderId || "N/A"}`,
        `Payment ID: ${payment.paymentId || "N/A"}`,
        `Time: ${payment.paidAt || payment.createdAt || "N/A"}`,
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("Payment email error:", error);
    return false;
  }
};

const adminDir = path.join(__dirname, "admin");
app.use("/admin", requireAdmin, express.static(adminDir, { index: "index.html" }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/razorpay/config", (req, res) => {
  if (!RAZORPAY_KEY_ID) {
    return res.status(500).json({ ok: false, error: "Razorpay key missing" });
  }

  return res.json({
    ok: true,
    keyId: RAZORPAY_KEY_ID,
    currency: RAZORPAY_CURRENCY,
  });
});

app.get("/api/paypal/config", (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ ok: false, error: "PayPal not configured" });
  }

  return res.json({
    ok: true,
    clientId: PAYPAL_CLIENT_ID,
    currency: PAYPAL_CURRENCY,
  });
});

app.post("/api/razorpay/order", async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ ok: false, error: "Razorpay not configured" });
  }

  const { planId } = req.body || {};
  if (!planId || !PLAN_PRICES[planId]) {
    return res.status(400).json({ ok: false, error: "Invalid plan" });
  }

  const amount = PLAN_PRICES[planId];

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: RAZORPAY_CURRENCY,
      receipt: `rani_${Date.now()}`,
      notes: {
        planId,
        planLabel: PLAN_LABELS[planId] || planId,
      },
    });

    await paymentsDb.insert({
      orderId: order.id,
      planId,
      planLabel: PLAN_LABELS[planId] || planId,
      amount,
      currency: RAZORPAY_CURRENCY,
      status: "pending",
      gateway: "razorpay",
      createdAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      planLabel: PLAN_LABELS[planId] || planId,
    });
  } catch (error) {
    console.error("Razorpay order error:", error);
    return res.status(500).json({ ok: false, error: "Order creation failed" });
  }
});

app.post("/api/razorpay/verify", async (req, res) => {
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ ok: false, error: "Razorpay secret missing" });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } =
    req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ ok: false, error: "Invalid payment data" });
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ ok: false, error: "Signature mismatch" });
  }

  const paidAt = new Date().toISOString();
  const update = {
    status: "success",
    paymentId: razorpay_payment_id,
    paidAt,
  };

  const updated = await paymentsDb.update(
    { orderId: razorpay_order_id },
    { $set: update }
  );

  let paymentRecord = await paymentsDb.findOne({ orderId: razorpay_order_id });
  if (!paymentRecord) {
    paymentRecord = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      planId: planId || "",
      planLabel: PLAN_LABELS[planId] || planId || "",
      amount: PLAN_PRICES[planId] || 0,
      currency: RAZORPAY_CURRENCY,
      status: "success",
      gateway: "razorpay",
      createdAt: paidAt,
      paidAt,
    };
    await paymentsDb.insert(paymentRecord);
  } else if (!updated) {
    await paymentsDb.insert({ ...paymentRecord, ...update });
  }

  await sendPaymentEmail({
    ...paymentRecord,
    status: "success",
    paymentId: razorpay_payment_id,
    paidAt,
  });

  return res.json({ ok: true });
});

app.post("/api/razorpay/failure", async (req, res) => {
  const { orderId, error } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "Order id missing" });
  }
  await paymentsDb.update(
    { orderId },
    {
      $set: {
        status: "failed",
        failureReason: error?.description || "Payment failed",
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
  return res.json({ ok: true });
});

app.post("/api/paypal/order", async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ ok: false, error: "PayPal not configured" });
  }

  const { planId } = req.body || {};
  if (!planId || !PLAN_PRICES[planId]) {
    return res.status(400).json({ ok: false, error: "Invalid plan" });
  }

  const amount = PLAN_PRICES[planId];

  try {
    const token = await getPayPalAccessToken();
    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: PAYPAL_CURRENCY,
              value: formatPayPalAmount(amount),
            },
            description: `${PLAN_LABELS[planId] || planId} Plan`,
          },
        ],
        application_context: {
          shipping_preference: "NO_SHIPPING",
        },
      }),
    });

    const order = await orderRes.json();
    if (!orderRes.ok || !order.id) {
      throw new Error(order?.message || "PayPal order creation failed");
    }

    await paymentsDb.insert({
      orderId: order.id,
      planId,
      planLabel: PLAN_LABELS[planId] || planId,
      amount,
      currency: PAYPAL_CURRENCY,
      status: "pending",
      gateway: "paypal",
      createdAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      id: order.id,
      amount,
      currency: PAYPAL_CURRENCY,
      planLabel: PLAN_LABELS[planId] || planId,
    });
  } catch (error) {
    console.error("PayPal order error:", error);
    return res.status(500).json({ ok: false, error: "Order creation failed" });
  }
});

app.post("/api/paypal/capture", async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ ok: false, error: "PayPal not configured" });
  }

  const { orderId, orderID, planId } = req.body || {};
  const paypalOrderId = orderId || orderID;

  if (!paypalOrderId) {
    return res.status(400).json({ ok: false, error: "Order id missing" });
  }

  try {
    const token = await getPayPalAccessToken();
    const captureRes = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const capture = await captureRes.json();
    const existing = await paymentsDb.findOne({ orderId: paypalOrderId });
    const resolvedPlanId = planId || existing?.planId || "";
    const resolvedPlanLabel =
      PLAN_LABELS[resolvedPlanId] || existing?.planLabel || resolvedPlanId || "";
    const resolvedAmount =
      existing?.amount || PLAN_PRICES[resolvedPlanId] || 0;
    const captureItem = capture?.purchase_units?.[0]?.payments?.captures?.[0];
    const status = captureItem?.status || capture?.status || "UNKNOWN";
    const isSuccess = status === "COMPLETED";
    const paidAt = new Date().toISOString();
    const paymentId = captureItem?.id || "";

    await paymentsDb.update(
      { orderId: paypalOrderId },
      {
        $set: {
          planId: resolvedPlanId,
          planLabel: resolvedPlanLabel,
          amount: resolvedAmount,
          currency: PAYPAL_CURRENCY,
          status: isSuccess ? "success" : "failed",
          gateway: "paypal",
          paymentId,
          paidAt,
          updatedAt: paidAt,
        },
      },
      { upsert: true }
    );

    if (!captureRes.ok || !isSuccess) {
      return res
        .status(500)
        .json({ ok: false, error: "Payment not completed" });
    }

    await sendPaymentEmail({
      orderId: paypalOrderId,
      paymentId,
      planId: resolvedPlanId,
      planLabel: resolvedPlanLabel,
      amount: resolvedAmount,
      currency: PAYPAL_CURRENCY,
      status: "success",
      gateway: "paypal",
      paidAt,
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("PayPal capture error:", error);
    await paymentsDb.update(
      { orderId: orderId || orderID },
      {
        $set: {
          status: "failed",
          failureReason: error?.message || "Capture failed",
          updatedAt: new Date().toISOString(),
          gateway: "paypal",
        },
      },
      { upsert: true }
    );
    return res.status(500).json({ ok: false, error: "Capture failed" });
  }
});

app.post("/api/paypal/failure", async (req, res) => {
  const { orderId, reason } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "Order id missing" });
  }
  await paymentsDb.update(
    { orderId },
    {
      $set: {
        status: "failed",
        failureReason: reason || "Payment canceled",
        updatedAt: new Date().toISOString(),
        gateway: "paypal",
      },
    },
    { upsert: true }
  );
  return res.json({ ok: true });
});

app.get("/api/admin/summary", requireAdmin, async (req, res) => {
  const [leadCount, paymentCount, successCount, failedCount, pendingCount] =
    await Promise.all([
      leadsDb.count({}),
      paymentsDb.count({}),
      paymentsDb.count({ status: "success" }),
      paymentsDb.count({ status: "failed" }),
      paymentsDb.count({ status: "pending" }),
    ]);

  const payments = await paymentsDb.find({ status: "success" });
  const revenue = payments.reduce((sum, item) => sum + (item.amount || 0), 0);

  return res.json({
    ok: true,
    leads: leadCount,
    payments: {
      total: paymentCount,
      success: successCount,
      failed: failedCount,
      pending: pendingCount,
    },
    revenue,
    currency: RAZORPAY_CURRENCY,
  });
});

app.get("/api/admin/leads", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const items = await leadsDb
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit);
  return res.json({ ok: true, items });
});

app.get("/api/admin/payments", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const items = await paymentsDb
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit);
  return res.json({ ok: true, items });
});

app.post("/api/lead", async (req, res) => {
  const { name, email, business, message, source, phone, rating, feedback } =
    req.body || {};

  if (!email) {
    return res.status(400).json({ ok: false, error: "Email is required" });
  }

  const lead = {
    name: name || "",
    email,
    phone: phone || "",
    business: business || "",
    message: message || "",
    feedback: feedback || "",
    rating: rating || "",
    source: source || "website",
    status: "new",
    createdAt: new Date().toISOString(),
  };

  try {
    await leadsDb.insert(lead);
  } catch (error) {
    console.error("Lead DB error:", error);
    return res.status(500).json({ ok: false, error: "Lead not saved" });
  }

  const emailSent = await sendLeadEmail(lead);
  const thanksSent = await sendClientThankYou(lead);
  console.log("New lead:", lead);
  return res.json({ ok: true, emailSent, thanksSent });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
