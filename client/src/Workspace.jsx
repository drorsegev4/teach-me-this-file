import { useEffect, useState } from 'react';

// Two panes on desktop: the teacher's Create panel on the left, the student preview on the right.
// On phones one pane shows at a time, switched by the segmented control at the top.
// `focus` moves the phone view to the pane that matters now (Create while building, Preview once ready).
export default function Workspace({ createPane, previewPane, focus }) {
  const [tab, setTab] = useState(focus);
  useEffect(() => { setTab(focus); }, [focus]);
  const tabs = [['create', 'Create'], ['preview', 'Preview']];

  return <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
    <nav aria-label="Workspace" className="sticky top-0 z-10 border-b border-stone-200 bg-[#faf9f6]/95 p-2 backdrop-blur lg:hidden">
      <div role="tablist" className="mx-auto flex max-w-lg rounded-xl bg-stone-200/70 p-1">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`}
          onClick={() => setTab(id)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-white shadow-sm' : 'text-stone-600'}`}>{label}</button>)}
      </div>
    </nav>
    <section id="panel-create" role="tabpanel" aria-labelledby="tab-create" className={`${tab === 'create' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex lg:w-[420px] lg:flex-none lg:border-e lg:border-stone-200`}>
      {createPane}
    </section>
    <section id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" className={`${tab === 'preview' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
      {previewPane}
    </section>
  </div>;
}
