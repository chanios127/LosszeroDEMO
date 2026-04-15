import { useState, useRef, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (query: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  };

  return (
    <div className="flex gap-2 p-4 border-t border-slate-800">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="자연어로 데이터를 조회하세요..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-lg bg-slate-800 px-4 py-3 text-sm
          text-slate-100 placeholder-slate-500 outline-none
          focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium
          text-white transition hover:bg-brand-700
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {disabled ? "처리 중..." : "전송"}
      </button>
    </div>
  );
}
