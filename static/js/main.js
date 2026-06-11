// Norman Kipkorir — Portfolio interactions

document.addEventListener("DOMContentLoaded", () => {
  // Interactive background: torch follows cursor, image fades in on scroll
  const bgLayer = document.getElementById("bg-layer");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (bgLayer && !reducedMotion) {
    let targetX = -500, targetY = -500, x = targetX, y = targetY;
    let raf = null;

    const tick = () => {
      x += (targetX - x) * 0.09;
      y += (targetY - y) * 0.09;
      bgLayer.style.setProperty("--mx", `${x.toFixed(1)}px`);
      bgLayer.style.setProperty("--my", `${y.toFixed(1)}px`);
      if (Math.abs(targetX - x) > 0.3 || Math.abs(targetY - y) > 0.3) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    };

    window.addEventListener("pointermove", (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      // Invisible at the very top, peaks mid-scroll, eases off near the footer
      const reveal = Math.sin(Math.min(progress * 1.4, 1) * Math.PI) * 0.22;
      bgLayer.style.setProperty("--bg-reveal", reveal.toFixed(3));
      bgLayer.style.setProperty("--parallax", `${(progress * -60).toFixed(1)}px`);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Dark mode toggle
  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  });

  // Scroll-reveal
  const revealEls = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          entry.target.style.transitionDelay = `${(i % 4) * 80}ms`;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => observer.observe(el));

  // Mobile menu
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  menu.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      menu.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    })
  );

  // Footer: year + local Nicosia time
  document.getElementById("year").textContent = new Date().getFullYear();
  const timeEl = document.getElementById("local-time");
  const renderTime = () => {
    timeEl.textContent = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Nicosia",
    }).format(new Date());
  };
  renderTime();
  setInterval(renderTime, 30000);

  // Contact form (Formspree, AJAX)
  const form = document.getElementById("contact-form");
  const formMessage = document.getElementById("form-message");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMessage.className = "form-message";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Form submission failed");
      formMessage.textContent = "Message sent — I'll get back to you soon.";
      formMessage.classList.add("ok");
      form.reset();
    } catch {
      formMessage.textContent = "Something went wrong. Please email me directly.";
      formMessage.classList.add("err");
    }
    setTimeout(() => {
      formMessage.textContent = "";
      formMessage.className = "form-message";
    }, 6000);
  });
});
