/**
 * The single source of truth for API error codes.
 *
 * The backend throws these, the frontend switches on them. Adding a code here
 * and nowhere else is what keeps the error contract honest in both directions.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  DUPLICATE_DOCUMENT_NUMBER: 'DUPLICATE_DOCUMENT_NUMBER',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  BUSINESS_RULE_ERROR: 'BUSINESS_RULE_ERROR',
  IMMUTABLE_RESOURCE: 'IMMUTABLE_RESOURCE',
  CHANGE_REASON_REQUIRED: 'CHANGE_REASON_REQUIRED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Human-readable fallbacks, used when a thrower does not supply a message. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Some of the submitted values are not valid.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: 'The email address or password is incorrect.',
  ACCOUNT_LOCKED: 'This account is temporarily locked. Try again later.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested record was not found.',
  DUPLICATE_RESOURCE: 'A record with these details already exists.',
  DUPLICATE_DOCUMENT_NUMBER: 'That document number is already in use.',
  INVALID_REFERENCE: 'A referenced record does not exist.',
  INVALID_STATUS_TRANSITION: 'That status change is not allowed from the current status.',
  BUSINESS_RULE_ERROR: 'This action conflicts with a business rule.',
  IMMUTABLE_RESOURCE: 'This record can no longer be changed.',
  CHANGE_REASON_REQUIRED: 'A reason is required when changing an issued document.',
  FILE_TOO_LARGE: 'The file is larger than the allowed size.',
  UNSUPPORTED_FILE_TYPE: 'That file type is not allowed.',
  PDF_GENERATION_FAILED: 'The document could not be rendered. Please try again.',
  EMAIL_SEND_FAILED: 'The email could not be sent. The document was not changed.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  SERVICE_UNAVAILABLE: 'A required service is unavailable.',
  INTERNAL_ERROR: 'Something went wrong on our side.',
};
