import React, { useState } from "react";
import {
  Building2,
  Check,
  Sparkles,
  Send,
  ShieldCheck,
  ExternalLink,
  ArrowRight,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmployerViewProps {
  onSwitchToCandidates: () => void;
}

export function EmployerView({ onSwitchToCandidates }: EmployerViewProps) {
  const [tier, setTier] = useState<"free" | "featured" | "partner">("featured");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("Bengaluru");
  const [skills, setSkills] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !company.trim() || !url.trim() || !email.trim()) {
      setError("Please fill in role title, company, careers URL, and recruiter email.");
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("Careers/ATS URL must begin with https:// or http://");
      return;
    }
    setError(null);
    setSubmitted(true);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-2">
      {/* Hero Section */}
      <section className="rounded-3xl border border-border bg-gradient-to-b from-card to-muted/40 p-6 md:p-10 shadow-xs">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <Building2 size={14} /> Early-Career Hiring Platform (SaaS)
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
              Hire verified junior talent in Bengaluru & Hyderabad
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Connect directly with qualified tech candidates having 0 to 2 years of experience.
              Direct ATS routing, zero recruiter agency commissions, and strict policy gating.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={() => {
                  const form = document.getElementById("employer-submit-form");
                  form?.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <Sparkles size={16} /> Post a verified opening
              </Button>
              <Button
                variant="outline"
                onClick={onSwitchToCandidates}
                className="rounded-xl border-border px-4 py-2 font-semibold"
              >
                Browse candidate view <ArrowRight size={15} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:flex md:flex-col md:min-w-44">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div className="text-2xl font-black text-foreground">740+</div>
              <div className="text-xs font-bold uppercase text-muted-foreground">ATS Feeds Indexed</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div className="text-2xl font-black text-foreground">≤ 2 YOE</div>
              <div className="text-xs font-bold uppercase text-muted-foreground">Strict Experience Bar</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div className="text-2xl font-black text-foreground">100%</div>
              <div className="text-xs font-bold uppercase text-muted-foreground">Direct ATS Links</div>
            </div>
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={20} />
          </div>
          <h3 className="text-base font-bold text-foreground">Zero Recruiter Clutter</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Every candidate visits via direct search. We bar third-party recruiter syndications, agency markup, and spam applicant brokers.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ExternalLink size={20} />
          </div>
          <h3 className="text-base font-bold text-foreground">Direct Inflow to Your ATS</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Applicants are sent directly to your Greenhouse, Workday, Lever, Ashby, or corporate portal. You retain full ownership of candidate data.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers size={20} />
          </div>
          <h3 className="text-base font-bold text-foreground">Pre-Gated Experience Bar</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Only technical roles accepting 0 to 2 years of experience qualify. Your inbox will not be flooded by mid or senior level candidates.
          </p>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="space-y-4">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Transparent Pricing</p>
          <h2 className="text-2xl font-black text-foreground md:text-3xl">Hiring packages for high-growth tech teams</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose the plan that fits your early-career hiring volume.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Free Tier */}
          <div
            onClick={() => setTier("free")}
            className={`cursor-pointer rounded-2xl border p-6 transition-all ${
              tier === "free"
                ? "border-primary bg-card ring-2 ring-primary/20 shadow-sm"
                : "border-border bg-card hover:border-border/80"
            }`}
          >
            <h3 className="font-bold text-foreground">Community ATS Sync</h3>
            <p className="mt-1 text-xs text-muted-foreground">For companies with public ATS careers feeds.</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-black text-foreground">₹0</span>
              <span className="text-xs text-muted-foreground">/ free forever</span>
            </div>
            <ul className="mt-5 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Automated 150-min discovery sync</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Strict ≤ 2 YOE policy validation</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Direct ATS application redirect</li>
            </ul>
            <Button
              variant={tier === "free" ? "default" : "outline"}
              className="mt-6 w-full rounded-xl text-xs font-bold"
            >
              {tier === "free" ? "Selected Plan" : "Select Free"}
            </Button>
          </div>

          {/* Featured Tier */}
          <div
            onClick={() => setTier("featured")}
            className={`relative cursor-pointer rounded-2xl border p-6 transition-all ${
              tier === "featured"
                ? "border-primary bg-card ring-2 ring-primary/30 shadow-md"
                : "border-border bg-card hover:border-border/80"
            }`}
          >
            <span className="absolute -top-3 right-6 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
              Most Popular
            </span>
            <h3 className="font-bold text-foreground">Featured Post</h3>
            <p className="mt-1 text-xs text-muted-foreground">Spotlight your technical opening for 30 days.</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-black text-foreground">₹4,999</span>
              <span className="text-xs text-muted-foreground">/ $59 per post</span>
            </div>
            <ul className="mt-5 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2 font-medium text-foreground"><Check size={14} className="text-primary" /> Pinned spotlight atop results</li>
              <li className="flex items-center gap-2 font-medium text-foreground"><Check size={14} className="text-primary" /> Verified Employer badge</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Instant notification to subscribers</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Active 30 days with live performance metrics</li>
            </ul>
            <Button
              variant={tier === "featured" ? "default" : "outline"}
              className="mt-6 w-full rounded-xl bg-primary text-xs font-bold text-primary-foreground"
            >
              {tier === "featured" ? "Selected Plan" : "Select Featured"}
            </Button>
          </div>

          {/* Talent Partner */}
          <div
            onClick={() => setTier("partner")}
            className={`cursor-pointer rounded-2xl border p-6 transition-all ${
              tier === "partner"
                ? "border-primary bg-card ring-2 ring-primary/20 shadow-sm"
                : "border-border bg-card hover:border-border/80"
            }`}
          >
            <h3 className="font-bold text-foreground">Talent Partner</h3>
            <p className="mt-1 text-xs text-muted-foreground">Continuous high-volume early-career hiring.</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-black text-foreground">₹19,999</span>
              <span className="text-xs text-muted-foreground">/ $239 per month</span>
            </div>
            <ul className="mt-5 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Unlimited active featured postings</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Priority ATS synchronization queue</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Dedicated company profile page</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-primary" /> Direct support and custom analytics</li>
            </ul>
            <Button
              variant={tier === "partner" ? "default" : "outline"}
              className="mt-6 w-full rounded-xl text-xs font-bold"
            >
              {tier === "partner" ? "Selected Plan" : "Select Partner"}
            </Button>
          </div>
        </div>
      </section>

      {/* Submission Form */}
      <section id="employer-submit-form" className="rounded-3xl border border-border bg-card p-6 md:p-8 shadow-xs">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Send size={14} /> Self-Serve Submission
          </div>
          <h2 className="mt-1 text-2xl font-black text-foreground">
            Submit a job opening ({tier === "free" ? "Free ATS Sync" : tier === "featured" ? "Featured Post" : "Talent Partner"})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Our automated collector validates requirements against the 0 to 2 years experience policy before publishing.
          </p>

          {submitted ? (
            <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-6 text-foreground">
              <div className="flex items-center gap-2 text-primary font-bold">
                <Check size={18} /> Opening successfully submitted!
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Thank you, <strong>{company}</strong>. We have queued <strong>{title}</strong> for automated policy verification.
                Confirmation has been logged for <strong>{email}</strong>. Once verified, it will appear in the next 150-minute discovery cycle.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                  setTitle("");
                  setUrl("");
                  setSkills("");
                }}
                className="mt-4 rounded-xl text-xs font-semibold"
              >
                Submit another opening
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="emp-title" className="block text-xs font-bold text-foreground">
                    Role Title *
                  </label>
                  <input
                    id="emp-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Associate Software Engineer"
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="emp-company" className="block text-xs font-bold text-foreground">
                    Company Name *
                  </label>
                  <input
                    id="emp-company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Acme Tech"
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="emp-url" className="block text-xs font-bold text-foreground">
                  Official ATS / Careers Job URL *
                </label>
                <input
                  id="emp-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/acme/jobs/..."
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="emp-location" className="block text-xs font-bold text-foreground">
                    Location Hub *
                  </label>
                  <select
                    id="emp-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  >
                    <option value="Bengaluru">Bengaluru</option>
                    <option value="Hyderabad">Hyderabad</option>
                    <option value="Bengaluru / Hyderabad">Both Bengaluru & Hyderabad</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="emp-skills" className="block text-xs font-bold text-foreground">
                    Key Tech Stack (comma separated)
                  </label>
                  <input
                    id="emp-skills"
                    type="text"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="Python, React, Docker, AWS"
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="emp-email" className="block text-xs font-bold text-foreground">
                  Work Email (recruiter or hiring manager) *
                </label>
                <input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="recruiter@acme.com"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="rounded-xl bg-primary px-6 py-2.5 font-bold text-primary-foreground shadow-sm"
                >
                  <Check size={16} /> Submit for Verification
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Employer FAQ */}
      <section className="rounded-3xl border border-border bg-muted/30 p-6 md:p-8">
        <h3 className="text-lg font-bold text-foreground">Employer Frequently Asked Questions</h3>
        <div className="mt-4 space-y-3 text-xs text-muted-foreground">
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="font-bold text-foreground">How does JobRadar verify our zero to two years criteria?</h4>
            <p className="mt-1 leading-relaxed">
              Our automated parsing pipeline analyzes the job description text against strict rules. If the minimum required experience is greater than 2 years, it is ineligible. Standard titles such as Junior, Associate, Graduate, and SDE 1 qualify directly.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="font-bold text-foreground">Do we need to install an ATS plugin or integration?</h4>
            <p className="mt-1 leading-relaxed">
              No software or plugin required. We index public company career portals directly via Greenhouse, Workday, Lever, Ashby, and SmartRecruiters without accessing any private systems.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="font-bold text-foreground">How fast does a submitted opening go live?</h4>
            <p className="mt-1 leading-relaxed">
              Self-serve openings enter our automated verification queue immediately. Once the URL and 0–2 YOE parameters validate, the role publishes live in the next 150-minute discovery cycle.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
