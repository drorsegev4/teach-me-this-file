import { useState } from 'react';

// Two panes on desktop: chat on the left, the lesson canvas on the right.
// On phones one pane shows at a time, switched by the segmented control at the top.
export default function Workspace({ chatPane, canvasPane }) {
  const [tab, setTab] = useState('chat');
  const tabs = [['chat', 'Chat'], ['lesson', 'Lesson']];

  return <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
    <nav aria-label="Workspace" className="sticky top-0 z-10 border-b border-stone-200 bg-[#faf9f6]/95 p-2 backdrop-blur lg:hidden">
      <div role="tablist" className="mx-auto flex max-w-lg rounded-xl bg-stone-200/70 p-1">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`}
          onClick={() => setTab(id)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-white shadow-sm' : 'text-stone-600'}`}>{label}</button>)}
      </div>
    </nav>
    <section id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" className={`${tab === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex lg:w-[420px] lg:shrink-0 lg:border-e lg:border-stone-200`}>
      {chatPane}
    </section>
    <section id="panel-lesson" role="tabpanel" aria-labelledby="tab-lesson" className={`${tab === 'lesson' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
      {canvasPane}
    </section>
  </div>;
}
