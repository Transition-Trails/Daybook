import Dashboard from '@/pages/dashboard';
import ThemesList from '@/pages/catalog/themes/list';
import ThemeDetail from '@/pages/catalog/themes/detail';
import PacksList from '@/pages/catalog/packs/list';
import PackDetail from '@/pages/catalog/packs/detail';
import InsertsList from '@/pages/catalog/inserts/list';
import InsertDetail from '@/pages/catalog/inserts/detail';
import ProductsList from '@/pages/catalog/products/list';
import ProductDetail from '@/pages/catalog/products/detail';
import EditionsList from '@/pages/editions/list';
import EditionDetail from '@/pages/editions/detail';
import PlansList from '@/pages/plans/index';
import UsersList from '@/pages/users/list';
import UserDetail from '@/pages/users/detail';
import AiSettingsPage from '@/pages/ai-settings';
import SyncDashboard from '@/pages/sync';
import TrendsResearch from '@/pages/trends';

export const routes = [
  { path: "/", component: Dashboard },
  { path: "/catalog/themes", component: ThemesList },
  { path: "/catalog/themes/:id", component: ThemeDetail },
  { path: "/catalog/packs", component: PacksList },
  { path: "/catalog/packs/:id", component: PackDetail },
  { path: "/catalog/inserts", component: InsertsList },
  { path: "/catalog/inserts/:id", component: InsertDetail },
  { path: "/catalog/products", component: ProductsList },
  { path: "/catalog/products/:id", component: ProductDetail },
  { path: "/editions", component: EditionsList },
  { path: "/editions/:id", component: EditionDetail },
  { path: "/plans", component: PlansList },
  { path: "/users", component: UsersList },
  { path: "/users/:id", component: UserDetail },
  { path: "/ai-settings", component: AiSettingsPage },
  { path: "/sync", component: SyncDashboard },
  { path: "/trends", component: TrendsResearch },
];