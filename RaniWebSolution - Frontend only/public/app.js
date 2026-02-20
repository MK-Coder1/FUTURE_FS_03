const progressBar = document.querySelector(".progress");

const updateProgress = () => {
  const doc = document.documentElement;
  const scrollTop = doc.scrollTop;
  const height = doc.scrollHeight - doc.clientHeight;
  const percent = height > 0 ? (scrollTop / height) * 100 : 0;
  progressBar.style.width = percent + "%";
};

updateProgress();
window.addEventListener("scroll", updateProgress, { passive: true });

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealEls = document.querySelectorAll(".reveal");
if (prefersReduced) {
  revealEls.forEach((el) => el.classList.add("in"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => revealObserver.observe(el));
}

const counters = document.querySelectorAll("[data-count]");
const countUp = (el) => {
  const target = Number(el.dataset.count || 0);
  const start = performance.now();
  const duration = 1200;

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.floor(progress * target).toString();
    if (progress < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

if (counters.length) {
  if (prefersReduced) {
    counters.forEach((el) => (el.textContent = el.dataset.count || "0"));
  } else {
    const counterObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            countUp(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((el) => counterObserver.observe(el));
  }
}

const leadForms = document.querySelectorAll("[data-lead-form]");
const toast = document.querySelector("[data-toast]");
let toastTimer = null;

const showToast = (message, isError) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("error", Boolean(isError));
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1000);
};

const setStatus = (form, message, isError) => {
  const status = form.querySelector(".form-status");
  if (!status) return;
  status.textContent = message;
  if (isError) {
    status.classList.add("error");
  } else {
    status.classList.remove("error");
  }
};

const postLead = async (payload, button, form) => {
  const original = button.dataset.label || button.textContent;
  button.disabled = true;
  button.textContent = "Sending...";
  setStatus(form, "Sending your request...", false);

  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Request failed");
    }

    button.textContent = "Sent";
    const formType = form.dataset.leadForm || "website";
    const statusMessage =
      formType === "feedback"
        ? "Thanks for your feedback."
        : "Thanks. We will contact you shortly.";
    setStatus(form, statusMessage, false);
    if (formType === "hero") {
      showToast("Thanks! Your 24 hour quote request was sent.", false);
    } else if (formType === "feedback") {
      showToast("Thanks for your feedback.", false);
    } else {
      showToast("Thanks! We will contact you shortly.", false);
    }
    form.reset();
  } catch (err) {
    button.textContent = "Try Again";
    setStatus(form, "Something went wrong. Please try again.", true);
    showToast("Submission failed. Please try again.", true);
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1500);
  }
};

leadForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.source = form.dataset.leadForm || "website";

    const button = form.querySelector("button[type='submit']");
    if (!button) return;

    if (!payload.email) {
      setStatus(form, "Please enter a valid email.", true);
      showToast("Please enter a valid email.", true);
      return;
    }

    postLead(payload, button, form);
  });
});

const paymentButtons = document.querySelectorAll(".pay-btn");
const paymentStatus = document.querySelector(".payment-status");
let razorpayConfig = null;

const setPaymentStatus = (message, isError) => {
  if (!paymentStatus) return;
  paymentStatus.textContent = message;
  if (isError) {
    paymentStatus.classList.add("error");
  } else {
    paymentStatus.classList.remove("error");
  }
};

const fetchRazorpayConfig = async () => {
  if (razorpayConfig) return razorpayConfig;
  const res = await fetch("/api/razorpay/config");
  if (!res.ok) {
    throw new Error("Payment configuration not available.");
  }
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "Payment configuration not available.");
  }
  razorpayConfig = { keyId: data.keyId, currency: data.currency };
  return razorpayConfig;
};

const createRazorpayOrder = async (planId) => {
  const res = await fetch("/api/razorpay/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });

  if (!res.ok) {
    throw new Error("Unable to create payment order.");
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to create payment order.");
  }
  return data;
};

const startPayment = async (planId, button) => {
  if (!planId) return;
  if (typeof Razorpay === "undefined") {
    setPaymentStatus("Razorpay script failed to load. Please refresh.", true);
    showToast("Payment system failed to load. Please refresh.", true);
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Loading...";
  setPaymentStatus("Preparing secure payment...", false);

  try {
    const config = await fetchRazorpayConfig();
    const order = await createRazorpayOrder(planId);

    const options = {
      key: config.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "RaniWebSolution",
      description: order.planLabel ? `${order.planLabel} Plan` : "Service Plan",
      order_id: order.id,
      handler: async (response) => {
        setPaymentStatus("Verifying payment...", false);
        try {
          const verifyRes = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...response,
              planId,
            }),
          });
          const data = await verifyRes.json();
          if (!verifyRes.ok || !data.ok) {
            throw new Error(data.error || "Verification failed.");
          }
          setPaymentStatus("Payment successful. We'll contact you shortly.", false);
          showToast("Payment successful. Thank you!", false);
        } catch (err) {
          setPaymentStatus(
            "Payment received but verification failed. Please contact support.",
            true
          );
          showToast("Payment verification failed. Please contact support.", true);
        }
      },
      theme: { color: "#ff7a1a" },
    };

    const razorpay = new Razorpay(options);
    razorpay.on("payment.failed", async (response) => {
      setPaymentStatus("Payment failed. Please try again.", true);
      showToast("Payment failed. Please try again.", true);
      try {
        await fetch("/api/razorpay/failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            error: response?.error || null,
          }),
        });
      } catch (err) {
        console.warn("Failed to record payment failure.");
      }
    });
    razorpay.open();
  } catch (err) {
    setPaymentStatus(err.message || "Payment could not start. Try again.", true);
    showToast(err.message || "Payment could not start. Try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
};

paymentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const planId = button.dataset.plan;
    startPayment(planId, button);
  });
});

const paypalPlanSelect = document.getElementById("paypal-plan");
const paypalButtonWrap = document.getElementById("paypal-button");
const paypalStatus = document.querySelector(".paypal-status");
let paypalConfig = null;
let paypalReady = false;
const paypalPlanLabels = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

const setPayPalStatus = (message, isError) => {
  if (!paypalStatus) return;
  paypalStatus.textContent = message;
  paypalStatus.classList.toggle("error", Boolean(isError));
};

const fetchPayPalConfig = async () => {
  if (paypalConfig) return paypalConfig;
  const res = await fetch("/api/paypal/config");
  if (!res.ok) {
    throw new Error("PayPal configuration not available.");
  }
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "PayPal configuration not available.");
  }
  paypalConfig = { clientId: data.clientId, currency: data.currency };
  return paypalConfig;
};

const updatePayPalPlanLabels = (currency) => {
  if (!paypalPlanSelect) return;
  const options = Array.from(paypalPlanSelect.options);
  options.forEach((option) => {
    const amount = Number(option.dataset.amount || 0);
    if (!amount) return;
    const label = paypalPlanLabels[option.value] || option.value || "Plan";
    option.textContent = `${label} - ${currency} ${amount.toLocaleString()}`;
  });
};

const loadPayPalScript = (clientId, currency) =>
  new Promise((resolve, reject) => {
    if (window.paypal) {
      resolve();
      return;
    }

    const existing = document.querySelector("script[data-paypal-sdk]");
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}`;
    script.async = true;
    script.dataset.paypalSdk = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("PayPal script failed to load."));
    document.head.appendChild(script);
  });

const initPayPal = async () => {
  if (!paypalButtonWrap || paypalReady) return;
  paypalReady = true;
  setPayPalStatus("Loading PayPal...", false);

  try {
    const config = await fetchPayPalConfig();
    updatePayPalPlanLabels(config.currency);
    await loadPayPalScript(config.clientId, config.currency);

    if (typeof paypal === "undefined") {
      throw new Error("PayPal SDK not available.");
    }

    paypal
      .Buttons({
        createOrder: async () => {
          const planId = paypalPlanSelect?.value || "growth";
          setPayPalStatus("Creating PayPal order...", false);
          const res = await fetch("/api/paypal/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planId }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "Unable to create PayPal order.");
          }
          return data.id;
        },
        onApprove: async (data) => {
          setPayPalStatus("Finalizing payment...", false);
          try {
            const planId = paypalPlanSelect?.value || "growth";
            const res = await fetch("/api/paypal/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: data.orderID,
                planId,
              }),
            });
            const out = await res.json();
            if (!res.ok || !out.ok) {
              throw new Error(out.error || "PayPal capture failed.");
            }
            setPayPalStatus("Payment successful. We'll contact you shortly.", false);
            showToast("PayPal payment successful. Thank you!", false);
          } catch (err) {
            setPayPalStatus(
              "Payment captured but verification failed. Contact support.",
              true
            );
            showToast("PayPal verification failed. Please contact support.", true);
          }
        },
        onCancel: (data) => {
          setPayPalStatus("Payment canceled.", true);
          showToast("PayPal payment canceled.", true);
          if (data?.orderID) {
            fetch("/api/paypal/failure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: data.orderID,
                reason: "User canceled PayPal payment",
              }),
            }).catch(() => {});
          }
        },
        onError: (err) => {
          console.error("PayPal error:", err);
          setPayPalStatus("Payment failed. Please try again.", true);
          showToast("PayPal payment failed. Please try again.", true);
        },
      })
      .render("#paypal-button");
  } catch (err) {
    console.error("PayPal init error:", err);
    setPayPalStatus(err.message || "PayPal failed to load.", true);
    showToast("PayPal failed to load. Please refresh.", true);
  }
};

initPayPal();

const toggleButtons = document.querySelectorAll("[data-toggle]");

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.toggle;
    const target = document.getElementById(targetId);
    if (!target) return;

    const isOpen = target.classList.toggle("is-open");
    const openLabel = button.dataset.openLabel || "Read more";
    const closeLabel = button.dataset.closeLabel || "Hide";

    button.textContent = isOpen ? closeLabel : openLabel;
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
});

const videoModal = document.querySelector("[data-video-modal]");
const videoFrame = videoModal ? videoModal.querySelector("iframe") : null;
const videoButtons = document.querySelectorAll("[data-video]");
const videoCloseButtons = document.querySelectorAll("[data-video-close]");

const closeVideo = () => {
  if (!videoModal) return;
  videoModal.classList.remove("is-open");
  videoModal.setAttribute("aria-hidden", "true");
  if (videoFrame) videoFrame.src = "";
};

const openVideo = (url) => {
  if (!videoModal || !videoFrame || !url) return;
  const joiner = url.includes("?") ? "&" : "?";
  videoFrame.src = `${url}${joiner}autoplay=1`;
  videoModal.classList.add("is-open");
  videoModal.setAttribute("aria-hidden", "false");
};

videoButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openVideo(button.dataset.video);
  });
});

videoCloseButtons.forEach((button) => {
  button.addEventListener("click", closeVideo);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeVideo();
  }
});

const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelector(".nav-links");

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

if (navLinks) {
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      document.body.classList.remove("nav-open");
      navToggle?.setAttribute("aria-expanded", "false");
    });
  });
}

const faqItems = document.querySelectorAll(".faq-item");
faqItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (item.open) {
      faqItems.forEach((other) => {
        if (other !== item) {
          other.removeAttribute("open");
        }
      });
    }
  });
});

const testimonialCards = Array.from(document.querySelectorAll("[data-testimonial-card]"));
const testimonialControls = document.querySelectorAll("[data-testimonial-control]");
let testimonialIndex = 0;

const setActiveTestimonial = (index) => {
  if (!testimonialCards.length) return;
  testimonialCards.forEach((card, i) => {
    card.classList.toggle("active", i === index);
  });
};

const nextTestimonial = () => {
  if (!testimonialCards.length) return;
  testimonialIndex = (testimonialIndex + 1) % testimonialCards.length;
  setActiveTestimonial(testimonialIndex);
};

const prevTestimonial = () => {
  if (!testimonialCards.length) return;
  testimonialIndex = (testimonialIndex - 1 + testimonialCards.length) % testimonialCards.length;
  setActiveTestimonial(testimonialIndex);
};

testimonialControls.forEach((btn) => {
  btn.addEventListener("click", () => {
    const direction = btn.dataset.testimonialControl;
    if (direction === "next") {
      nextTestimonial();
    } else {
      prevTestimonial();
    }
  });
});

if (testimonialCards.length) {
  setActiveTestimonial(testimonialIndex);
  if (!prefersReduced) {
    setInterval(nextTestimonial, 4000);
  }
}
