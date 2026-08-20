import { useEffect, useRef } from "react";
import {
  Bold,
  ChevronDown,
  Italic,
  List as ListIcon,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import {
  editorialRichTextToPlainText,
  sanitizeEditorialRichText,
} from "@/lib/editorial-rich-text";

export function EditorialRichTextToolbar({
  editorRef,
  onChange,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  onChange: (value: string) => void;
}) {
  const run = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };
  const button = (label: string, icon: React.ReactNode, command: string, value?: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={event => {
        event.preventDefault();
        run(command, value);
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/20 px-2 py-1">
      {button("Bold", <Bold className="h-3.5 w-3.5" />, "bold")}
      {button("Italic", <Italic className="h-3.5 w-3.5" />, "italic")}
      {button("Underline", <Underline className="h-3.5 w-3.5" />, "underline")}
      <span className="mx-1 h-4 w-px bg-border" />
      {button("Heading", <span className="text-xs font-bold">H</span>, "formatBlock", "h3")}
      {button("Small heading", <span className="text-[10px] font-bold">H₂</span>, "formatBlock", "h4")}
      <span className="mx-1 h-4 w-px bg-border" />
      {button("Bulleted list", <ListIcon className="h-3.5 w-3.5" />, "insertUnorderedList")}
      {button("Numbered list", <ListOrdered className="h-3.5 w-3.5" />, "insertOrderedList")}
      {button("Quote", <Quote className="h-3.5 w-3.5" />, "formatBlock", "blockquote")}
      {button("Clear formatting", <RemoveFormatting className="h-3.5 w-3.5" />, "removeFormat")}
    </div>
  );
}

export function EditorialRichTextField({
  value,
  placeholder,
  onFocus,
  onChange,
  onBlur,
  minHeight = 150,
  className = "",
}: {
  value: string;
  placeholder: string;
  onFocus?: () => void;
  onChange: (value: string) => void;
  onBlur?: () => void;
  minHeight?: number;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current && editorRef.current) {
      const next = sanitizeEditorialRichText(value);
      if (editorRef.current.innerHTML !== next) editorRef.current.innerHTML = next;
    }
  }, [value]);

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-background transition-colors focus-within:border-[#1B2A4A]/40 focus-within:ring-1 focus-within:ring-[#1B2A4A]/10 ${className}`}>
      <EditorialRichTextToolbar editorRef={editorRef} onChange={onChange} />
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onFocus={() => {
          focusedRef.current = true;
          onFocus?.();
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (editorRef.current) onChange(sanitizeEditorialRichText(editorRef.current.innerHTML));
          onBlur?.();
        }}
        onInput={event => onChange((event.currentTarget as HTMLDivElement).innerHTML)}
        data-placeholder={placeholder}
        className="px-4 py-3 text-sm leading-relaxed outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
        style={{
          minHeight,
          resize: "vertical",
          overflowY: "auto",
          fontFamily: "'Spectral', Georgia, serif",
        }}
      />
    </div>
  );
}

export function EditorialRichTextPreview({ value }: { value: string }) {
  return (
    <div
      className="text-[13px] leading-relaxed text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_h3]:mb-1 [&_h3]:font-semibold [&_h4]:mb-1 [&_h4]:font-medium [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[#C87560]/40 [&_blockquote]:pl-3 [&_blockquote]:italic"
      dangerouslySetInnerHTML={{ __html: sanitizeEditorialRichText(value) }}
    />
  );
}

export function EditorialSection({
  title,
  hint,
  open,
  onToggle,
  children,
  preview,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  preview?: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-muted/20"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {hint && <span className="mt-1 block text-[11.5px] text-muted-foreground">{hint}</span>}
          {!open && preview && (
            <span className="mt-2 block truncate text-xs text-muted-foreground/80">{preview}</span>
          )}
        </span>
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>}
    </section>
  );
}

export { editorialRichTextToPlainText, sanitizeEditorialRichText };