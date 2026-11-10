import { useState, useEffect, type FormEvent } from "react";
import { X, CheckCircle2, Building2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmployerPostingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTier?: "free" | "featured" | "partner";
}

export function EmployerPostingModal({
  isOpen,
  onClose,
  defaultTier = "featured",
}: EmployerPostingModalProps) {
  const [tier, setTier] = useState<"free" | "featured" | "partner">(defaultTier);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState<"Bengaluru" | "Hyderabad" | "Bengaluru & Hyderabad">("Bengaluru");
  const [experience, setExperience] = useState<"0-1 years" | "1-2 years" | "Fresher / Intern">("0-1 years");
  const [skills, setSkills] = useState("");
  const [email, setEmail] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setTier(defaultTier);
  }, [defaultTier]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = "Job title is required";
    if (!company.trim()) newErrors.company = "Company name is required";

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      newErrors.url = "Official ATS link is required";
    } else if (!/^https?:\/\//i.test(trimmedUrl)) {
      newErrors.url = "Please enter a valid URL starting with https://";
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      newErrors.email = "Contact email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = "Please enter a valid work email address";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitted(true);
  };

  const handleReset = () => {
    setTitle("");
    setCompany("");
    setUrl("");
    setSkills("");
    setEmail("");
    setSubmitted(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="employer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 md:p-8 shadow-2xl transition-all">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X size={18} />
        </button>

        {submitted ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={36} />
            </div>
            <h3 id="employer-modal-title" className="heading-5 text-foreground mb-2">
              Opening Submitted for Verification
            </h3>
            <p className="body-4 text-muted-foreground max-w-md mx-auto mb-6">
              Thank you! Our automated pipeline will verify{" "}
              <strong className="text-foreground">{title}</strong> at{" "}
              <strong className="text-foreground">{company}</strong> against our zero to two years experience policy.
              A status confirmation has been logged for <span className="text-primary">{email}</span>.
            </p>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 mb-6 text-left text-xs space-y-2 text-muted-foreground">
              <p>
                <strong className="text-foreground">Package:</strong>{" "}
                {tier === "partner" ? "Talent Partner (₹19,999 / mo)" : tier === "featured" ? "Featured Post (₹4,999)" : "Community ATS (Free)"}
              </p>
              <p>
                <strong className="text-foreground">Target location:</strong> {location}
              </p>
              <p>
                <strong className="text-foreground">Ingestion window:</strong> Within 150 minutes
              </p>
            </div>
            <Button onClick={handleReset} className="button-md rounded-xl bg-white text-zinc-950 hover:bg-zinc-100">
              Done and return to dashboard
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <div className="caption-3 mb-2 flex items-center gap-2 uppercase tracking-[.18em] text-primary">
                <Building2 size={16} />
                Employer Hiring Portal
              </div>
              <h2 id="employer-modal-title" className="heading-5 text-foreground">
                Post an early career opening
              </h2>
              <p className="body-5 mt-1 text-muted-foreground">
                Reach thousands of verified zero to two years experience developers across Bengaluru and Hyderabad.
              </p>
            </div>

            {/* Plan selection */}
            <div className="mb-5 grid grid-cols-3 gap-2">
              {[
                { id: "free", label: "Community", price: "Free" },
                { id: "featured", label: "Featured", price: "₹4,999", popular: true },
                { id: "partner", label: "Partner", price: "₹19,999" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTier(item.id as typeof tier)}
                  className={`relative rounded-xl border p-2.5 text-center transition-colors ${
                    tier === item.id
                      ? "border-primary bg-primary/10 text-foreground font-semibold"
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {item.popular && (
                    <span className="absolute -top-2 right-2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-black uppercase">
                      Popular
                    </span>
                  )}
                  <div className="caption-3">{item.label}</div>
                  <div className="body-6 text-foreground font-bold">{item.price}</div>
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="caption-2 mb-1 block text-foreground font-medium">
                  Job title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Associate Software Engineer, Junior DevOps"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
                {errors.title && (
                  <p className="caption-4 mt-1 flex items-center gap-1 text-red-400">
                    <AlertCircle size={12} /> {errors.title}
                  </p>
                )}
              </div>

              <div>
                <label className="caption-2 mb-1 block text-foreground font-medium">
                  Company name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Swiggy, Zerodha, Razorpay"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
                {errors.company && (
                  <p className="caption-4 mt-1 flex items-center gap-1 text-red-400">
                    <AlertCircle size={12} /> {errors.company}
                  </p>
                )}
              </div>

              <div>
                <label className="caption-2 mb-1 block text-foreground font-medium">
                  Official ATS or career posting URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://jobs.lever.co/company/role-id or workday link"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
                {errors.url && (
                  <p className="caption-4 mt-1 flex items-center gap-1 text-red-400">
                    <AlertCircle size={12} /> {errors.url}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="caption-2 mb-1 block text-foreground font-medium">Target city</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value as typeof location)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                  >
                    <option value="Bengaluru">Bengaluru</option>
                    <option value="Hyderabad">Hyderabad</option>
                    <option value="Bengaluru & Hyderabad">Both cities</option>
                  </select>
                </div>

                <div>
                  <label className="caption-2 mb-1 block text-foreground font-medium">Experience bracket</label>
                  <select
                    value={experience}
                    onChange={(e) => setExperience(e.target.value as typeof experience)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                  >
                    <option value="0-1 years">0 to 1 years</option>
                    <option value="1-2 years">1 to 2 years</option>
                    <option value="Fresher / Intern">Fresher or Intern</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="caption-2 mb-1 block text-foreground font-medium">
                  Core skills (optional tags)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Python, Docker, React, PostgreSQL"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
              </div>

              <div>
                <label className="caption-2 mb-1 block text-foreground font-medium">
                  Your work email for receipts and verification <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="hiring@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
                {errors.email && (
                  <p className="caption-4 mt-1 flex items-center gap-1 text-red-400">
                    <AlertCircle size={12} /> {errors.email}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full button-md rounded-xl bg-white text-zinc-950 hover:bg-zinc-100 font-semibold py-2.5"
                >
                  <Sparkles size={16} />
                  Submit opening for verification
                </Button>
                <p className="caption-5 mt-2 text-center text-muted-foreground">
                  Roles exceeding two years minimum experience are barred to protect early career candidates.
                </p>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
