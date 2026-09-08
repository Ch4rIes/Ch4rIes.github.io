import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './Home';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <a className="skip" href="#main">Skip to content</a>
    <Home />
    <footer>
      <span>Charles Zuo · He/Him</span>
      <a href="https://www.linkedin.com/in/qzuo/" target="_blank" rel="noreferrer">LinkedIn ↗</a>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  </StrictMode>,
);
