import { useRef, useState, type KeyboardEvent } from "react";
import { Button, Dot } from "./primitives";
import { IconSend, IconStop } from "./icons";

interface ChatInputProps {
  onSend: (query: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  domainLabel?: string;
}

export default function ChatInput({
  onSend,
  onStop,
  disabled,
  domainLabel,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div style={{ padding: "12px 20px 18px", background: "var(--bg)" }}>
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-md)",
          transition: "border-color 120ms",
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor =
            "color-mix(in oklch, var(--brand-500) 45%, var(--border))";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="자연어로 데이터를 조회하세요... (Shift+Enter: 줄바꿈)"
          style={{
            display: "block",
            width: "100%",
            padding: "14px 16px 4px",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: 14,
            color: "var(--text-strong)",
            lineHeight: 1.5,
            fontFamily: "var(--font-sans)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 10px 8px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            <span
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Dot tone="success" /> MSSQL · prod_qa
            </span>
            {domainLabel && (
              <>
                <span>·</span>
                <span>{domainLabel}</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--text-faint)" }}
            >
              <span className="kbd">↵</span> 전송
            </span>
            {disabled ? (
              <Button variant="danger" size="sm" onClick={onStop}>
                <IconStop />
                <span>중지</span>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={!value.trim()}
              >
                <IconSend />
                <span>전송</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
