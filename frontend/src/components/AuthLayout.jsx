import React from "react";
import { Link } from "react-router-dom";

export function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="flex min-h-screen items-stretch bg-background text-foreground">
      {/* Left visual pane — hidden on small */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background md:flex">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_10%,hsl(15_100%_62%_/0.35),transparent_40%),radial-gradient(circle_at_80%_80%,hsl(15_100%_62%_/0.25),transparent_45%)]" />
        <div className="relative z-10 max-w-lg px-10 py-16">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground shadow-xl shadow-primary/40">
              P
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight">PostMePlex</div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Creator platform
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            Post. <span className="text-primary">Publish.</span>
            <br /> Go live.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            The home for gamers, streamers, and every clutch moment — now on the web.
            Write long-form blogs, upload long videos, and chat with your squad from
            any browser.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3 text-sm">
            {["Blogs & long videos", "1:1 & Squad chats", "Audio livestreams"].map((f) => (
              <div key={f} className="rounded-xl border border-border bg-card/70 p-3 text-center">
                <span className="font-semibold">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form pane */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 md:hidden">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black">
                P
              </div>
              <span className="text-xl font-black">PostMePlex</span>
            </Link>
          </div>
          <div className="mb-8">
            <h2 className="text-3xl font-black tracking-tight">{title}</h2>
            {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
