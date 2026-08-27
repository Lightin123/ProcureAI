import React, { useEffect, useRef } from "react";
import { CloseIcon } from "./GovernmentIcons.js";

export interface GovernmentModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function GovernmentModal({
  isOpen,
  title,
  onClose,
  children,
  footer,
}: GovernmentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="gov-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="gov-modal-dialog" ref={modalRef}>
        <div className="gov-modal-header">
          <h3 className="gov-modal-title" id="modal-title">
            {title}
          </h3>
          <button
            type="button"
            className="gov-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="gov-modal-body">{children}</div>
        {footer && <div className="gov-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
