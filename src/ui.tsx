import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, LoaderCircle, TriangleAlert } from 'lucide-react';

export function Metric({
  label,
  value,
  suffix,
  Icon,
}: {
  label: string;
  value: number;
  suffix: string;
  Icon: typeof Bell;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
    </div>
  );
}

export function EmptyState({
  Icon,
  title,
  text,
  action,
}: {
  Icon: typeof Bell;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Confirmation({
  title,
  text,
  label,
  action,
  onClose,
}: {
  title: string;
  text: string;
  label: string;
  action: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      returnFocus.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <span className="confirm-icon">
        <TriangleAlert size={24} />
      </span>
      <h2 id="confirm-title">{title}</h2>
      <p>{text}</p>
      <div>
        <button className="button secondary" autoFocus disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await action();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <LoaderCircle className="spin" size={16} />}
          {label}
        </button>
      </div>
    </dialog>
  );
}
