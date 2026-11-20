/* AIRA Cosmic Motion — decorative-only layer; no app state, storage or API access. */
(() => {
  'use strict';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'aira-particle-field';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {position:'fixed', inset:'0', width:'100%', height:'100%', zIndex:'0', pointerEvents:'none'});
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', {alpha:true});
  if (!ctx) return;

  let width = 0, height = 0, dpr = 1, particles = [], raf = 0;
  const pointer = {x:-1000, y:-1000, active:false};
  const rand = (min,max) => Math.random() * (max-min) + min;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const count = Math.min(145, Math.max(48, Math.round(width*height/11500)));
    particles = Array.from({length:count}, () => ({
      x:rand(0,width), y:rand(0,height), vx:rand(-.16,.16), vy:rand(-.12,.18),
      r:rand(.45,1.65), phase:rand(0,Math.PI*2), twinkle:rand(.004,.016)
    }));
  }
  function draw() {
    ctx.clearRect(0,0,width,height);
    const linkDistance = width < 600 ? 82 : 118;
    for (let i=0;i<particles.length;i++) {
      const p=particles[i];
      p.phase += p.twinkle;
      if (!reduceMotion) {
        p.x += p.vx; p.y += p.vy;
        if (pointer.active) {
          const dx=p.x-pointer.x, dy=p.y-pointer.y, d2=dx*dx+dy*dy;
          if (d2 < 15000 && d2 > 1) { const f=(1-Math.sqrt(d2)/Math.sqrt(15000))*.006; p.vx += dx*f; p.vy += dy*f; }
        }
        p.vx *= .998; p.vy *= .998;
        if (p.x < -8) p.x=width+8; if (p.x > width+8) p.x=-8;
        if (p.y < -8) p.y=height+8; if (p.y > height+8) p.y=-8;
      }
      const alpha=.28 + (Math.sin(p.phase)+1)*.25;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(205,160,255,${alpha})`; ctx.shadowBlur=8; ctx.shadowColor='rgba(166,83,255,.7)'; ctx.fill(); ctx.shadowBlur=0;
      for (let j=i+1;j<particles.length;j++) {
        const q=particles[j], dx=p.x-q.x, dy=p.y-q.y, d=Math.hypot(dx,dy);
        if (d<linkDistance) {
          ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y);
          ctx.strokeStyle=`rgba(157,105,225,${(1-d/linkDistance)*.12})`; ctx.lineWidth=.65; ctx.stroke();
        }
      }
    }
    if (!reduceMotion) raf=requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize, {passive:true});
  window.addEventListener('pointermove', e => {pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;}, {passive:true});
  window.addEventListener('pointerleave', () => {pointer.active=false;}, {passive:true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) { cancelAnimationFrame(raf); raf=requestAnimationFrame(draw); }
  });
  resize(); draw();
})();
