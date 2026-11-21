export function printReport(id: 'case-report' | 'class-report' | 'student-handout') {
  const report = document.getElementById(id);
  if (!report || document.body.dataset.printReport) return;

  const collapsed = [...report.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
  document.body.dataset.printReport = id;
  collapsed.forEach(detail => { detail.open = true; });
  const restore = () => {
    delete document.body.dataset.printReport;
    collapsed.forEach(detail => { detail.open = false; });
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  try {
    window.print();
  } catch (error) {
    restore();
    throw error;
  }
}
