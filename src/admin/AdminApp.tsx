import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { setMeta } from "@/hooks/use-seo";
import { AuthProvider } from "./auth";
import { RequireAdmin } from "./RequireAdmin";
import { AdminLayout } from "./AdminLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inquiries from "./pages/Inquiries";
import Products from "./pages/Products";
import ProductEdit from "./pages/ProductEdit";
import Brands from "./pages/Brands";
import Categories from "./pages/Categories";
import Industries from "./pages/Industries";
import Settings from "./pages/Settings";

/** Everything under /admin. Loaded only when someone opens the admin panel. */
export default function AdminApp() {
  // Keep the admin panel out of search engines (also while sign-in is still being checked).
  // Each admin page sets it too; public pages remove it again when you leave.
  useEffect(() => setMeta("name", "robots", "noindex, nofollow"), []);

  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="inquiries" element={<Inquiries />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductEdit />} />
          <Route path="products/:id" element={<ProductEdit />} />
          <Route path="brands" element={<Brands />} />
          <Route path="categories" element={<Categories />} />
          <Route path="industries" element={<Industries />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
