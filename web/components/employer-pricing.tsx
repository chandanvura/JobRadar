import { Check, Sparkles, Building2, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmployerPricingProps {
  onSelectTier: (tier: "free" | "featured" | "partner") => void;
}

export function EmployerPricing({ onSelectTier }: EmployerPricingProps) {
  const tiers = [
    {
      id: "free" as const,
      name: "Community ATS",
      price: "₹0",
      secondaryPrice: "Free forever",
      description: "For tech teams with active career portals seeking automated visibility.",
      badge: "Self serve",
      features: [
        "Automated 150-minute career feed sync",
        "Direct company ATS application links",
        "Bengaluru and Hyderabad city filtering",
        "Standard search index presence",
        "Strict zero to two years verification",
      ],
      cta: "Connect official feed",
      highlight: false,
    },
    {
      id: "featured" as const,
      name: "Featured Post",
      price: "₹4,999",
      secondaryPrice: "per verified role (~$59)",
      description: "Fast track your hiring with top-of-feed placement and verified candidate alerts.",
      badge: "Most popular",
      features: [
        "Everything in Community ATS",
        "Pinned to top of Bengaluru & Hyderabad feeds",
        "Highlighted card border and verified badge",
        "Instant Telegram alert notification broadcast",
        "Priority 30-minute ingestion review",
        "30-day active listing duration",
      ],
      cta: "Post a featured opening",
      highlight: true,
    },
    {
      id: "partner" as const,
      name: "Talent Partner",
      price: "₹19,999",
      secondaryPrice: "per month (~$239)",
      description: "For high growth engineering organizations hiring multiple junior roles quarterly.",
      badge: "Maximum reach",
      features: [
        "Unlimited featured early career listings",
        "Dedicated company profile highlight",
        "Custom skill taxonomy prioritization",
        "Direct applicant tracking integration",
        "Quarterly hiring analytics report",
        "Dedicated employer support manager",
      ],
      cta: "Become a talent partner",
      highlight: false,
    },
  ];

  return (
    <section aria-label="Employer pricing tiers" className="my-10 rounded-3xl border border-border bg-card p-6 md:p-10">
      <div className="mx-auto max-w-[680px] text-center mb-10">
        <div className="caption-3 mx-auto mb-3 flex w-fit items-center gap-2 uppercase tracking-[.2em] text-primary">
          <Building2 size={16} />
          Employer SaaS Solutions
        </div>
        <h2 className="heading-4 md:heading-3 text-foreground text-wrap:balance">
          Simple, transparent hiring tiers
        </h2>
        <p className="body-4 mt-2 text-muted-foreground text-wrap:pretty">
          Reach thousands of pre-qualified zero to two years experience developers without agency markups or recruiter commission fees.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((t) => (
          <div
            key={t.id}
            className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-300 ${
              t.highlight
                ? "border-primary bg-primary/[0.04] shadow-[0_0_30px_-15px_rgba(115,222,176,0.3)] ring-1 ring-primary/40"
                : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30"
            }`}
          >
            {t.badge && (
              <span
                className={`absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-semibold ${
                  t.highlight
                    ? "bg-primary text-black font-bold"
                    : "border border-border bg-muted text-muted-foreground"
                }`}
              >
                {t.badge}
              </span>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="title-2 text-foreground font-semibold">{t.name}</h3>
                {t.highlight ? <Sparkles size={18} className="text-primary" /> : <Shield size={18} className="text-muted-foreground" />}
              </div>
              <p className="caption-2 text-muted-foreground mb-4 min-h-[40px]">{t.description}</p>
              
              <div className="mb-6 border-b border-border/60 pb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">{t.price}</span>
                </div>
                <span className="caption-4 text-muted-foreground">{t.secondaryPrice}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {t.features.map((f, i) => (
                  <li key={i} className="caption-2 flex items-start gap-2.5 text-foreground/90">
                    <Check size={16} className={`shrink-0 mt-0.5 ${t.highlight ? "text-primary" : "text-emerald-400"}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              onClick={() => onSelectTier(t.id)}
              className={`w-full button-md rounded-xl py-2.5 font-semibold transition-all ${
                t.highlight
                  ? "bg-primary text-black hover:bg-primary/90 shadow-md font-bold"
                  : "bg-white text-zinc-950 hover:bg-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              }`}
            >
              {t.cta}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border/50 bg-muted/20 p-4 text-center">
        <p className="caption-3 text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
          <Zap size={14} className="text-primary" />
          Every post is verified for authentic zero to two years requirements before being published. No ghost jobs allowed.
        </p>
      </div>
    </section>
  );
}
