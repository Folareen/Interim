'use client';

import { useEffect } from 'react';

/** One-time entrances enhance visible content; a failed script or reduced motion never hides it. */
export function LandingMotion() {
  useEffect(() => {
    const root = document.getElementById('landing');
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!root || preference.matches || !('IntersectionObserver' in window)) return;
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const animation = entry.target.animate(
            [
              { opacity: 0, transform: 'translateY(18px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            {
              duration: 620,
              delay: Math.min(index, 2) * 70,
              easing: 'cubic-bezier(.2,.7,.2,1)',
              fill: 'backwards',
            },
          );
          animations.add(animation);
          void animation.finished.then(
            () => animations.delete(animation),
            () => animations.delete(animation),
          );
        });
      },
      { threshold: 0.08 },
    );
    root.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    const stop = () => {
      if (!preference.matches) return;
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };
    preference.addEventListener('change', stop);
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', stop);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);
  return null;
}
