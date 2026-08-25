import { Route, Routes } from 'react-router-dom';
import { PERMISSIONS, type Permission } from '@app/shared';
import { AppShell } from '@/layouts/AppShell';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { LoginPage } from '@/modules/auth/LoginPage';
import { ChangePasswordPage } from '@/modules/auth/ChangePasswordPage';
import { ProfilePage } from '@/modules/profile/ProfilePage';
import { AdminUsersPage } from '@/modules/users/AdminUsersPage';
import { CompanySettingsPage } from '@/modules/company/CompanySettingsPage';
import { MastersPage } from '@/modules/masters/MastersPage';
import { CustomersPage } from '@/modules/customers/CustomersPage';
import { CustomerDetailPage } from '@/modules/customers/CustomerDetailPage';
import { ItemsPage } from '@/modules/items/ItemsPage';
import { TemplatesPage } from '@/modules/templates/TemplatesPage';
import { QuotationsPage } from '@/modules/quotations/QuotationsPage';
import { QuotationEditorPage } from '@/modules/quotations/QuotationEditorPage';
import { QuotationDetailPage } from '@/modules/quotations/QuotationDetailPage';
import { TemplateEditorPage } from '@/modules/templates/TemplateEditorPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PhaseStub } from '@/components/PhaseStub';
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from '@/guards/RouteGuards';

/** Wraps a route element in the permission it requires. */
const guarded = (permission: Permission, element: JSX.Element) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

/**
 * Route table.
 *
 * Modules replace their stub as each phase lands; the stubs state which phase owns
 * the screen, so the shell is navigable without any fabricated data.
 */
export const AppRoutes = () => (
  <Routes>
    <Route
      path="/login"
      element={
        <RedirectIfAuthenticated>
          <LoginPage />
        </RedirectIfAuthenticated>
      }
    />

    {/* Outside the shell: a user who must change their password has no navigation. */}
    <Route
      path="/change-password"
      element={
        <RequireAuth>
          <ChangePasswordPage />
        </RequireAuth>
      }
    />

    <Route
      element={
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      }
    >
      <Route index element={guarded(PERMISSIONS.DASHBOARD_READ, <DashboardPage />)} />
      <Route path="profile" element={<ProfilePage />} />

      <Route path="quotations" element={guarded(PERMISSIONS.QUOTATION_READ, <QuotationsPage />)} />
      <Route
        path="quotations/new"
        element={guarded(PERMISSIONS.QUOTATION_CREATE, <QuotationEditorPage />)}
      />
      <Route
        path="quotations/:id"
        element={guarded(PERMISSIONS.QUOTATION_READ, <QuotationDetailPage />)}
      />
      <Route
        path="quotations/:id/edit"
        element={guarded(PERMISSIONS.QUOTATION_UPDATE, <QuotationEditorPage />)}
      />

      <Route
        path="invoices/*"
        element={guarded(
          PERMISSIONS.INVOICE_READ,
          <PhaseStub
            title="Invoices"
            phase={6}
            summary="Invoice list, editor and lifecycle, plus quotation conversion."
            scope={[
              'Everything the quotation module does, on the invoice status machine',
              'Issue, cancel and void with a recorded reason',
              'Due dates from payment terms, derived overdue state',
              'Manual payment status and amount paid',
            ]}
          />,
        )}
      />

      <Route path="customers" element={guarded(PERMISSIONS.CUSTOMER_READ, <CustomersPage />)} />
      <Route
        path="customers/:id"
        element={guarded(PERMISSIONS.CUSTOMER_READ, <CustomerDetailPage />)}
      />

      <Route path="items" element={guarded(PERMISSIONS.ITEM_READ, <ItemsPage />)} />

      <Route path="templates" element={guarded(PERMISSIONS.TEMPLATE_READ, <TemplatesPage />)} />
      <Route
        path="templates/:id"
        element={guarded(PERMISSIONS.TEMPLATE_READ, <TemplateEditorPage />)}
      />

      <Route
        path="reports/*"
        element={guarded(
          PERMISSIONS.REPORT_READ,
          <PhaseStub
            title="Reports"
            phase={8}
            summary="Quotation, invoice, customer and monthly summary reports."
            scope={['CSV, XLSX and PDF export that honours the active filters exactly']}
          />,
        )}
      />

      <Route path="admin/users/*" element={guarded(PERMISSIONS.USER_READ, <AdminUsersPage />)} />

      <Route
        path="admin/company"
        element={guarded(PERMISSIONS.COMPANY_READ, <CompanySettingsPage />)}
      />

      <Route path="admin/masters" element={guarded(PERMISSIONS.MASTER_READ, <MastersPage />)} />

      <Route
        path="admin/audit/*"
        element={guarded(
          PERMISSIONS.AUDIT_READ,
          <PhaseStub
            title="Audit Logs"
            phase={8}
            summary="Append-only record of every action, filterable by user, action and entity."
            scope={['Sign-ins, failed sign-ins and permission changes are already being recorded']}
          />,
        )}
      />

      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>
);
