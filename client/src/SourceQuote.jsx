export default function SourceQuote({ source }) {
  return <details className="mt-1 text-xs text-stone-600">
    <summary className="cursor-pointer py-2">Source from the file</summary>
    <blockquote dir="auto" className="mt-1 rounded-lg bg-stone-50 p-3 leading-5">“{source}”</blockquote>
  </details>;
}
