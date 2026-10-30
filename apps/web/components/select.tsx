'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

type Option<Value extends string> = { value: Value; label: string };

/** A controlled choice menu, presented as a modal sheet on narrow screens. */
export function Select<Value extends string>({
  id,
  label,
  value,
  options,
  onValueChange,
  placeholder,
  describedBy,
  disabled = false,
}: {
  id?: string;
  label: string;
  value: Value | undefined;
  options: readonly Option<Value>[];
  onValueChange: (value: Value) => void;
  placeholder?: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    list.current?.children.item(active)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const close = () => dialog.current?.close();
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('resize', close);
      document.documentElement.style.overflow = overflow;
    };
  }, [open]);

  function show(last = false) {
    if (!trigger.current || !dialog.current || disabled || !options.length) return;
    const rect = trigger.current.getBoundingClientRect();
    if (window.matchMedia('(min-width: 640px)').matches) {
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const height = Math.min(380, Math.max(below, above));
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)),
        width: Math.min(rect.width, window.innerWidth - 24),
        maxHeight: height,
        top: below >= Math.min(380, above) ? rect.bottom + 8 : undefined,
        bottom: below >= Math.min(380, above) ? undefined : window.innerHeight - rect.top + 8,
      });
    } else {
      setPosition(undefined);
    }
    const index = options.findIndex((option) => option.value === value);
    let initial = last ? options.length - 1 : 0;
    if (index >= 0) initial = index;
    setActive(initial);
    search.current = { text: '', time: 0 };
    dialog.current.showModal();
    setOpen(true);
    list.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    dialog.current?.close();
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      choose(active);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (key === 'Home') setActive(0);
      if (key === 'End') setActive(options.length - 1);
      if (key === 'ArrowDown') setActive((index) => (index + 1) % options.length);
      if (key === 'ArrowUp') setActive((index) => (index + options.length - 1) % options.length);
      return;
    }
    if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const previous = Date.now() - search.current.time < 700 ? search.current.text : '';
    const text = previous === key ? key : previous + key;
    search.current = { text, time: Date.now() };
    const collator = new Intl.Collator(locale, { sensitivity: 'base', usage: 'search' });
    for (let offset = 1; offset <= options.length; offset++) {
      const index = (active + offset) % options.length;
      if (collator.compare(options[index]!.label.slice(0, text.length), text) === 0) {
        setActive(index);
        break;
      }
    }
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${uid}-dialog`}
        disabled={disabled || !options.length}
        className="select-trigger"
        onClick={() => show()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show(event.key === 'ArrowUp');
          }
        }}
      >
        <span className={selected ? 'min-w-0' : 'min-w-0 text-muted'}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <dialog
        ref={dialog}
        id={`${uid}-dialog`}
        aria-labelledby={`${uid}-title`}
        className="select-dialog"
        style={position}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onClose={() => {
          // A queued close event can arrive after the chooser has reopened.
          if (dialog.current?.open) return;
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <div className="select-panel">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
            <h2 id={`${uid}-title`} className="text-base font-semibold">
              {label}
            </h2>
            <button
              type="button"
              aria-label={t('selectClose')}
              onClick={() => dialog.current?.close()}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-tint"
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="m6 6 12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div
            ref={list}
            role="listbox"
            tabIndex={0}
            aria-labelledby={`${uid}-title`}
            aria-activedescendant={`${uid}-option-${active}`}
            className="select-options"
            onKeyDown={navigate}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${uid}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === active}
                className="select-option"
                onClick={() => choose(index)}
                onPointerMove={() => setActive(index)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <svg
                    aria-hidden="true"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0 text-accent"
                  >
                    <path
                      d="m5 12 4 4L19 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
