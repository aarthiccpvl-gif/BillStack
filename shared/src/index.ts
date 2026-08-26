/**
 * @app/shared — the contract between the API and the web app.
 *
 * Everything here must stay environment-agnostic: no Node built-ins, no DOM, no
 * framework imports. That is what allows the same validation schemas and the same
 * decimal arithmetic to run on the server (as the authority) and in the browser
 * (for instant preview) without any risk of the two drifting apart.
 */

/* constants */
export * from './constants/errorCodes';
export * from './constants/roles';
export * from './constants/permissions';
export * from './constants/documents';

/* types */
export * from './types/api';
export * from './types/auth';
export * from './types/masters';
export * from './types/document';
export * from './types/quotation';
export * from './types/invoice';
export * from './types/dashboard';
export * from './types/business';

/* schemas */
export * from './schemas/auth';
export * from './schemas/common';
export * from './schemas/company';
export * from './schemas/customer';
export * from './schemas/item';
export * from './schemas/masters';
export * from './schemas/template';
export * from './schemas/document';
export * from './schemas/quotation';
export * from './schemas/invoice';

/* finance */
export * from './finance/decimal';
export * from './finance/money';
export * from './finance/amountInWords';
export * from './finance/calculate';

/* utils */
export * from './utils/financialYear';
export * from './utils/documentNumber';
