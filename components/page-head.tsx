import type { ReactNode } from "react";
import ui from "./ui.module.css";

/** The kicker / title / lede block every admin page opens with. */
export function PageHead({
  kicker,
  title,
  children,
  actions,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={ui.head}>
      <div>
        <p className={ui.kicker}>{kicker}</p>
        <h1 className={ui.title}>{title}</h1>
        {children && <div className={ui.lede}>{children}</div>}
      </div>
      {actions && <div className={ui.actions}>{actions}</div>}
    </header>
  );
}
