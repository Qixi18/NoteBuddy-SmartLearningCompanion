import { useLayoutEffect, useRef } from 'react';

type AutoResizeTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  rows?: number;
  resizeKey?: string | number;
};

export function AutoResizeTextarea({ rows = 3, resizeKey, onInput, ...props }: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    const parent = textarea?.parentElement;
    if (!textarea || !parent) return;
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight, rows * 24)}px`;
    };
    resize();
    let lastWidth = parent.getBoundingClientRect().width;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? lastWidth;
      if (Math.abs(width - lastWidth) > 0.5) {
        lastWidth = width;
        resize();
      }
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [props.value, rows, resizeKey]);

  return <textarea {...props} ref={ref} rows={rows} onInput={event => { onInput?.(event); const node = event.currentTarget; node.style.height = 'auto'; node.style.height = `${Math.max(node.scrollHeight, rows * 24)}px`; }}/>;
}
