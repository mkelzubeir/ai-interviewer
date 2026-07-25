import Link from "next/link";

const steps = [
  ["01", "Bring your context", "Paste a resume and job description, or use the complete fictional sample."],
  ["02", "Practice with intent", "Choose the interview style and answer one thoughtful question at a time."],
  ["03", "Leave with a plan", "Review evidence-based feedback and stronger answer structures."],
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f7f4] text-slate-950">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm text-white">ip</span>
          <span>interview practice</span>
        </div>
        <Link href="/interview" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Start practicing</Link>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-24">
        <div>
          <p className="mb-6 inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[.16em] text-slate-600">Text-only · private by default</p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-.055em] text-slate-950 sm:text-6xl lg:text-7xl">Practice the interview, <span className="text-[#3f675b]">not the pressure.</span></h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">A focused mock interviewer for turning your experience into clearer, more confident answers. No account, API key, or microphone needed.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/interview" className="rounded-full bg-[#3f675b] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/10 transition hover:bg-[#315248]">Begin a mock interview <span aria-hidden="true">→</span></Link>
            <a href="#how-it-works" className="rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500">How it works</a>
          </div>
          <p className="mt-5 text-xs text-slate-500">Your session is saved only in this browser.</p>
        </div>
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-8 -z-10 rounded-full bg-[#dbe8df] blur-3xl" />
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#e4f0e9] font-semibold text-[#3f675b]">MC</span><div><p className="font-semibold">Maya Chen</p><p className="text-xs text-slate-500">Product leader · interviewer</p></div></div><span className="flex items-center gap-2 text-xs font-medium text-[#3f675b]"><i className="size-2 rounded-full bg-[#5b9a75]" /> In session</span></div>
            <div className="py-8"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#3f675b]">Question 2 of 6</p><h2 className="mt-4 text-2xl font-semibold leading-tight tracking-[-.035em]">Tell me about a time customer insight changed the direction of your work.</h2><div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">Start with the situation, then explain what changed and why it mattered…</div></div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-5 text-xs text-slate-500"><span>Take your time</span><span className="font-semibold text-[#3f675b]">Adaptive follow-up next →</span></div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-white"><div className="mx-auto max-w-7xl px-6 py-20 lg:px-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#3f675b]">A clear practice loop</p><div className="mt-10 grid gap-10 md:grid-cols-3">{steps.map(([number, title, description]) => <article key={number} className="border-t border-slate-200 pt-5"><p className="text-sm font-semibold text-[#ba6547]">{number}</p><h2 className="mt-6 text-xl font-semibold tracking-tight">{title}</h2><p className="mt-3 max-w-xs leading-7 text-slate-600">{description}</p></article>)}</div></div></section>
      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-8 text-xs text-slate-500 lg:px-8"><span>Interview Practice</span><span>Sample mode runs entirely on your device.</span></footer>
    </main>
  );
}
