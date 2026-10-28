"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createMedia, generateCaptions, type ActionState } from "../actions";
import ui from "@/components/ui.module.css";
import styles from "../media.module.css";

export type Template = { id: string; name: string; url: string; width: number; height: number };
export type LibraryImage = { id: string; url: string; description: string | null };

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 6 * 1024 * 1024;

type Props = {
  userId: string;
  templates: Template[];
  library: LibraryImage[];
  /** Preselected from the Images page ("Caption it"). */
  initialImage?: LibraryImage | null;
  defaultTheme: string;
  defaultAuthor: string;
  voices: { value: string; label: string; example: string }[];
};

export function CreateForm({ userId, templates, library, initialImage, defaultTheme, defaultAuthor, voices }: Props) {
  const [source, setSource] = useState<"template" | "library" | "upload">(
    initialImage ? "library" : templates.length > 0 ? "template" : "upload",
  );
  const [imageUrl, setImageUrl] = useState(initialImage?.url ?? "");
  const [templateName, setTemplateName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [voice, setVoice] = useState(voices[0]?.value ?? "groupchat");
  const [theme, setTheme] = useState(defaultTheme);
  const [captions, setCaptions] = useState(["", "", "", ""]);
  const [chosen, setChosen] = useState(0);
  const [ai, setAi] = useState<{ prompt: string; model: string; requestId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();
  const [state, action, saving] = useActionState<ActionState, FormData>(createMedia, { status: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);

  function pickTemplate(t: Template) {
    setImageUrl(t.url);
    setTemplateName(t.name);
    setError(null);
  }

  async function upload(file: File) {
    setError(null);
    const ext = TYPES[file.type];
    if (!ext) return setError("Use a JPEG, PNG, or WebP image.");
    if (file.size > MAX_BYTES) return setError("Keep it under 6 MB.");
    setUploading(true);
    // Into the admin's own folder of the caption-photos bucket, like any member upload.
    const path = `${userId}/admin-${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("caption-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (uploadError) return setError(`Upload failed: ${uploadError.message}`);
    setImageUrl(supabase.storage.from("caption-photos").getPublicUrl(path).data.publicUrl);
    setTemplateName("");
  }

  function generate() {
    setError(null);
    startGenerating(async () => {
      const result = await generateCaptions({ imageUrl, voice, theme, templateName: templateName || undefined });
      if (!result.ok) return setError(result.error);
      setCaptions([0, 1, 2, 3].map((i) => result.captions[i] ?? ""));
      setChosen(0);
      setAi({ prompt: result.prompt, model: result.model, requestId: result.requestId });
    });
  }

  const hasCaption = captions.some((c) => c.trim());

  return (
    <form action={action} className={styles.steps}>
      <input type="hidden" name="imageUrl" value={imageUrl} />
      <input type="hidden" name="templateName" value={templateName} />
      <input type="hidden" name="prompt" value={ai?.prompt ?? ""} />
      <input type="hidden" name="model" value={ai?.model ?? ""} />
      <input type="hidden" name="requestId" value={ai?.requestId ?? ""} />

      <section className={`${ui.card} ${styles.step}`}>
        <h2 className={ui.cardTitle}>
          <span className={styles.stepNum}>1</span>Image
        </h2>
        <div className={styles.sourceTabs} role="group" aria-label="Image source">
          <button type="button" aria-pressed={source === "template"} onClick={() => setSource("template")}>
            Meme template
          </button>
          <button type="button" aria-pressed={source === "library"} onClick={() => setSource("library")}>
            Image library
          </button>
          <button type="button" aria-pressed={source === "upload"} onClick={() => setSource("upload")}>
            Upload a photo
          </button>
        </div>

        {source === "library" ? (
          library.length === 0 ? (
            <div className={ui.empty}>The image library is empty. Upload one on the Images page or below.</div>
          ) : (
            <ul className={styles.templates}>
              {library.map((img) => (
                <li key={img.id}>
                  <button
                    type="button"
                    aria-pressed={imageUrl === img.url}
                    onClick={() => {
                      setImageUrl(img.url);
                      setTemplateName("");
                      setError(null);
                    }}
                    title={img.description ?? "Library image"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" loading="lazy" />
                    <span className={ui.clamp}>{img.description ?? "Untitled"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : source === "template" ? (
          templates.length === 0 ? (
            <div className={ui.empty}>Imgflip&apos;s templates didn&apos;t load. Upload a photo instead.</div>
          ) : (
            <ul className={styles.templates}>
              {templates.map((t) => (
                <li key={t.id}>
                  <button type="button" aria-pressed={imageUrl === t.url} onClick={() => pickTemplate(t)} title={t.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.url} alt="" loading="lazy" />
                    <span className={ui.clamp}>{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <button type="button" className={styles.drop} onClick={() => fileInput.current?.click()} disabled={uploading}>
              <strong>{uploading ? "Uploading…" : "Choose a photo"}</strong>
              <span>JPEG, PNG, or WebP, up to 6 MB. It&apos;s stored in Supabase Storage.</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </>
        )}

        {imageUrl && (
          <div className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Selected image" />
            <span className={ui.muted}>
              {templateName
                ? `“${templateName}” meme template`
                : (library.find((l) => l.url === imageUrl)?.description ?? "Your photo")}
            </span>
          </div>
        )}
      </section>

      <section className={`${ui.card} ${styles.step}`}>
        <h2 className={ui.cardTitle}>
          <span className={styles.stepNum}>2</span>Captions
        </h2>
        <div className={styles.formRow}>
          <label className="field">
            <span>Caption style</span>
            <select className="input" name="voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {voices.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Theme</span>
            <input className="input" name="theme" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={120} />
          </label>
        </div>
        <p className={ui.muted}>
          Sounds like: <em>“{voices.find((v) => v.value === voice)?.example}”</em>
        </p>
        <div className={styles.formActions}>
          <button type="button" className="btn btn-primary" onClick={generate} disabled={!imageUrl || generating}>
            {generating ? "Gemini is writing…" : hasCaption ? "↻ Write 4 new captions" : "✨ Write 4 captions with Gemini"}
          </button>
          <span className={ui.muted} role="status">
            {generating
              ? "Usually about 10 seconds."
              : ai
                ? `Written by ${ai.model}. Edit them freely.`
                : "Or type your own below."}
          </span>
        </div>

        <fieldset className={styles.steps}>
          <legend className="sr-only">Captions, and which one goes on the photo</legend>
          {captions.map((text, i) => (
            <div key={i} className={styles.draftCaption}>
              <input
                type="radio"
                name="chosen"
                value={i}
                checked={chosen === i}
                onChange={() => setChosen(i)}
                aria-label={`Put caption ${i + 1} on the photo`}
                disabled={!text.trim()}
              />
              <textarea
                className="input"
                name={`caption${i}`}
                rows={2}
                maxLength={280}
                value={text}
                placeholder={`Caption ${i + 1}`}
                onChange={(e) => setCaptions((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
              />
            </div>
          ))}
        </fieldset>
      </section>

      <section className={`${ui.card} ${styles.step}`}>
        <h2 className={ui.cardTitle}>
          <span className={styles.stepNum}>3</span>Publish
        </h2>
        <label className="field">
          <span>Shown as author</span>
          <input className="input" name="author" defaultValue={defaultAuthor} maxLength={60} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="publish" defaultChecked /> Publish now with the selected caption (the other
          captions are discarded, like a finished caption battle). Unchecked saves a draft with all of them.
        </label>
        {(error || state.status === "error") && (
          <p className={ui.error} role="alert">
            {error ?? state.message}
          </p>
        )}
        <div className={styles.formActions}>
          <button type="submit" className="btn btn-sun" disabled={!imageUrl || !captions[chosen]?.trim() || saving}>
            {saving ? "Creating…" : "Create media"}
          </button>
        </div>
      </section>
    </form>
  );
}
