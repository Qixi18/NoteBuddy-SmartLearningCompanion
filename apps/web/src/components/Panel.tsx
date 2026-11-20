import type { PropsWithChildren } from 'react';
export function Panel({ title, children, className, id }: PropsWithChildren<{ title: string; className?: string; id?: string }>) {
  return <section id={id} tabIndex={id ? -1 : undefined} className={`card${className ? ` ${className}` : ''}`}><h2>{title}</h2>{children}</section>;
}
