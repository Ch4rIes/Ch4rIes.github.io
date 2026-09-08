import { useEffect, useRef } from 'react';
import Particles from './Particles';
import ExperienceSection from './Experience';

export default function Home() {
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const elements = main.current?.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!elements || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal-pending');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });
    const showAll = () => {
      if (!preference.matches) return;
      observer.disconnect();
      elements.forEach(element => element.classList.remove('reveal-pending'));
    };
    if (!preference.matches) {
      elements.forEach(element => {
        // Content already in view stays visible, including restored scroll positions.
        if (element.getBoundingClientRect().top < window.innerHeight) return;
        element.classList.add('reveal-pending');
        observer.observe(element);
      });
    }
    preference.addEventListener('change', showAll);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', showAll);
      elements.forEach(element => element.classList.remove('reveal-pending'));
    };
  }, []);

  return <main ref={main} id="main" className="home">
    <Particles />
    <section className="hero">
      <div className="hero-copy"><h1>Charles Zuo</h1>
      <p className="intro">Engineer, Problem Solver</p></div>
      <span className="scroll-note" aria-hidden="true"><span>↓</span></span>
    </section>
    <ExperienceSection />
    <section id="contact" className="contact-section">
      <h2 data-reveal>Get in touch.</h2>
      <a data-reveal className="contact-link" href="mailto:qingzhongzuo@gmail.com">qingzhongzuo@gmail.com</a>
      <div data-reveal className="social-links">
        <a href="https://www.linkedin.com/in/qzuo/" target="_blank" rel="noreferrer">LinkedIn</a>
        <a href="https://github.com/Ch4rIes" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </section>
  </main>;
}
