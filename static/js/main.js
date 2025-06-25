// Example: Add fade-in effect on scroll
document.addEventListener("DOMContentLoaded", function () {
    const sections = document.querySelectorAll("section");

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("animate-fadeIn");
            }
        });
    }, { threshold: 0.1 });

    sections.forEach(section => {
        section.classList.add("opacity-0", "translate-y-10", "transition-all", "duration-1000");
        observer.observe(section);
    });
});