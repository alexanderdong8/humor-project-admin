"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

const SECTIONS = [
  { title: null, links: [{ href: "/", label: "Overview", icon: "◎" }] },
  {
    title: "People",
    links: [
      { href: "/users", label: "Users", icon: "◐" },
      { href: "/votes", label: "Votes & ratings", icon: "▲" },
    ],
  },
  {
    title: "Content",
    links: [
      { href: "/media", label: "AI media", icon: "▣" },
      { href: "/images", label: "Images", icon: "◫" },
    ],
  },
  {
    title: "AI pipeline",
    links: [
      { href: "/chains", label: "Prompt chains", icon: "⛓" },
      { href: "/terms", label: "Terms", icon: "¶" },
      { href: "/examples", label: "Examples", icon: "❝" },
      { href: "/models", label: "LLM models", icon: "◇" },
      { href: "/providers", label: "LLM providers", icon: "◆" },
      { href: "/requests", label: "Requests", icon: "→" },
      { href: "/responses", label: "LLM responses", icon: "←" },
    ],
  },
  {
    title: "Access",
    links: [
      { href: "/access/domains", label: "Sign-up domains", icon: "@" },
      { href: "/access/emails", label: "Whitelisted emails", icon: "✉" },
    ],
  },
];

export function WingNav() {
  const pathname = usePathname();
  const current = (href: string) =>
    (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined;

  return (
    <nav className={styles.nav} aria-label="Admin">
      {SECTIONS.map((section) => (
        <div key={section.title ?? "home"} className={styles.navSection}>
          {section.title && <span className={styles.navTitle}>{section.title}</span>}
          {section.links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current(link.href)}>
              <span className={styles.navIcon} aria-hidden="true">
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
