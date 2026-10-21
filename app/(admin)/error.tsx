"use client";

import { useEffect } from "react";
import ui from "@/components/ui.module.css";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={ui.empty} role="alert">
      <strong>Something went wrong loading this page.</strong>
      <span>{error.digest ? `Reference ${error.digest}` : "Check the server logs for details."}</span>
      <button type="button" className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
