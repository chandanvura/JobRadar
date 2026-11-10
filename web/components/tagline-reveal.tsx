import { useEffect, useRef, useState } from "react";

interface TaglineRevealProps {
  text?: string;
  className?: string;
}

const DEFAULT_TAGLINE =
  "Every opportunity is parsed directly from official company applicant tracking systems, strictly verified for zero to two years of experience, and kept completely private on your device.";

export function TaglineReveal({
  text = DEFAULT_TAGLINE,
  className = "",
}: TaglineRevealProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const words = text.split(" ");
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    // Respect prefers-reduced-motion per B7 / B11 or environments without full DOM
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setActiveCount(words.length);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const requestFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number;

    const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : (id: number) => clearTimeout(id);

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestFrame(() => {
        rafId = null;
        if (!container) return;
        const rect = typeof container.getBoundingClientRect === "function"
          ? container.getBoundingClientRect()
          : { top: 0 };
        const windowHeight = (typeof window !== "undefined" && window.innerHeight) || 800;
        // Trigger threshold: begins at 85% viewport, completes around 35%
        const startTrigger = windowHeight * 0.85;
        const endTrigger = windowHeight * 0.35;

        if (rect.top > startTrigger) {
          // Above viewport threshold
          return;
        } else if (rect.top <= endTrigger) {
          // Fully in reading view
          setActiveCount(words.length);
        } else {
          const progress = (startTrigger - rect.top) / (startTrigger - endTrigger);
          const count = Math.min(words.length, Math.floor(progress * words.length));
          // Once revealed, keep revealed per B7
          setActiveCount((prev) => Math.max(prev, count));
        }
      });
    };

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("scroll", handleScroll, { passive: true });
    }
    handleScroll();

    return () => {
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("scroll", handleScroll);
      }
      if (rafId !== null) cancelFrame(rafId);
    };
  }, [words.length]);

  return (
    <section
      ref={containerRef}
      aria-label="Core mission"
      className={`my-8 rounded-3xl border border-border bg-card p-6 md:p-8 transition-colors ${className}`}
    >
      <div className="mx-auto max-w-[680px]">
        <div className="caption-3 mb-3 flex items-center gap-2 uppercase tracking-[.2em] text-primary">
          <span className="size-2 rounded-full bg-primary" />
          The JobRadar Standard
        </div>
        <h2 className="heading-4 md:heading-3 flex flex-wrap gap-x-2 gap-y-1 text-foreground">
          {words.map((word, i) => {
            const isActive = i < activeCount;
            return (
              <span
                key={`${word}-${i}`}
                className={`transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive ? "opacity-100" : "opacity-30"
                }`}
              >
                {word}
              </span>
            );
          })}
        </h2>
        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            740+ Official ATS Portals
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            0–2 YOE Hard Gate
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            100% In-Browser Privacy
          </span>
        </div>
      </div>
    </section>
  );
}
