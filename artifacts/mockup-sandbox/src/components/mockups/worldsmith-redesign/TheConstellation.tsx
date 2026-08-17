import React from 'react';
import { Search, Plus, Sparkles, Link2, ChevronRight, Check, CircleDashed } from 'lucide-react';

export default function TheConstellation() {
  return (
    <div 
      className="flex flex-col h-screen min-h-screen w-full min-w-[1280px] bg-[#FDFAF7] text-[#1B2A4A] overflow-hidden" 
      style={{ fontFamily: "'Instrument Sans', sans-serif" }}
    >
      <style>{`
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-space { font-family: 'Space Mono', monospace; }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      {/* TOP BAR */}
      <header className="h-[52px] bg-[#1B2A4A] text-white flex items-center justify-between px-6 shrink-0 z-20 relative shadow-sm">
        <div className="flex items-center gap-6">
          <h1 className="font-playfair text-lg tracking-widest flex items-center gap-2">
            <span className="text-[#C87560]">✦</span> WYCHCOMBE
          </h1>
          <span className="text-white/50 text-[13px]">Canon Map</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-white/10 text-white/80 text-xs px-2.5 py-1 rounded-full font-medium">
            14 records
          </div>
          <button className="bg-[#C87560] text-white text-sm font-medium px-4 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-[#b06350] transition-colors">
            Add Record <Plus size={14} />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL */}
        <aside className="w-[260px] bg-[#1B2A4A] flex flex-col shrink-0 text-white relative z-10 shadow-xl">
          <div className="flex-1 overflow-y-auto p-5 pb-20 custom-scrollbar">
            
            {/* Your World Stats */}
            <div className="mb-8">
              <h2 className="text-[#C87560] text-[10px] font-bold uppercase tracking-widest mb-4">Your World</h2>
              <ul className="space-y-2.5 text-[13px] font-medium text-white/90">
                <li className="flex justify-between items-center group cursor-pointer hover:text-white transition-colors">
                  <span>Characters</span><span className="text-white/50 group-hover:text-white/80 transition-colors">3</span>
                </li>
                <li className="flex justify-between items-center group cursor-pointer hover:text-white transition-colors">
                  <span>Locations</span><span className="text-white/50 group-hover:text-white/80 transition-colors">4</span>
                </li>
                <li className="flex justify-between items-center group cursor-pointer hover:text-white transition-colors">
                  <span>Objects</span><span className="text-white/50 group-hover:text-white/80 transition-colors">2</span>
                </li>
                <li className="flex justify-between items-center group cursor-pointer hover:text-white transition-colors">
                  <span>Atmosphere</span><span className="text-white/50 group-hover:text-white/80 transition-colors">2</span>
                </li>
                <li className="flex justify-between items-center group cursor-pointer hover:text-white transition-colors">
                  <span>Lore</span><span className="text-white/50 group-hover:text-white/80 transition-colors">2</span>
                </li>
                <li className="flex justify-between items-center text-white/30 pt-1">
                  <span>Motifs</span><span>0</span>
                </li>
                <li className="flex justify-between items-center text-white/30">
                  <span>Materials</span><span>0</span>
                </li>
              </ul>
            </div>
            
            <div className="h-px w-full bg-white/10 mb-8" />
            
            {/* Canon Gaps */}
            <div>
              <h2 className="text-[#C87560] text-[15px] font-playfair italic mb-4 flex items-center gap-1.5">
                ✦ Canon Gaps
              </h2>
              <div className="space-y-3">
                {/* Gap 1 */}
                <div className="bg-[#23345A] rounded-lg p-3 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="mt-0.5 text-white/30 shrink-0"><CircleDashed size={14} /></div>
                    <div>
                      <h3 className="font-semibold text-[13px] leading-tight">No Motifs yet</h3>
                      <p className="text-white/50 text-[11px] mt-1.5 leading-relaxed">Recurring symbols tie your world together visually — what repeats in Wychcombe?</p>
                    </div>
                  </div>
                  <button className="w-full mt-2 border border-[#C87560]/40 text-[#C87560] hover:bg-[#C87560]/10 rounded text-xs font-medium py-1.5 transition-colors">
                    + Add Motif
                  </button>
                </div>
                
                {/* Gap 2 */}
                <div className="bg-[#23345A] rounded-lg p-3 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="mt-0.5 text-white/30 shrink-0"><Link2 size={14} /></div>
                    <div>
                      <h3 className="font-semibold text-[13px] leading-tight">Lady Ashmore is unlinked to any Object</h3>
                      <p className="text-white/50 text-[11px] mt-1.5 leading-relaxed">What does she carry or treasure?</p>
                    </div>
                  </div>
                  <button className="w-full mt-2 border border-white/20 text-white/70 hover:bg-white/10 rounded text-xs font-medium py-1.5 transition-colors">
                    + Explore
                  </button>
                </div>

                {/* Gap 3 */}
                <div className="bg-[#23345A] rounded-lg p-3 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-start gap-2 mb-1">
                    <div className="mt-0.5 text-[#C87560] shrink-0"><Sparkles size={14} /></div>
                    <div>
                      <p className="text-white/80 text-[12px] leading-relaxed">
                        Try combining <strong>The Glasshouse</strong> + <strong>Quiet Dread</strong> for a powerful atmosphere image
                      </p>
                    </div>
                  </div>
                  <button className="text-[#C87560] text-xs font-medium mt-1.5 hover:underline pl-6">
                    + Use this combination
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Search box */}
          <div className="p-4 bg-[#1B2A4A] border-t border-white/10 absolute bottom-0 left-0 right-0">
            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-white/70 transition-colors" />
              <input 
                type="text" 
                placeholder="Search records..." 
                className="w-full bg-white/5 border border-white/10 rounded-md py-2 pl-8 pr-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-white/30 focus:bg-white/10 transition-all"
              />
            </div>
          </div>
        </aside>

        {/* CENTER PANEL */}
        <div className="flex-1 bg-[#FDFAF7] flex flex-col relative overflow-y-auto">
          {/* Subtle Map Grid Background */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%231B2A4A'/%3E%3C/svg%3E")`,
              backgroundSize: '24px 24px'
            }}
          />

          <div className="p-10 max-w-4xl mx-auto w-full relative z-10 flex flex-col min-h-full">
            
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-16 pt-4">
              <div className="bg-[#4B688A]/10 text-[#4B688A] text-[10px] font-bold px-2.5 py-1 rounded-sm mb-4 tracking-widest uppercase">
                Location
              </div>
              <h1 className="font-playfair text-[42px] text-[#1B2A4A] mb-2">The Glasshouse</h1>
            </div>

            {/* Relationship Diagram */}
            <div className="relative w-full h-[400px] flex items-center justify-center mb-16">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 700 400">
                <g stroke="#DDD4C4" strokeWidth="1.5" fill="none">
                  {/* Center to Lady Ashmore */}
                  <line x1="350" y1="200" x2="210" y2="120" strokeDasharray="4 4" />
                  {/* Center to Fog & Gaslight */}
                  <line x1="350" y1="200" x2="500" y2="130" strokeDasharray="4 4" />
                  {/* Center to Quiet Dread */}
                  <line x1="350" y1="200" x2="420" y2="310" strokeDasharray="4 4" />
                </g>
              </svg>
              
              <div className="relative w-[700px] h-[400px]">
                {/* Center Node: The Glasshouse */}
                <div className="absolute left-[350px] top-[200px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[90px] h-[90px] bg-[#C87560] text-white rounded-full shadow-xl z-10 text-center leading-tight ring-8 ring-[#FDFAF7] hover:scale-105 transition-transform cursor-pointer">
                  <span className="font-playfair italic text-[15px]">The<br/>Glasshouse</span>
                </div>

                {/* Connected Node: Lady Ashmore */}
                <div className="absolute left-[210px] top-[120px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[68px] h-[68px] bg-[#7C5065] text-white rounded-full shadow-md z-10 text-center leading-tight hover:scale-105 transition-transform cursor-pointer ring-4 ring-[#FDFAF7]">
                  <span className="text-[11px] font-medium px-1">Lady<br/>Ashmore</span>
                </div>

                {/* Connected Node: Fog & Gaslight */}
                <div className="absolute left-[500px] top-[130px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[74px] h-[74px] bg-[#C87560] text-white rounded-full shadow-md z-10 text-center leading-tight hover:scale-105 transition-transform cursor-pointer ring-4 ring-[#FDFAF7]">
                  <span className="text-[11px] font-medium px-1">Fog &<br/>Gaslight</span>
                </div>

                {/* Connected Node: Quiet Dread */}
                <div className="absolute left-[420px] top-[310px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[64px] h-[64px] bg-[#4B5E65] text-white rounded-full shadow-md z-10 text-center leading-tight hover:scale-105 transition-transform cursor-pointer ring-4 ring-[#FDFAF7]">
                  <span className="text-[11px] font-medium px-1">Quiet<br/>Dread</span>
                </div>

                {/* Distant Node: The East Wing */}
                <div className="absolute left-[120px] top-[280px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[48px] h-[48px] bg-white border-2 border-[#DDD4C4] text-[#1B2A4A]/50 rounded-full z-10 text-center hover:border-[#C87560] hover:text-[#C87560] transition-colors cursor-pointer">
                  <span className="text-[9px] leading-tight font-medium">East<br/>Wing</span>
                </div>

                {/* Distant Node: Obsidian Mirror */}
                <div className="absolute left-[560px] top-[270px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[52px] h-[52px] bg-white border-2 border-[#DDD4C4] text-[#1B2A4A]/50 rounded-full z-10 text-center hover:border-[#C87560] hover:text-[#C87560] transition-colors cursor-pointer">
                  <span className="text-[9px] leading-tight font-medium">Obsidian<br/>Mirror</span>
                </div>
              </div>
            </div>

            {/* Essence */}
            <div className="max-w-2xl mx-auto w-full mt-auto">
              <div className="bg-white border border-[#DDD4C4] rounded-xl p-8 shadow-sm relative overflow-hidden group">
                {/* Decorative top accent */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#C87560]/20 group-hover:bg-[#C87560] transition-colors" />
                
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1B2A4A]/40">Essence</h3>
                  <button className="text-[12px] font-medium text-[#C87560] hover:underline flex items-center gap-1">
                    Edit <ChevronRight size={12} />
                  </button>
                </div>
                <p className="font-playfair text-[20px] text-[#1B2A4A] leading-relaxed">
                  An overgrown Victorian glasshouse at the edge of the estate. Iron frames tangled with wisteria, warm lantern light through broken panes.
                </p>
              </div>
            </div>
            
          </div>
        </div>

        {/* RIGHT PANEL */}
        <aside className="w-[340px] bg-[#EFE9E1] border-l border-[#DDD4C4] shrink-0 flex flex-col relative z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="flex-1 overflow-y-auto p-7">
            
            <div className="mb-8">
              <h2 className="font-playfair text-[22px] text-[#1B2A4A] mb-1.5 flex items-center gap-2">
                <span className="text-[#C87560]">✦</span> Compose a Scene
              </h2>
              <p className="text-[14px] text-[#1B2A4A]/60">Pick records to combine — we'll write the image prompt.</p>
            </div>

            <div className="mb-8">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1B2A4A]/50 mb-3.5">In your scene:</h3>
              <div className="flex flex-wrap gap-2.5">
                {/* Selected */}
                <button className="flex items-center gap-1.5 bg-[#4B688A] text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium shadow-sm hover:opacity-90 transition-opacity">
                  The Glasshouse <Check size={14} />
                </button>
                <button className="flex items-center gap-1.5 bg-[#7C5065] text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium shadow-sm hover:opacity-90 transition-opacity">
                  Lady Ashmore <Check size={14} />
                </button>
                <button className="flex items-center gap-1.5 bg-[#C87560] text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium shadow-sm hover:opacity-90 transition-opacity">
                  Fog & Gaslight <Check size={14} />
                </button>
                
                {/* Unselected */}
                <button className="bg-white border border-[#DDD4C4] text-[#1B2A4A] px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-white/50 hover:border-[#C87560]/40 transition-colors shadow-sm">
                  The East Wing
                </button>
                <button className="bg-white border border-[#DDD4C4] text-[#1B2A4A] px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-white/50 hover:border-[#C87560]/40 transition-colors shadow-sm">
                  The Obsidian Mirror
                </button>
                
                <button className="text-[#C87560] text-[13px] font-medium px-2 py-1.5 hover:underline mt-0.5">
                  + More records
                </button>
              </div>
            </div>

            <div className="h-px w-full bg-[#DDD4C4] mb-8 opacity-60" />

            <div className="mb-8">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1B2A4A]/50 mb-3.5">Your image prompt</h3>
              <div className="bg-[#FDFAF7] border-l-[3px] border-[#C87560] rounded-r-xl p-5 shadow-sm relative group transition-all hover:shadow-md">
                <p className="font-playfair italic text-[#1B2A4A] leading-relaxed text-[16px]">
                  "Lady Ashmore standing in the doorway of The Glasshouse at night, fog and gaslight, iron frames tangled with wisteria through broken panes, Victorian Gothic atmosphere, moody and evocative"
                </p>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="bg-white border border-[#DDD4C4] text-[#1B2A4A] text-[11px] font-medium px-2.5 py-1 rounded shadow-sm hover:bg-[#F4EFE8] transition-colors">
                    Edit text
                  </button>
                </div>
              </div>
            </div>

            <button className="w-full bg-[#C87560] hover:bg-[#b06350] text-white h-[52px] rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-colors mb-10 shadow-md hover:shadow-lg text-[15px]">
              <Sparkles size={18} /> Generate Image
            </button>

            <div className="h-px w-full bg-[#DDD4C4] mb-8 opacity-60" />

            <div>
              <h3 className="text-[13px] font-semibold text-[#C87560] mb-4 flex items-center gap-1.5">
                ✦ Suggested Combinations
              </h3>
              <div className="flex flex-col gap-3">
                <button className="bg-white border border-[#DDD4C4] text-[#1B2A4A] hover:border-[#C87560] hover:text-[#C87560] hover:shadow-md text-left px-5 py-3.5 rounded-xl text-[13px] font-medium transition-all flex items-center justify-between group shadow-sm">
                  <span className="truncate">The Glasshouse + Quiet Dread</span>
                  <ChevronRight size={16} className="text-[#DDD4C4] group-hover:text-[#C87560] shrink-0 transition-colors" />
                </button>
                <button className="bg-white border border-[#DDD4C4] text-[#1B2A4A] hover:border-[#C87560] hover:text-[#C87560] hover:shadow-md text-left px-5 py-3.5 rounded-xl text-[13px] font-medium transition-all flex items-center justify-between group shadow-sm">
                  <span className="truncate">Lady Ashmore + Obsidian Mirror</span>
                  <ChevronRight size={16} className="text-[#DDD4C4] group-hover:text-[#C87560] shrink-0 transition-colors" />
                </button>
              </div>
            </div>
            
          </div>
        </aside>
      </main>
    </div>
  );
}
