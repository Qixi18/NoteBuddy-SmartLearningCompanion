import type { PropsWithChildren } from 'react';
export function Panel({ title, children, className }: PropsWithChildren<{ title: string; className?: string }>) {
  return <section className={`card${className ? ` ${className}` : ''}`}><h2>{title}</h2>{children}</section>;
}
