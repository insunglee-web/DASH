import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  badge,
  footer,
  children,
}: {
  title: string;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {badge}
      </div>
      <div className="flex-1 px-4 py-4">{children}</div>
      {footer ? <div className="border-t border-border px-4 py-2.5 text-sm">{footer}</div> : null}
    </section>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

type StatusTone = "ok" | "warn" | "off";

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const styles: Record<StatusTone, string> = {
    ok: "bg-ok/10 text-ok",
    warn: "bg-important/10 text-important",
    off: "bg-surface-muted text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
