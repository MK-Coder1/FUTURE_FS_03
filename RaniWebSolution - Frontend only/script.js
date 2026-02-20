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
