import { routes, type RoutePath } from '../app/navigation';
import { NavIcon } from './NavIcon';

const icons = ['overview', 'subject', 'insights', 'teaching', 'cases'] as const;

export function WorkflowNav({ path, onNavigate }: {
  path: RoutePath;
  onNavigate: (path: RoutePath) => void;
}) {
  return <nav className="workflow-nav" aria-label="主要流程">
    {routes.map((route, index) => <a
      key={route.path}
      className={`nav-link${path === route.path ? ' active' : ''}`}
      href={`#${route.path}`}
      aria-current={path === route.path ? 'page' : undefined}
      onClick={event => { event.preventDefault(); onNavigate(route.path); }}
    >
      <NavIcon name={icons[index]} />
      <span>{route.title}</span>
    </a>)}
  </nav>;
}
