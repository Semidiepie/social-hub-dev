import React from "react";

// Shared X-style page header: orange icon chip, bold title, optional subtitle,
// hairline divider and an optional right-side action. Used across utility pages
// (Wallet, Market, Settings, Notifications) to keep a single consistent look.
export function PageHeader({ title, subtitle, icon: Icon, right }) {
  return (
    <header className="mb-6 flex items-center gap-3 border-b border-border pb-4" data-testid="page-header">
      {Icon && (
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Icon size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
