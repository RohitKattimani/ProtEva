import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Parametric ribbon art, deliberately unrelated to any sequence or predicted structure.
export function MolecularCanvas({ className, compact = false }: { className?: string; compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let time = 0;
    let pointerX = 0;
    let pointerY = 0;
    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio, 2);
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) / rect.width - .5;
      pointerY = (e.clientY - rect.top) / rect.height - .5;
    };
    canvas.addEventListener("pointermove", move);
    const styles = getComputedStyle(canvas);
    const cyan = styles.getPropertyValue("--accent").trim();
    const violet = styles.getPropertyValue("--primary").trim();
    const silver = styles.getPropertyValue("--muted-foreground").trim();
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width / 680, height / 570);
      const angle = -.3 + Math.sin(time * .13) * .13 + pointerX * .22;
      const project = (t: number, strand: number, edge = 0): [number, number, number] => {
        const phase = t * Math.PI * 2;
        const helix = phase * 5.5;
        const radius = 105 + 34 * Math.cos(phase * 3);
        let x = Math.cos(phase) * radius + Math.cos(helix) * 38;
        let y = Math.sin(phase) * 175 + Math.sin(helix) * 21;
        let z = Math.sin(phase * 2) * 72 + Math.sin(helix) * 32;
        x += strand * (23 + Math.sin(phase * 2) * 18);
        y += strand * Math.cos(phase * 2) * 17;
        x += edge * Math.cos(helix) * 9;
        z += edge * Math.sin(helix) * 9;
        const rx = x * Math.cos(angle) + z * Math.sin(angle);
        const rz = z * Math.cos(angle) - x * Math.sin(angle);
        const perspective = 700 / (700 - rz);
        return [width * .52 + (rx + y * .32) * scale * perspective, height * .48 + (y - rx * .18 + pointerY * 14) * scale * perspective, rz];
      };
      context.globalAlpha = .17; context.strokeStyle = silver; context.lineWidth = .6;
      for (let r = 0; r < 3; r++) {
        context.beginPath(); context.ellipse(width * .52, height * .48, (230 + r * 34) * scale, (95 + r * 24) * scale, -.45, 0, Math.PI * 2); context.stroke();
      }
      for (const strand of [-2, -1, 1, 2, 0]) {
        const count = 470;
        for (let i = 0; i < count; i++) {
          const a = project(i / count, strand, -1); const b = project(i / count, strand, 1);
          const c = project((i + 1) / count, strand, 1); const d = project((i + 1) / count, strand, -1);
          context.globalAlpha = strand === 0 ? .55 + (a[2] + 130) / 520 : .08 + (a[2] + 130) / 1600;
          context.fillStyle = i < count * .51 ? cyan : violet;
          context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.lineTo(c[0], c[1]); context.lineTo(d[0], d[1]); context.closePath(); context.fill();
        }
        context.globalAlpha = strand === 0 ? .85 : .2;
        context.strokeStyle = strand === 0 ? cyan : silver; context.lineWidth = strand === 0 ? .8 : .5;
        context.beginPath();
        for (let i = 0; i <= count; i++) { const p = project(i / count, strand, 0); if (i === 0) context.moveTo(p[0], p[1]); else context.lineTo(p[0], p[1]); } context.stroke();
        for (let i = 0; i < 72; i++) { const p = project(i / 72, strand, 1.5); context.beginPath(); context.arc(p[0], p[1], strand === 0 ? 1.6 : .8, 0, Math.PI * 2); context.fillStyle = strand === 0 ? cyan : silver; context.fill(); }
      }
      context.globalAlpha = 1;
      if (!reduced) { time += .016; frame = requestAnimationFrame(draw); }
    };
    draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointermove", move); };
  }, []);
  return <div className={cn("molecular-scene", compact && "molecular-compact", className)}><canvas ref={ref} role="img" aria-label="Conceptual protein ribbon with multiple conformational silhouettes converging on a highlighted target; not a predicted structure"/><span className="molecular-caption">CONFORMATION STUDY / CONCEPTUAL ART</span></div>;
}