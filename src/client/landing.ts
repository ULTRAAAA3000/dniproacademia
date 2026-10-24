const nav = document.querySelector("nav") as HTMLElement;
const mov = document.getElementById("mov") as HTMLElement;
const novl = document.getElementById("novl") as HTMLElement;
const nbg = document.getElementById("nbg") as HTMLElement;
const drw = document.getElementById("drw") as HTMLElement;
const drc = document.getElementById("drc") as HTMLElement;

function syncTop(): void {
  let h = nav.offsetHeight;
  if (!h) h = 68;
  const items = document.querySelectorAll<HTMLElement>(".mega,.mov");
  for (let i = 0; i < items.length; i++) {
    items[i].style.top = h + "px";
  }
}

window.addEventListener("scroll", () => {
  if (window.scrollY > 80) {
    nav.classList.add("sc");
  } else {
    nav.classList.remove("sc");
  }
  const p = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
  nav.style.setProperty("--sp", p.toFixed(1) + "%");
  syncTop();
});
window.addEventListener("resize", syncTop);
requestAnimationFrame(() => requestAnimationFrame(syncTop));

const menuItems = document.querySelectorAll<HTMLElement>(".ni");

function closeAll(): void {
  for (let i = 0; i < menuItems.length; i++) {
    menuItems[i].classList.remove("op");
    const b = menuItems[i].querySelector(".nb");
    if (b) b.setAttribute("aria-expanded", "false");
  }
  mov.classList.remove("on");
}

for (let i = 0; i < menuItems.length; i++) {
  const item = menuItems[i];
  const btn = item.querySelector(".nb");
  if (!btn) continue;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = item.classList.contains("op");
    closeAll();
    if (!wasOpen) {
      item.classList.add("op");
      btn.setAttribute("aria-expanded", "true");
      mov.classList.add("on");
    }
  });
}

mov.addEventListener("click", closeAll);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAll();
});
const megaLinks = document.querySelectorAll(".mega a");
for (let i = 0; i < megaLinks.length; i++) {
  megaLinks[i].addEventListener("click", closeAll);
}

function openDrawer(): void {
  drw.classList.add("op");
  novl.classList.add("on");
  nbg.classList.add("op");
  document.body.style.overflow = "hidden";
}
function closeDrawer(): void {
  drw.classList.remove("op");
  novl.classList.remove("on");
  nbg.classList.remove("op");
  document.body.style.overflow = "";
}
nbg.addEventListener("click", () => {
  if (drw.classList.contains("op")) {
    closeDrawer();
  } else {
    openDrawer();
  }
});
drc.addEventListener("click", closeDrawer);
novl.addEventListener("click", closeDrawer);

const drawerButtons = document.querySelectorAll<HTMLElement>(".drt");
for (let i = 0; i < drawerButtons.length; i++) {
  const t = drawerButtons[i];
  t.addEventListener("click", () => {
    const sub = document.getElementById(t.dataset.t || "") as HTMLElement;
    const wasOpen = t.classList.contains("op");
    for (let j = 0; j < drawerButtons.length; j++) {
      drawerButtons[j].classList.remove("op");
    }
    const subs = document.querySelectorAll(".dsb");
    for (let j = 0; j < subs.length; j++) {
      subs[j].classList.remove("op");
    }
    if (!wasOpen) {
      t.classList.add("op");
      sub.classList.add("op");
    }
  });
}

interface Node2 {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  p: number;
}

function startBackground(): void {
  const canvas = document.getElementById("hc") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  let W = 0;
  let H = 0;
  let nodes: Node2[] = [];
  let mx = 0;
  let my = 0;

  function resize(): void {
    W = canvas!.width = canvas!.offsetWidth || window.innerWidth;
    H = canvas!.height = canvas!.offsetHeight || window.innerHeight;
    nodes = [];
    const count = Math.floor((W * H) / 9000);
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 0.8 + 0.3,
        a: Math.random() * 0.35 + 0.05,
        p: Math.random() * Math.PI * 2,
      });
    }
  }

  document.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
  });

  function draw(): void {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = n.x - mx;
      const dy = n.y - my;
      const d = Math.hypot(dx, dy);
      if (d < 150 && d > 0) {
        const f = (1 - d / 150) * 0.4;
        n.vx += (dx / d) * f;
        n.vy += (dy / d) * f;
      }
      n.vx *= 0.98;
      n.vy *= 0.98;
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -10) n.x = W + 10;
      if (n.x > W + 10) n.x = -10;
      if (n.y < -10) n.y = H + 10;
      if (n.y > H + 10) n.y = -10;
      n.p += 0.008;
      const al = n.a * (0.6 + 0.4 * Math.sin(n.p));
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20,184,166," + al + ")";
      ctx.fill();
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = "rgba(20,184,166," + 0.07 * (1 - d / 110) + ")";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  draw();
}
startBackground();

const glow = document.getElementById("hcg");
if (glow) {
  document.addEventListener("mousemove", (e) => {
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
  });
}

function startDots(): void {
  const dc = document.getElementById("dc") as HTMLCanvasElement | null;
  if (!dc) return;
  const ctx = dc.getContext("2d") as CanvasRenderingContext2D;
  dc.width = 380;
  dc.height = 460;
  const COLS = 18;
  const ROWS = 22;
  const gX = 380 / (COLS + 1);
  const gY = 460 / (ROWS + 1);
  let dmx = 190;
  let dmy = 230;
  let t = 0;

  dc.addEventListener("mousemove", (e) => {
    const r = dc.getBoundingClientRect();
    dmx = e.clientX - r.left;
    dmy = e.clientY - r.top;
  });
  dc.addEventListener("mouseleave", () => {
    dmx = 190;
    dmy = 230;
  });

  function draw(): void {
    ctx.clearRect(0, 0, 380, 460);
    t += 0.018;
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const bx = c * gX;
        const by = r * gY;
        const wave = Math.sin(t + c * 0.45 + r * 0.3) * 0.5 + 0.5;
        const dx = bx - dmx;
        const dy = by - dmy;
        const inf = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 130);
        const al = Math.min(0.08 + wave * 0.18 + inf * 0.55, 0.85);
        const sz = 1.5 + wave * 1.2 + inf * 3.5;
        const g = Math.round(184 * (0.3 + wave * 0.2 + inf * 0.5));
        const b = Math.round(166 * (0.3 + wave * 0.2 + inf * 0.5));
        ctx.beginPath();
        ctx.arc(bx, by, sz, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20," + g + "," + b + "," + al + ")";
        ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}
startDots();

const observer = new IntersectionObserver(
  (entries) => {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        entries[i].target.classList.add("on");
        observer.unobserve(entries[i].target);
      }
    }
  },
  { threshold: 0.08 }
);
const revealItems = document.querySelectorAll<HTMLElement>(".rv");
for (let i = 0; i < revealItems.length; i++) {
  revealItems[i].style.transitionDelay = (i % 6) * 0.06 + "s";
  observer.observe(revealItems[i]);
}

const arc = document.querySelector<HTMLElement>(".harc");
if (arc) {
  window.addEventListener("scroll", () => {
    arc.style.transform = "translateY(" + window.scrollY * 0.15 + "px)";
  });
}

const newsLink = document.getElementById("news-link");
if (newsLink) {
  newsLink.addEventListener("click", (event) => {
    event.preventDefault();
    alert("Тут будуть новини згодом!");
  });
}
