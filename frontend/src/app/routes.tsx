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
import { InvoicesPage } from '@/modules/invoices/InvoicesPage';
import { InvoiceEditorPage } from '@/modules/invoices/InvoiceEditorPage';
import { InvoiceDetailPage } from '@/modules/invoices/InvoiceDetailPage';
import { DownloadsPage } from '@/modules/downloads/DownloadsPage';
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

      <Route path="invoices" element={guarded(PERMISSIONS.INVOICE_READ, <InvoicesPage />)} />
      <Route
        path="invoices/new"
        element={guarded(PERMISSIONS.INVOICE_CREATE, <InvoiceEditorPage />)}
      />
      <Route
        path="invoices/:id"
        element={guarded(PERMISSIONS.INVOICE_READ, <InvoiceDetailPage />)}
      />
      <Route
        path="invoices/:id/edit"
        element={guarded(PERMISSIONS.INVOICE_UPDATE, <InvoiceEditorPage />)}
      />

      <Route
        path="downloads"
        element={guarded(PERMISSIONS.DOCUMENT_BULK_DOWNLOAD, <DownloadsPage />)}
      />

      <Route path="customers" element={guarded(PERMISSIONS.CUSTOMER_READ, <CustomersPage />)} />
      <Route
        path="customers/:id"
        element={guarded(PERMISSIONS.CUSTOMER_READ, <CustomerDetailPage />)}
      />

      {/* Authoring screens are guarded on the permission that makes them useful,
          not on the read that other screens need — so the route a Finance Viewer
          cannot see in the sidebar is also one they cannot reach by typing it. */}
      <Route path="items" element={guarded(PERMISSIONS.ITEM_CREATE, <ItemsPage />)} />

      <Route path="templates" element={guarded(PERMISSIONS.TEMPLATE_UPDATE, <TemplatesPage />)} />
      <Route
        path="templates/:id"
        element={guarded(PERMISSIONS.TEMPLATE_UPDATE, <TemplateEditorPage />)}
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
        element={guarded(PERMISSIONS.COMPANY_UPDATE, <CompanySettingsPage />)}
      />

      <Route path="admin/masters" element={guarded(PERMISSIONS.MASTER_MANAGE, <MastersPage />)} />

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
