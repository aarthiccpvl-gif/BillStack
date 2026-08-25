import type { ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';

/**
 * Form primitives.
 *
 * Every control is labelled, and its error is wired through `aria-describedby` so
 * assistive technology announces the problem rather than just the red border.
 */

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: FieldError | { message?: string };
  help?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export const Field = ({
  label,
  htmlFor,
  error,
  help,
  required,
  className = 'mb-3',
  children,
}: FieldProps) => (
  <div className={className}>
    <label className="form-label" htmlFor={htmlFor}>
      {label}
      {required && (
        <span className="text-danger ms-1" aria-hidden>
          *
        </span>
      )}
      {!required && <span className="text-secondary fw-normal small ms-1">(optional)</span>}
    </label>
    {children}
    {error?.message ? (
      <div className="invalid-feedback d-block" id={`${htmlFor}-error`}>
        {error.message}
      </div>
    ) : (
      help && (
        <div className="form-text" id={`${htmlFor}-help`}>
          {help}
        </div>
      )
    )}
  </div>
);

export const inputClass = (error?: unknown): string => `form-control${error ? ' is-invalid' : ''}`;
export const selectClass = (error?: unknown): string => `form-select${error ? ' is-invalid' : ''}`;

export const describedBy = (id: string, error?: unknown, help?: string): string | undefined => {
  if (error) return `${id}-error`;
  if (help) return `${id}-help`;
  return undefined;
};

/** A titled group of fields inside a settings or editor card. */
export const FieldGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="mb-4">
    <legend className="label-caps mb-3">{title}</legend>
    {children}
  </fieldset>
);
