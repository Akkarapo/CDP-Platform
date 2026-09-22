import { createBrowserRouter, Navigate, Outlet } from "react-router";
import AppLayout from "./layouts/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Import from "./pages/Import";
import Products from "./pages/Products";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import SegmentProfile from "./pages/SegmentProfile";
import { useAuth } from "./lib/auth";

function ProtectedRoute() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireEditor() {
  const { canEditCampaigns } = useAuth();
  if (!canEditCampaigns) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: "/", element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/customers", element: <Customers /> },
          { path: "/customers/segment/:segment", element: <SegmentProfile /> },
          { path: "/products", element: <Products /> },
          {
            element: <RequireEditor />,
            children: [
              { path: "/import", element: <Import /> },
              { path: "/campaigns", element: <Campaigns /> },
            ],
          },
          { path: "/settings", element: <Settings /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
