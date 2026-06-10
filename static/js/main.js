// Norman Kipkorir — Portfolio interactions

document.addEventListener("DOMContentLoaded", () => {
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
