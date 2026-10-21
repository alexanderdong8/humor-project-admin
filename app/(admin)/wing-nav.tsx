"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

const LINKS = [
  { href: "/", label: "Overview", icon: "◎" },
  { href: "/users", label: "Users", icon: "◐" },
  { href: "/media", label: "AI media", icon: "▣" },
  { href: "/votes", label: "Votes & ratings", icon: "▲" },
];

export function WingNav() {
  const pathname = usePathname();
  const current = (href: string) =>
    (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined;

  return (
    <nav className={styles.nav} aria-label="Admin">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={current(link.href)}>
          <span className={styles.navIcon} aria-hidden="true">
            {link.icon}
          </span>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
