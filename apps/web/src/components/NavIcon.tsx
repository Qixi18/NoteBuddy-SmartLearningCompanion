type NavIconName = 'overview' | 'subject' | 'insights' | 'teaching' | 'cases';

const paths: Record<NavIconName, string> = {
  overview: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6',
  subject: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 4.5v17M8 6h8M8 9h8',
  insights: 'M4 19V5M4 19h17M7 15l4-4 3 2 5-7M18 6h1v1',
  teaching: 'M12 3 3 8l9 5 9-5-9-5ZM6 10v5l6 3 6-3v-5M21 8v6',
  cases: 'M4 5h16v14H4zM8 9h8M8 12h8M8 15h5',
};

export function NavIcon({ name }: { name: NavIconName }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
