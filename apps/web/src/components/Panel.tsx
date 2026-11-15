import type { PropsWithChildren } from 'react';
export function Panel({ title, children }: PropsWithChildren<{ title: string }>) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}
